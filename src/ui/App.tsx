import { useEffect, useRef, useState } from 'preact/hooks';
import { DAILY_ORDERS } from '../core/board';
import { itemName, type VillagerDef } from '../core/content';
import { cratePrice, hasFlag, hasItems, nextReady, unlockedCrops } from '../core/farm';
import { xpToNext } from '../core/progression';
import { fromSaveCode, toSaveCode } from '../core/save';
import { activeQuest, canHandIn, inbox, objectiveText, target, unreadCount, type TalkResult } from '../core/story';
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

type Sheet = 'barn' | 'board' | 'mail' | 'settings' | null;
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
      if (e.kind === 'levelup') setToast(`Level ${e.level}! New seeds unlocked`);
      if (e.kind === 'quest') setToast(e.done ? `Quest complete: ${e.title}` : `New quest: ${e.title}`);
      if (e.kind === 'expand') setToast('The back field is open!');
      if (e.kind === 'coins') fly(window.innerWidth / 2, window.innerHeight - 200, e.amount);
      if (e.kind === 'harvest' && !isStandalone() && isIOS() && !seenHint()) {
        setInstallHint(true);
      }
    });
    const offScreen = game.onScreenFx((e) => {
      if (e.kind === 'coin-fly') fly(e.x, e.y, e.amount);
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
        <NavBtn icon="mail" label="Mail" badge={mailUnread} active={sheet === 'mail'} onClick={() => setSheet('mail')} />
      </nav>

      {sheet === 'barn' && <BarnSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'board' && <BoardSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'mail' && <MailSheet game={game} now={now} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <Settings game={game} onClose={() => setSheet(null)} debug={debug} />}

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
  const crops = game.content.crops.filter((c) => (s.inventory[c.id] ?? 0) > 0);
  const materials = ['wood', 'stone'].filter((m) => (s.inventory[m] ?? 0) > 0);
  const total = crops.reduce((a, c) => a + cratePrice(c) * (s.inventory[c.id] ?? 0), 0);
  return (
    <Sheet title="Barn" onClose={onClose}>
      {!crops.length && !materials.length && <p class="muted">Your barn is empty. Harvested crops land here.</p>}
      {crops.length > 0 && (
        <>
          <h3>Crops</h3>
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
