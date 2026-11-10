import { useEffect, useRef, useState } from 'preact/hooks';
import { DAILY_ORDERS } from '../core/board';
import { itemName, itemValue, type Content, type VillagerDef } from '../core/content';
import { cratePrice, hasFlag, hasItems, nextReady, unlockedCrops } from '../core/farm';
import { xpToNext } from '../core/progression';
import { fromSaveCode, toSaveCode } from '../core/save';
import { canAffordBuilding, queueView, readyCount, slotUpgradeCost } from '../core/processing';
import { featuredCrop, marketOpen, marketPrice, nextExpansion, priceFactor } from '../core/shop';
import { activeQuest, canHandIn, inbox, objectiveText, target, unreadCount, waitingFor, type TalkResult } from '../core/story';
import { formatDuration } from '../core/time';
import type { Game } from '../game';
import { lastSavedAt } from '../platform/storage';
import { Icon } from './icons';

function useGame(game: Game): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = game.subscribe(() => setTick((t) => t + 1));
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [game]);
  return game.now();
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const seenHint = (): boolean => {
  try {
    if (localStorage.getItem('cropsy:hint')) return true;
    localStorage.setItem('cropsy:hint', '1');
  } catch {
    /* private mode: show it every session */
  }
  return false;
};
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

type Sheet = 'barn' | 'board' | 'mail' | 'settings' | 'town' | `building:${string}` | null;
type Dialogue = { villager: VillagerDef; lines: string[]; index: number; done?: string };
type Flyer = { id: number; x: number; y: number; go: boolean };

export function App({ game, updateReady, onUpdate, debug }: { game: Game; updateReady: boolean; onUpdate: () => void; debug: boolean }) {
  const now = useGame(game);
  const s = game.state;
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);
  const [installHint, setInstallHint] = useState(false);
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  const [coinBump, setCoinBump] = useState(0);
  const [levelCard, setLevelCard] = useState<number | null>(null);
  const coinRef = useRef<HTMLDivElement>(null);

  const fly = (x: number, y: number, n: number) => {
    const target = coinRef.current?.getBoundingClientRect();
    if (!target) return;
    const made: Flyer[] = Array.from({ length: Math.min(6, Math.max(1, Math.ceil(n / 5))) }, (_, i) => ({ id: Date.now() + Math.random() + i, x: x + (i - 2) * 10, y, go: false }));
    setFlyers((f) => [...f, ...made]);
    requestAnimationFrame(() => requestAnimationFrame(() => setFlyers((f) => f.map((c) => (made.some((m) => m.id === c.id) ? { ...c, go: true } : c)))));
    window.setTimeout(() => {
      setFlyers((f) => f.filter((c) => !made.some((m) => m.id === c.id)));
      setCoinBump((b) => b + 1);
    }, 650);
  };

  useEffect(() => {
    const offFx = game.onFx((e) => {
      if (e.kind === 'levelup') setLevelCard(e.level);
      if (e.kind === 'ribbon') setToast(`+${e.amount} Ribbon · ${e.why}`);
      if (e.kind === 'quest') setToast(e.done ? `Quest complete: ${e.title}` : `New quest: ${e.title}`);
      if (e.kind === 'expand') setToast('The back field is open!');
      if (e.kind === 'coins') fly(window.innerWidth / 2, window.innerHeight - 200, e.amount);
      if (e.kind === 'harvest' && !isStandalone() && isIOS() && !seenHint()) {
        setInstallHint(true);
      }
    });
    const offScreen = game.onScreenFx((e) => {
      if (e.kind === 'coin-fly') fly(e.x, e.y, e.amount);
      if (e.kind === 'open-building') setSheet(`building:${e.id}`);
    });
    return () => {
      offFx();
      offScreen();
    };
  }, [game]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const need = xpToNext(s.level);
  const ready = nextReady(s, now);
  const unlocked = new Set(unlockedCrops(s, game.content).map((c) => c.id));
  const quest = activeQuest(s, game.content);
  const active = s.story.active;
  const giver = quest && quest.giver !== 'mail' ? game.content.villagers.get(quest.giver) : undefined;
  const mailUnread = unreadCount(s, now);
  const barnCount = Object.entries(s.inventory)
    .filter(([id]) => game.content.cropById.has(id))
    .reduce((a, [, n]) => a + n, 0);
  const boardOpen = hasFlag(s, 'board_open');
  const fillable = s.board.orders.filter((o) => hasItems(s, o.wants)).length;
  const canReplant = Object.keys(s.lastCrop).some((k) => s.plots[k] && !s.plots[k].crop && !s.obstacles[k]);

  const openTalk = () => {
    if (!giver) return;
    const r: TalkResult = game.talk();
    if (r.kind === 'none') return;
    setDialogue({ villager: giver, lines: r.lines.length ? r.lines : ['…'], index: 0, done: r.kind === 'outro' ? r.quest.title : undefined });
  };

  return (
    <div class="ui">
      <header class="hud">
        <div class="level" aria-label={`Level ${s.level}`}>
          <span class="star">{s.level}</span>
          <div class="xp">
            <div class="xp-label">
              LV {s.level} <small>{s.xp}/{need}</small>
            </div>
            <div class="xp-bar">
              <div style={{ width: `${Math.min(100, (s.xp / need) * 100)}%` }} />
            </div>
          </div>
        </div>
        <div class={`pill coins bump${coinBump % 2}`} ref={coinRef} aria-label={`${s.coins} coins`}>
          <span class="coin" aria-hidden="true" />
          {s.coins.toLocaleString()}
        </div>
        <div class="pill ribbons" aria-label={`${s.ribbons} Ribbons`}>
          <Icon name="ribbon" size={22} />
          {s.ribbons}
        </div>
        <button class="round" aria-label="Settings" onClick={() => setSheet('settings')}>
          <Icon name="menu" />
        </button>
      </header>

      {quest && active && (
        <button class="tracker" onClick={() => (giver ? openTalk() : setSheet('mail'))}>
          <span class="tracker-title">{quest.title}</span>
          {active.status === 'offered' ? (
            <span class="tracker-obj">Tap {giver?.name.split(' ')[0]} to start</span>
          ) : active.status === 'ready' ? (
            <span class="tracker-obj done">Done! Tap {giver?.name.split(' ')[0]} to hand in</span>
          ) : (
            quest.objectives.map((o, i) => (
              <span class="tracker-obj" key={i}>
                {objectiveText(o, game.content)}
                {o.type !== 'hand_in' && o.type !== 'read_mail' && target(o) > 1 && (
                  <b>
                    {' '}
                    {active.progress[i]}/{target(o)}
                  </b>
                )}
              </span>
            ))
          )}
        </button>
      )}

      {!quest && (() => {
        const w = waitingFor(s, game.content);
        if (!w) return null;
        return (
          <div class="tracker waiting">
            <span class="tracker-title">Coming up: {w.title}</span>
            <span class="tracker-obj">{w.level ? `Reach level ${w.level}` : 'Check your mailbox tomorrow'}</span>
          </div>
        );
      })()}

      {ready !== null && <div class="next-ready">Next harvest in {formatDuration(ready)}</div>}
      {toast && (
        <div class="toast" role="status">
          {toast}
        </div>
      )}
      {updateReady && (
        <button class="toast update" onClick={onUpdate}>
          A fresh harvest of updates is ready — tap to update
        </button>
      )}

      {giver && active && (
        <button class="visitor" onClick={openTalk} aria-label={`Talk to ${giver.name}`}>
          <Portrait v={giver} size={58} />
          <span class={`bubble ${active.status}`}>{active.status === 'offered' ? '!' : active.status === 'ready' || (quest && canHandIn(s, quest) && quest.objectives.some((o) => o.type === 'hand_in')) ? '✓' : '…'}</span>
          <span class="visitor-name">{giver.name.split(' ')[0]}</span>
        </button>
      )}

      {installHint && (
        <div class="modal-back">
          <div class="card" role="dialog" aria-labelledby="install-title">
            <h2 id="install-title">Keep your farm safe</h2>
            <p class="muted">
              Safari can clear saved games for websites that aren't on your home screen. Tap <Icon name="share" size={16} /> <b>Share</b>, then <b>Add to Home Screen</b>, and play Cropsy from there.
            </p>
            <button class="btn green" onClick={() => setInstallHint(false)}>
              Got it
            </button>
          </div>
        </div>
      )}

      <section class="tray" aria-label="Seeds">
        <div class="seeds">
          {game.content.crops.map((c) => {
            const locked = !unlocked.has(c.id);
            const selected = game.selectedCrop === c.id;
            return (
              <button key={c.id} class={`seed${selected ? ' selected' : ''}${locked ? ' locked' : ''}`} disabled={locked} aria-pressed={selected} aria-label={`${c.name}${locked ? `, unlocks at level ${c.unlock_level}` : ''}`} onClick={() => game.selectCrop(c.id)}>
                <span class="seed-icon" style={{ background: c.color }} aria-hidden="true" />
                <span class="seed-name">{c.name}</span>
                {locked ? (
                  <span class="chip lock">Lv {c.unlock_level}</span>
                ) : (
                  <span class="seed-meta">
                    <span class="chip time">{formatDuration(c.grow_s)}</span>
                    <span class="cost">
                      <span class="coin sm" aria-hidden="true" />
                      {c.seed_cost}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
          <button class="seed replant" disabled={!canReplant} onClick={() => game.replantAll()}>
            <Icon name="replant" size={30} />
            <span class="seed-name">Replant all</span>
          </button>
        </div>
      </section>

      <nav class="nav" aria-label="Farm menu">
        <NavBtn icon="farm" label="Farm" active={sheet === null} onClick={() => setSheet(null)} />
        <NavBtn icon="barn" label="Barn" badge={barnCount} active={sheet === 'barn'} onClick={() => setSheet('barn')} />
        <NavBtn icon="board" label="Board" badge={boardOpen ? fillable : 0} locked={!boardOpen} active={sheet === 'board'} onClick={() => boardOpen && setSheet('board')} />
        <NavBtn icon="town" label="Town" active={sheet === 'town'} onClick={() => setSheet('town')} />
        <NavBtn icon="mail" label="Mail" badge={mailUnread} active={sheet === 'mail'} onClick={() => setSheet('mail')} />
      </nav>

      {sheet === 'barn' && <BarnSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'board' && <BoardSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'mail' && <MailSheet game={game} now={now} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <Settings game={game} onClose={() => setSheet(null)} debug={debug} />}
      {sheet === 'town' && <TownSheet game={game} onClose={() => setSheet(null)} />}
      {sheet?.startsWith('building:') && <BuildingSheet game={game} id={sheet.slice(9)} now={now} onClose={() => setSheet(null)} />}

      {levelCard !== null && <LevelCard content={game.content} level={levelCard} onClose={() => setLevelCard(null)} />}

      {dialogue && (
        <div class="dialogue-back" onClick={() => (dialogue.index < dialogue.lines.length - 1 ? setDialogue({ ...dialogue, index: dialogue.index + 1 }) : setDialogue(null))}>
          <div class="dialogue" role="dialog" aria-label={`${dialogue.villager.name} says`}>
            <Portrait v={dialogue.villager} size={72} />
            <div class="dialogue-body">
              <div class="dialogue-name">{dialogue.villager.name}</div>
              <p>{dialogue.lines[dialogue.index]}</p>
              {dialogue.done && dialogue.index === dialogue.lines.length - 1 && <div class="quest-done">Quest complete: {dialogue.done}</div>}
              <div class="dialogue-next">{dialogue.index < dialogue.lines.length - 1 ? 'Tap to continue ▸' : 'Tap to close'}</div>
            </div>
          </div>
        </div>
      )}

      {game.away && (
        <div class="modal-back">
          <div class="card" role="dialog" aria-labelledby="away-title">
            <h2 id="away-title">While you were away</h2>
            <p class="muted">{formatDuration(game.away.awaySeconds)} went by on the farm.</p>
            <ul class="away-list">
              {game.away.ripe.map((r) => (
                <li key={r.crop}>
                  <b>{r.count}×</b> {r.crop} ready to harvest
                </li>
              ))}
              {game.away.newMail > 0 && <li>{game.away.newMail === 1 ? 'A letter arrived' : `${game.away.newMail} letters arrived`} in your mailbox</li>}
              {game.away.newOrders && <li>New orders are pinned on the request board</li>}
            </ul>
            <button class="btn green" onClick={() => game.dismissAway()}>
              Let's go!
            </button>
          </div>
        </div>
      )}

      <div class="flyers" aria-hidden="true">
        {flyers.map((f) => {
          const t = coinRef.current?.getBoundingClientRect();
          const tx = t ? t.left + 18 : 0;
          const ty = t ? t.top + 18 : 0;
          return <span key={f.id} class="coin flyer" style={{ transform: f.go ? `translate(${tx}px, ${ty}px) scale(0.7)` : `translate(${f.x}px, ${f.y}px)` }} />;
        })}
      </div>
    </div>
  );
}

function NavBtn({ icon, label, badge, active, locked, onClick }: { icon: string; label: string; badge?: number; active?: boolean; locked?: boolean; onClick: () => void }) {
  return (
    <button class={`nav-btn${active ? ' active' : ''}${locked ? ' locked' : ''}`} onClick={onClick} aria-label={`${label}${badge ? `, ${badge}` : ''}${locked ? ', locked' : ''}`}>
      <Icon name={locked ? 'lock' : icon} size={26} />
      <span>{label}</span>
      {!!badge && <span class="badge">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );
}

export function Portrait({ v, size }: { v: VillagerDef; size: number }) {
  return (
    <svg class="portrait" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={v.name}>
      <circle cx="32" cy="32" r="30" fill={v.color} stroke="#4a2e1a" stroke-width="3" />
      <path d="M12 60c2-12 10-18 20-18s18 6 20 18" fill="#fff8e6" stroke="#4a2e1a" stroke-width="3" />
      <circle cx="32" cy="28" r="13" fill="#f6c9a0" stroke="#4a2e1a" stroke-width="3" />
      <path d="M19 26c0-9 6-14 13-14s13 5 13 14c-4-4-9-6-13-6s-9 2-13 6z" fill={v.hair} stroke="#4a2e1a" stroke-width="2.5" />
      <circle cx="27" cy="29" r="1.8" fill="#4a2e1a" />
      <circle cx="37" cy="29" r="1.8" fill="#4a2e1a" />
      <path d="M28 34c2 2 6 2 8 0" fill="none" stroke="#4a2e1a" stroke-width="2" stroke-linecap="round" />
    </svg>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: preact.ComponentChildren }) {
  return (
    <div class="sheet-back" onClick={onClose}>
      <div class="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-head">
          <h2>{title}</h2>
          <button class="x" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

function BarnSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const crops = [...game.content.crops, ...game.content.goods.values()].filter((c) => (s.inventory[c.id] ?? 0) > 0);
  const materials = game.content.economy.materials.map((m) => m.id).filter((m) => (s.inventory[m] ?? 0) > 0);
  const total = crops.reduce((a, c) => a + cratePrice(c) * (s.inventory[c.id] ?? 0), 0);
  return (
    <Sheet title="Barn" onClose={onClose}>
      {!crops.length && !materials.length && <p class="muted">Your barn is empty. Harvested crops land here.</p>}
      {crops.length > 0 && (
        <>
          <h3>Crops and goods</h3>
          <ul class="rows">
            {crops.map((c) => (
              <li key={c.id} class="row-item">
                <span class="seed-icon sm" style={{ background: c.color }} aria-hidden="true" />
                <span class="row-name">
                  {c.name} <b>×{s.inventory[c.id]}</b>
                </span>
                <button class="btn small" onClick={() => game.sell(c.id, 1)}>
                  Sell 1 · {cratePrice(c)}
                </button>
              </li>
            ))}
          </ul>
          <button class="btn green" onClick={() => game.sellAll()}>
            Ship everything · {total} coins
          </button>
          <p class="muted small">The shipping crate pays 70% of a crop's value. Board orders pay much more.</p>
        </>
      )}
      {materials.length > 0 && (
        <>
          <h3>Materials</h3>
          <ul class="rows">
            {materials.map((m) => (
              <li key={m} class="row-item">
                <Icon name={m} size={26} />
                <span class="row-name">
                  {itemName(game.content, m)} <b>×{s.inventory[m]}</b>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function BoardSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const orders = s.board.orders;
  return (
    <Sheet title="Request board" onClose={onClose}>
      {!orders.length && <p class="muted">All orders filled! New ones are pinned every morning ({DAILY_ORDERS} a day).</p>}
      <ul class="orders">
        {orders.map((o) => {
          const v = game.content.villagers.get(o.villager);
          const ok = hasItems(s, o.wants);
          return (
            <li key={o.id} class={`order${o.story ? ' story' : ''}`}>
              {v && <Portrait v={v} size={44} />}
              <div class="order-body">
                <div class="order-who">
                  {v?.name.split(' ')[0]}
                  {o.story && <span class="chip story">Story</span>}
                </div>
                <div class="order-wants">
                  {Object.entries(o.wants).map(([id, n]) => (
                    <span key={id} class={(s.inventory[id] ?? 0) >= n ? 'have' : 'need'}>
                      {Math.min(s.inventory[id] ?? 0, n)}/{n} {itemName(game.content, id)}
                    </span>
                  ))}
                </div>
                <div class="order-reward">
                  <span class="coin sm" aria-hidden="true" /> {o.coins} · {o.xp} XP
                </div>
              </div>
              <button class={`btn small${ok ? ' green' : ''}`} disabled={!ok} onClick={() => game.fulfilOrder(o.id)}>
                Deliver
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function MailSheet({ game, now, onClose }: { game: Game; now: number; onClose: () => void }) {
  const mail = inbox(game.state, now);
  const [open, setOpen] = useState<string | null>(mail.find((m) => !m.read)?.id ?? null);
  const letter = open ? game.content.letters.get(open) : null;
  useEffect(() => {
    if (open) game.readMail(open);
  }, [open]);
  if (letter) {
    const from = game.content.villagers.get(letter.from);
    return (
      <Sheet title={letter.subject} onClose={onClose}>
        <div class="letter">
          {from && (
            <div class="letter-from">
              <Portrait v={from} size={40} /> From {from.name}
            </div>
          )}
          <p class="letter-body">{letter.body}</p>
        </div>
        <button class="btn" onClick={() => setOpen(null)}>
          Back to mailbox
        </button>
      </Sheet>
    );
  }
  return (
    <Sheet title="Mailbox" onClose={onClose}>
      {!mail.length && <p class="muted">No letters yet.</p>}
      <ul class="rows">
        {mail.map((m) => {
          const l = game.content.letters.get(m.id);
          const from = l ? game.content.villagers.get(l.from) : undefined;
          return (
            <li key={m.id}>
              <button class={`row-item mail-row${m.read ? '' : ' unread'}`} onClick={() => setOpen(m.id)}>
                <Icon name="mail" size={24} />
                <span class="row-name">
                  {l?.subject}
                  <small>{from?.name}</small>
                </span>
                {!m.read && <span class="dot" aria-label="unread" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function Settings({ game, onClose, debug }: { game: Game; onClose: () => void; debug: boolean }) {
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const saved = lastSavedAt();
  const s = game.state;
  return (
    <Sheet title="Settings" onClose={onClose}>
      <label class="toggle">
        <input type="checkbox" checked={!s.settings.muted} onChange={(e) => game.setMuted(!(e.target as HTMLInputElement).checked)} />
        <span>Sound effects</span>
      </label>
      <p class="muted">Last saved {saved ? new Date(saved).toLocaleTimeString() : 'not yet'}.</p>
      <label class="field">
        <span>Backup code</span>
        <textarea rows={3} value={code} onInput={(e) => setCode((e.target as HTMLTextAreaElement).value)} placeholder="Tap “Copy backup code”, or paste one here to restore" />
      </label>
      <div class="row">
        <button
          class="btn"
          onClick={async () => {
            const c = toSaveCode(game.state);
            setCode(c);
            try {
              await navigator.clipboard.writeText(c);
              setMsg('Copied! Keep it somewhere safe.');
            } catch {
              setMsg('Select the code above and copy it.');
            }
          }}
        >
          Copy backup code
        </button>
        <button
          class="btn"
          onClick={() => {
            try {
              game.replaceState(fromSaveCode(code));
              setMsg('Farm restored.');
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Restore
        </button>
      </div>
      {msg && (
        <p class="muted" role="status">
          {msg}
        </p>
      )}
      {debug && (
        <>
          <h3>Debug</h3>
          <div class="row">
            <button class="btn small" onClick={() => game.skip(60)}>
              +1 min
            </button>
            <button class="btn small" onClick={() => game.skip(3600)}>
              +1 h
            </button>
            <button class="btn small" onClick={() => game.skip(86400)}>
              +1 day
            </button>
          </div>
          <p class="muted small">
            Quest: {s.story.active?.id ?? 'none'} ({s.story.active?.status}) · done {s.story.done.length} · flags {s.flags.join(', ') || 'none'}
          </p>
          <details>
            <summary>Event log ({s.log.length})</summary>
            <pre class="log">
              {s.log
                .slice(-40)
                .reverse()
                .map((l) => `${new Date(l.t * 1000).toLocaleString()}  ${l.e}`)
                .join('\n')}
            </pre>
          </details>
        </>
      )}
    </Sheet>
  );
}

function LevelCard({ content, level, onClose }: { content: Content; level: number; onClose: () => void }) {
  const items: string[] = [];
  for (const c of content.crops) if (c.unlock_level === level) items.push(`New seed: ${c.name}`);
  for (const b of content.buildings.values()) if (b.unlock_level === level) items.push(`New building in Town: ${b.name}`);
  for (const t of content.tools.values()) if (t.unlock_level === level) items.push(`New tool in Town: ${t.name}`);
  for (const e of content.economy.expansions) if (e.level === level) items.push(`Bruno can expand your farm to ${e.size}×${e.size}`);
  if (content.economy.market.unlock_level === level) items.push('The market stall is open in Town');
  for (const q of content.quests) if (q.min_level === level) items.push(`A new chapter of the story begins`);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="card level-card" role="dialog" aria-labelledby="lvl-title">
        <div class="big-star" aria-hidden="true">{level}</div>
        <h2 id="lvl-title">Level {level}!</h2>
        <p class="muted">+1 Ribbon</p>
        {items.length > 0 && (
          <ul class="away-list">
            {items.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        <button class="btn green" onClick={onClose}>
          Hooray!
        </button>
      </div>
    </div>
  );
}

function Need({ have, need, label }: { have: number; need: number; label: string }) {
  return <span class={have >= need ? 'have' : 'need'}>{Math.min(have, need)}/{need} {label}</span>;
}

function TownSheet({ game, onClose }: { game: Game; onClose: () => void }) {
  const s = game.state;
  const c = game.content;
  const tabs = ['store', 'land', ...(marketOpen(s, c) ? ['market'] : []), ...(s.flags.includes('mill_project') ? ['projects'] : [])];
  const [tab, setTab] = useState<string>(tabs.includes('projects') && (s.projects.mill ?? 0) < 3 ? 'projects' : 'store');
  const day = game.day();
  const exp = nextExpansion(s, c);
  return (
    <Sheet title="Bramblewick" onClose={onClose}>
      <div class="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'store' ? "Goldie's store" : t === 'land' ? 'Land' : t === 'market' ? 'Market' : 'Projects'}
          </button>
        ))}
      </div>

      {tab === 'store' && (
        <>
          <h3>Tools</h3>
          <ul class="rows">
            {[...c.tools.values()].map((t) => {
              const owned = s.tools.includes(t.id);
              const locked = t.unlock_level > s.level;
              return (
                <li key={t.id} class="row-item">
                  <Icon name={t.id} size={30} />
                  <span class="row-name">
                    {t.name}
                    <small>{locked ? `Unlocks at level ${t.unlock_level}` : t.description}</small>
                  </span>
                  {owned ? (
                    <span class="chip owned">Owned</span>
                  ) : (
                    <button class="btn small" disabled={locked || s.coins < t.coins} onClick={() => game.buyTool(t.id)}>
                      <span class="coin sm" aria-hidden="true" /> {t.coins}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <h3>Buildings</h3>
          <ul class="rows">
            {[...c.buildings.values()]
              .filter((b) => b.where === 'farm')
              .map((b) => {
                const owned = !!s.buildings[b.id];
                const locked = (b.unlock_level ?? 1) > s.level;
                const r = b.recipes[0];
                return (
                  <li key={b.id} class="row-item">
                    <Icon name="building" size={30} />
                    <span class="row-name">
                      {b.name}
                      <small>
                        {locked
                          ? `Unlocks at level ${b.unlock_level}`
                          : `${Object.entries(r.inputs)
                              .map(([id, n]) => `${n} ${itemName(c, id)}`)
                              .join(' + ')} → ${itemName(c, r.output)}`}
                      </small>
                      {!owned && !locked && b.cost?.items && (
                        <small class="needs">
                          {Object.entries(b.cost.items).map(([id, n]) => (
                            <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
                          ))}
                        </small>
                      )}
                    </span>
                    {owned ? (
                      <span class="chip owned">Built</span>
                    ) : (
                      <button class="btn small" disabled={locked || !canAffordBuilding(s, b)} onClick={() => game.buyBuilding(b.id)}>
                        <span class="coin sm" aria-hidden="true" /> {b.cost?.coins ?? 0}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </>
      )}

      {tab === 'land' && (
        <div class="land">
          <p class="muted">
            Your field is {s.width}×{s.height}.
          </p>
          {!exp && <p class="muted">Bruno says your farm is as big as the valley allows. For now.</p>}
          {exp?.story && <p class="muted">Bruno will look at your sorry old gate once you've met him in the story.</p>}
          {exp && !exp.story && (
            <div class="order">
              <Portrait v={c.villagers.get('bruno')!} size={44} />
              <div class="order-body">
                <div class="order-who">
                  Expand to {exp.size}×{exp.size}
                </div>
                <div class="order-wants">
                  {(exp.level ?? 1) > s.level && <span class="need">Level {exp.level}</span>}
                  <Need have={s.coins} need={exp.coins ?? 0} label="coins" />
                  {Object.entries(exp.items ?? {}).map(([id, n]) => (
                    <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
                  ))}
                </div>
              </div>
              <button class="btn small green" onClick={() => game.buyExpansion()} disabled={(exp.level ?? 1) > s.level || s.coins < (exp.coins ?? 0) || !Object.entries(exp.items ?? {}).every(([id, n]) => (s.inventory[id] ?? 0) >= n)}>
                Build
              </button>
            </div>
          )}
          <p class="muted small">New land comes with weeds, stumps and boulders to clear. Stumps need a saw and boulders a pickaxe.</p>
        </div>
      )}

      {tab === 'market' && <MarketTab game={game} day={day} />}

      {tab === 'projects' && (
        <div class="projects">
          {[...c.projects.values()].map((p) => {
            const done = s.projects[p.id] ?? 0;
            const st = p.stages[done];
            return (
              <div key={p.id} class="project">
                <div class="project-head">
                  <b>{p.name}</b>
                  <span class="chip story">
                    {Math.min(done, p.stages.length)}/{p.stages.length}
                  </span>
                </div>
                <div class="stages">
                  {p.stages.map((x, i) => (
                    <span key={i} class={`stage${i < done ? ' done' : i === done ? ' current' : ''}`}>
                      {x.label}
                    </span>
                  ))}
                </div>
                {st ? (
                  <div class="order">
                    <div class="order-body">
                      <div class="order-who">Next: {st.label}</div>
                      <div class="order-wants">
                        {Object.entries(st.items ?? {}).map(([id, n]) => (
                          <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
                        ))}
                        {st.coins ? <Need have={s.coins} need={st.coins} label="coins" /> : null}
                      </div>
                    </div>
                    <button
                      class="btn small green"
                      disabled={!Object.entries(st.items ?? {}).every(([id, n]) => (s.inventory[id] ?? 0) >= n) || s.coins < (st.coins ?? 0)}
                      onClick={() => game.deliverProject(p.id)}
                    >
                      Deliver
                    </button>
                  </div>
                ) : (
                  <p class="muted">Restored!</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function MarketTab({ game, day }: { game: Game; day: number }) {
  const s = game.state;
  const c = game.content;
  const featured = featuredCrop(s, c, day);
  const sellable = Object.keys(s.inventory).filter((id) => itemValue(c, id) !== null);
  return (
    <>
      <p class="muted small">Prices change every morning. The featured crop pays extra today.</p>
      {featured && (
        <div class="featured">
          <span class="seed-icon sm" style={{ background: c.cropById.get(featured)?.color }} aria-hidden="true" />
          Today's featured crop: <b>{itemName(c, featured)}</b> · {marketPrice(s, c, featured, day)} each
        </div>
      )}
      {!sellable.length && <p class="muted">Nothing to sell yet. Harvested crops and goods from your barn can be sold here.</p>}
      <ul class="rows">
        {sellable.map((id) => {
          const f = priceFactor(s, c, id, day);
          const price = marketPrice(s, c, id, day);
          return (
            <li key={id} class="row-item">
              <span class="seed-icon sm" style={{ background: c.cropById.get(id)?.color ?? c.goods.get(id)?.color }} aria-hidden="true" />
              <span class="row-name">
                {itemName(c, id)} <b>×{s.inventory[id]}</b>
                <small class={f >= 1 ? 'up' : 'down'}>
                  {f >= 1 ? '▲' : '▼'} {price} each ({Math.round(f * 100)}%)
                </small>
              </span>
              <button class="btn small" onClick={() => game.marketSell(id, 1)}>
                Sell 1
              </button>
              <button class="btn small green" onClick={() => game.marketSell(id, s.inventory[id] ?? 0)}>
                All
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function BuildingSheet({ game, id, now, onClose }: { game: Game; id: string; now: number; onClose: () => void }) {
  const s = game.state;
  const c = game.content;
  const def = c.buildings.get(id);
  const b = s.buildings[id];
  if (!def) return null;
  if (!b) {
    const done = s.projects[id] ?? 0;
    return (
      <Sheet title={def.name} onClose={onClose}>
        <p class="muted">{done >= 3 ? 'Bruno is fitting the new wheel. Check your mailbox in the morning.' : 'The old mill is falling apart. Restore it through the project in Town.'}</p>
      </Sheet>
    );
  }
  const view = queueView(b, now);
  const ready = readyCount(b, now);
  const upCost = slotUpgradeCost(c, b, def);
  return (
    <Sheet title={def.name} onClose={onClose}>
      <div class="queue">
        {Array.from({ length: b.slots }, (_, i) => {
          const q = view[i];
          const r = q ? def.recipes.find((x) => x.id === q.item.recipe) : null;
          const out = r ? c.goods.get(r.output) : null;
          return (
            <div key={i} class={`slot ${q?.status ?? 'empty'}`}>
              {out ? <span class="seed-icon sm" style={{ background: out.color }} aria-hidden="true" /> : <span class="slot-empty">+</span>}
              <span class="slot-label">{q ? (q.status === 'done' ? 'Ready' : q.status === 'working' ? formatDuration(q.remaining) : 'Waiting') : 'Empty'}</span>
            </div>
          );
        })}
      </div>
      <div class="row">
        <button class="btn green" disabled={!ready} onClick={() => game.collect(id)}>
          Collect {ready ? ready : ''}
        </button>
        {upCost !== null && (
          <button class="btn" disabled={s.ribbons < upCost} onClick={() => game.upgradeSlots(id)}>
            +1 slot · <Icon name="ribbon" size={16} /> {upCost}
          </button>
        )}
      </div>
      <h3>Make</h3>
      <ul class="rows">
        {def.recipes.map((r) => {
          const ok = Object.entries(r.inputs).every(([k, n]) => (s.inventory[k] ?? 0) >= n);
          return (
            <li key={r.id} class="row-item">
              <span class="seed-icon sm" style={{ background: c.goods.get(r.output)?.color }} aria-hidden="true" />
              <span class="row-name">
                {itemName(c, r.output)} <small>{formatDuration(r.dur_s)}</small>
                <small class="needs">
                  {Object.entries(r.inputs).map(([k, n]) => (
                    <Need key={k} have={s.inventory[k] ?? 0} need={n} label={itemName(c, k)} />
                  ))}
                </small>
              </span>
              <button class="btn small green" disabled={!ok || b.queue.length >= b.slots} onClick={() => game.startRecipe(id, r.id)}>
                Start
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
