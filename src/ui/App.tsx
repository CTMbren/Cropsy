import { useEffect, useRef, useState } from 'preact/hooks';
import { DAILY_ORDERS } from '../core/board';
import { itemName, itemValue, shortName, type Content, type VillagerDef } from '../core/content';
import { barnCapacity, barnUsed, cratePrice, hasFlag, hasItems, lifetimeHarvests, MASTERY_STEP, masteryLevel, masteryPending, masteryPicks, masteryThreshold, masteryToChoose, nextReady, progress, remaining, seedCost, stageOf, unlockedCrops } from '../core/farm';
import { xpToNext } from '../core/progression';
import { fromSaveCode, toSaveCode } from '../core/save';
import { canGiftToday, chatter, friends, heartProgress, hearts, pendingEvents, seenEvents, taste } from '../core/friendship';
import { buildingPrice, canAffordBuilding, queueView, readyCount, slotUpgradeCost } from '../core/processing';
import { brunoPrice, featuredCrop, marketOpen, marketPrice, nextBarn, priceFactor, toolPrice } from '../core/shop';
import { blockerAt, clearCost, clearReward, clearTime, landOpen, nextCapLevel, plotCap, plotCount, touchesField } from '../core/land';
import { activeQuest, canHandIn, inbox, letterStatus, objectiveText, target, unreadCount, waitingFor, type TalkResult } from '../core/story';
import { beauty, calendarRewards, canClaim, decorDef, decorDefs, nextGift, placed, stored, tipBonus, type CalendarReward } from '../core/decor';
import { hasImprovement, improvements, nextTownLevel, TOWN_BONUS_LEVELS, TOWN_BONUS_PER_LEVEL, townLevel, townProject, townProjectOpen, weekOf } from '../core/town';
import { boughtToday, daysUntilMerchant, merchantHere, merchantStock, merchantUnlocked } from '../core/merchant';
import { needsBackupNudge } from '../core/backup';
import { CRITTERS, crittersOpen, nextVisitorIn, PAGE_TITLES, PAGES, pollenPerHoney } from '../core/critters';
import { CritterIcon } from './critterIcons';
import { biteCap, FISH, FISH_PAGE_TITLES, FISH_PAGES, fishingOpen, nextBiteIn, type CatchResult, type FishDef } from '../core/fishing';
import { formatDuration } from '../core/time';
import { clearErrors, recentErrors } from '../platform/errors';
import type { Game } from '../game';
import { lastSavedAt } from '../platform/storage';
import { ItemIcon } from './itemArt';
import { Portrait, type Mood } from './portraits';
import { Icon } from './icons';
import { NavIcon } from './navIcons';

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
type Dialogue = { villager: VillagerDef; lines: string[]; index: number; done?: string; title?: string };
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
  const [seedPick, setSeedPick] = useState<string | null>(null);
  const [masteryCard, setMasteryCard] = useState<string | null>(null);
  const [chapterCard, setChapterCard] = useState<number | null>(null);
  const [cropInfo, setCropInfo] = useState<string | null>(null);
  const [landCell, setLandCell] = useState<string | null>(null);
  const [gift, setGift] = useState<CalendarReward | null>(null);
  const [giftLater, setGiftLater] = useState(false);
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
      if (e.kind === 'chapter') setChapterCard(e.n);
      if (e.kind === 'star') setMasteryCard(e.id);
      if (e.kind === 'critter' && e.result.pageDone) setToast(`Sketchbook page ${e.result.pageDone} complete! +1 Ribbon`);
      else if (e.kind === 'critter' && e.result.firstTime) setToast(`Sketched the ${e.result.species.name}! See it in Town → Sketchbook`);
      if (e.kind === 'moss') setToast('coins' in e.find ? `Moss dug up ${e.find.coins} coins!` : `Moss dug up ${e.find.qty} ${itemName(game.content, e.find.item).toLowerCase()}!`);
      if (e.kind === 'ribbon') setToast(`+${e.amount} Ribbon${e.amount > 1 ? 's' : ''} · ${e.why}`);
      if (e.kind === 'heart') {
        const v = game.content.villagers.get(e.villager);
        setToast(e.perk ? `${shortName(v)}: ${e.hearts} hearts! ${e.perk}` : `${shortName(v)} likes you more: ${e.hearts} ${e.hearts === 1 ? 'heart' : 'hearts'}`);
      }
      if (e.kind === 'gift') {
        const v = shortName(game.content.villagers.get(e.villager));
        setToast(e.taste === 'loved' ? `${v} loved it!` : e.taste === 'liked' ? `${v} liked it.` : e.taste === 'disliked' ? `${v} didn't care for that.` : `${v} said thanks.`);
      }
      if (e.kind === 'shipped') setToast(`Barn full! ${e.n} shipped for ${e.coins} coins`);
      if (e.kind === 'quest') setToast(e.done ? `Quest complete: ${e.title}` : `New quest: ${e.title}`);
      if (e.kind === 'expand') setToast('The back field is open!');
      if (e.kind === 'land') setToast(`Bruno's crew cleared a new plot! +${e.qty} ${itemName(game.content, e.item).toLowerCase()}${e.gold ? ' and a gold nugget' : ''}`);
      if (e.kind === 'coins') fly(window.innerWidth / 2, window.innerHeight - 200, e.amount);
      if (e.kind === 'harvest' && !isStandalone() && isIOS() && !seenHint()) {
        setInstallHint(true);
      }
    });
    const offScreen = game.onScreenFx((e) => {
      if (e.kind === 'coin-fly') fly(e.x, e.y, e.amount);
      if (e.kind === 'open-building') setSheet(`building:${e.id}`);
      if (e.kind === 'open-crop') setCropInfo(e.key);
      if (e.kind === 'open-land') setLandCell(e.cell);
      if (e.kind === 'pick-seed') setSeedPick(e.key);
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
  const coach = sheet === null && !dialogue ? game.coach() : null;
  const [backupLater, setBackupLater] = useState(false);
  const canReplant = Object.keys(s.lastCrop).some((k) => s.plots[k] && !s.plots[k].crop && !s.obstacles[k]);

  const openTalk = () => {
    if (!giver) return;
    const r: TalkResult = game.talk();
    if (r.kind === 'none') return;
    setDialogue({ villager: giver, lines: r.lines.length ? r.lines : ['…'], index: 0, done: r.kind === 'outro' ? r.quest.title : undefined });
  };

  return (
    <div class={`ui ts-${Math.round((s.settings.textScale ?? 1) * 100)}`}>
      <header class="hud">
        <div class="level" aria-label={`Level ${s.level}`}>
          <span class="star">{s.level}</span>
          <div class="xp">
            <div class="xp-label">
              LV {s.level} <small>{compact(s.xp)}/{compact(need)}</small>
            </div>
            <div class="xp-bar">
              <div style={{ width: `${Math.min(100, (s.xp / need) * 100)}%` }} />
            </div>
          </div>
        </div>
        <div class={`pill coins bump${coinBump % 2}`} ref={coinRef} aria-label={`${s.coins} coins`}>
          <span class="coin" aria-hidden="true" />
          <Rolling value={s.coins} />
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
            <span class="tracker-obj">Tap {shortName(giver)} to start</span>
          ) : active.status === 'ready' ? (
            <span class="tracker-obj done">Done! Tap {shortName(giver)} to hand in</span>
          ) : (
            quest.objectives.map((o, i) => (
              <span class="tracker-obj" key={i}>
                {o.type === 'read_mail' ? letterLine(game, o.id) : objectiveText(o, game.content)}
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
        <button class={`visitor${coach?.target === 'visitor' ? ' coach-pulse' : ''}`} onClick={openTalk} aria-label={`Talk to ${giver.name}`}>
          <Portrait v={giver} size={58} />
          <span class={`bubble ${active.status}`}>{active.status === 'offered' ? '!' : active.status === 'ready' || (quest && canHandIn(s, quest) && quest.objectives.some((o) => o.type === 'hand_in')) ? '✓' : '…'}</span>
          <span class="visitor-name">{shortName(giver)}</span>
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

      {coach && !seedPick && !masteryCard && (
        <div class={`coach coach-${coach.target}`} role="status">
          {coach.text}
        </div>
      )}

      {game.mode === 'decorate' ? (
        <section class="tray" aria-label="Decorations">
          <div class="deco-hint">Tap a spot by the field to place · tap a decoration to pick it up</div>
          <div class="seeds">
            {Object.entries(stored(s)).map(([id, n]) => {
              const d = decorDef(game.content, id);
              const sel = game.selectedDecor === id;
              return (
                <button key={id} class={`seed${sel ? ' selected' : ''}`} aria-pressed={sel} onClick={() => game.selectDecor(id)}>
                  <ItemIcon id={d?.id} color={d?.color} />
                  <span class="seed-name">{d?.name}</span>
                  <span class="chip time">×{n}</span>
                </button>
              );
            })}
            {!Object.keys(stored(s)).length && <p class="muted deco-empty">Everything's placed. Buy more at Goldie's store.</p>}
            <button class="seed replant" onClick={() => game.setMode('plant')}>
              <Icon name="farm" size={30} />
              <span class="seed-name">Done</span>
            </button>
          </div>
        </section>
      ) : (
      <section class="tray" aria-label="Seeds">
        <div class="seeds">
          {game.content.crops.map((c) => {
            const locked = !unlocked.has(c.id);
            const selected = game.mode === 'plant' && game.selectedCrop === c.id;
            return (
              <button key={c.id} class={`seed${selected ? ' selected' : ''}${locked ? ' locked' : ''}${coach?.target === 'seed' && coach.seed === c.id ? ' coach-pulse' : ''}`} disabled={locked} aria-pressed={selected} aria-label={`${c.name}${locked ? `, unlocks at level ${c.unlock_level}` : ''}`} onClick={() => game.selectCrop(c.id)}>
                <ItemIcon id={c.id} color={c.color} />
                <span class="seed-name">{c.name}</span>
                {masteryLevel(s, c.id) > 0 && (
                  <span
                    class={`mastery-badge${masteryPending(s, c.id) ? ' pending' : ''}`}
                    role="button"
                    aria-label={`${c.name} mastery level ${masteryLevel(s, c.id)}${masteryPending(s, c.id) ? ', bonus to choose' : ''}`}
                    onClick={(e) => {
                      // the badge opens the mastery card instead of arming the seed
                      e.stopPropagation();
                      setMasteryCard(c.id);
                    }}
                  >
                    ★{masteryLevel(s, c.id)}
                  </span>
                )}
                {locked ? (
                  <span class="chip lock">Lv {c.unlock_level}</span>
                ) : (
                  <span class="seed-meta">
                    <span class="chip time">{formatDuration(c.grow_s)}</span>
                    <span class="cost">
                      <span class="coin sm" aria-hidden="true" />
                      {seedCost(s, c)}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
          {s.level >= 8 && (
            <button class={`seed tool${game.mode === 'fertilize' ? ' selected' : ''}`} aria-pressed={game.mode === 'fertilize'} disabled={!(s.inventory.fertilizer ?? 0)} onClick={() => game.setMode('fertilize')}>
              <Icon name="fertilizer" size={30} />
              <span class="seed-name">Fertilize</span>
              <span class="chip time">×{s.inventory.fertilizer ?? 0}</span>
            </button>
          )}
          {s.level >= 10 && (
            <button class={`seed tool${game.mode === 'soil' ? ' selected' : ''}`} aria-pressed={game.mode === 'soil'} onClick={() => game.setMode('soil')}>
              <Icon name="soil" size={30} />
              <span class="seed-name">Soil</span>
              <span class="chip time">Upgrade</span>
            </button>
          )}
          {(Object.keys(stored(s)).length > 0 || Object.keys(placed(s)).length > 0) && (
            <button class="seed tool" onClick={() => game.selectDecor(Object.keys(stored(s))[0] ?? null)}>
              <Icon name="decor" size={30} />
              <span class="seed-name">Decorate</span>
              <span class="chip time">♥ {beauty(s, game.content)}</span>
            </button>
          )}
          <button class="seed replant" disabled={!canReplant} onClick={() => game.replantAll()}>
            <Icon name="replant" size={30} />
            <span class="seed-name">Replant all</span>
          </button>
        </div>
      </section>
      )}

      <nav class="nav" aria-label="Farm menu">
        <NavBtn icon="farm" label="Farm" active={sheet === null} onClick={() => setSheet(null)} />
        <NavBtn icon="barn" label="Barn" badge={barnCount} pulse={coach?.target === 'barn'} active={sheet === 'barn'} onClick={() => setSheet('barn')} />
        <NavBtn icon="board" label="Board" pulse={coach?.target === 'board'} badge={boardOpen ? fillable : 0} locked={!boardOpen} active={sheet === 'board'} onClick={() => boardOpen && setSheet('board')} />
        <NavBtn icon="town" label="Town" badge={(merchantUnlocked(s) && merchantHere(game.content, game.day(), s) && !boughtToday(s, game.day()).length ? 1 : 0) + (fishingOpen(s) && (s.fishing?.bites ?? 0) >= biteCap(s, game.content) ? 1 : 0)} active={sheet === 'town'} onClick={() => setSheet('town')} />
        <NavBtn icon="mail" label="Mail" pulse={coach?.target === 'mail'} badge={mailUnread} active={sheet === 'mail'} onClick={() => setSheet('mail')} />
      </nav>

      {sheet === 'barn' && <BarnSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'board' && <BoardSheet game={game} onClose={() => setSheet(null)} />}
      {sheet === 'mail' && <MailSheet game={game} now={now} onClose={() => setSheet(null)} />}
      {sheet === 'settings' && <Settings game={game} onClose={() => setSheet(null)} debug={debug} />}
      {sheet === 'town' && (
        <TownSheet
          game={game}
          onClose={() => setSheet(null)}
          onScene={(villager, title, lines) => {
            setSheet(null);
            setDialogue({ villager, lines, index: 0, title });
          }}
        />
      )}
      {sheet?.startsWith('building:') && <BuildingSheet game={game} id={sheet.slice(9)} now={now} onClose={() => setSheet(null)} />}

      {landCell && <LandCard game={game} cell={landCell} now={now} onClose={() => setLandCell(null)} />}
      {cropInfo && <CropInfo game={game} plotKey={cropInfo} now={now} onClose={() => setCropInfo(null)} />}
      {seedPick && <SeedPicker game={game} plotKey={seedPick} onClose={() => setSeedPick(null)} />}
      {masteryCard && levelCard === null && <MasteryCard game={game} cropId={masteryCard} onClose={() => setMasteryCard(masteryToChoose(game.state).find((id) => id !== masteryCard) ?? null)} />}
      {levelCard !== null && <LevelCard content={game.content} level={levelCard} onClose={() => setLevelCard(null)} />}
      {chapterCard !== null && levelCard === null && <ChapterCard content={game.content} n={chapterCard} onClose={() => setChapterCard(null)} />}

      {dialogue && (
        <div class="dialogue-back" onClick={() => (dialogue.index < dialogue.lines.length - 1 ? setDialogue({ ...dialogue, index: dialogue.index + 1 }) : setDialogue(null))}>
          <div class="dialogue" role="dialog" aria-label={`${dialogue.villager.name} says`}>
            <Portrait v={dialogue.villager} size={72} mood={moodOf(dialogue.lines[dialogue.index] ?? '')} />
            <div class="dialogue-body">
              <div class="dialogue-name">
                {dialogue.villager.name}
                {dialogue.title && <small class="dialogue-title"> · {dialogue.title}</small>}
              </div>
              <p>{dialogue.lines[dialogue.index]}</p>
              {dialogue.done && dialogue.index === dialogue.lines.length - 1 && <div class="quest-done">Quest complete: {dialogue.done}</div>}
              <div class="dialogue-next">{dialogue.index < dialogue.lines.length - 1 ? 'Tap to continue ▸' : 'Tap to close'}</div>
            </div>
          </div>
        </div>
      )}

      {(gift || (!giftLater && canClaim(s, game.day()))) && !game.away && levelCard === null && chapterCard === null && !dialogue && sheet === null && !seedPick && !masteryCard && (
        <GiftCalendar
          game={game}
          claimed={gift}
          onClaim={() => setGift(game.claimGift())}
          onClose={() => {
            setGift(null);
            setGiftLater(true);
          }}
        />
      )}

      {!backupLater && needsBackupNudge(s, now) && !game.away && !canClaim(s, game.day()) && levelCard === null && chapterCard === null && !dialogue && sheet === null && !seedPick && !masteryCard && (
        <BackupCard
          game={game}
          onClose={() => {
            setBackupLater(true);
          }}
        />
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

/** A number that counts up or down to its new value instead of jumping. */
function Rolling({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const diff = value - a;
    if (!diff) return;
    const dur = Math.min(700, 250 + Math.abs(diff) * 4);
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const v = Math.round(a + diff * (1 - Math.pow(1 - p, 3)));
      setShown(v);
      from.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

/** 1440 → 1.4k, so the XP numbers fit beside the level at high levels. */
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);

function NavBtn({ icon, label, badge, active, locked, pulse, onClick }: { icon: string; label: string; badge?: number; active?: boolean; locked?: boolean; pulse?: boolean; onClick: () => void }) {
  return (
    <button class={`nav-btn${active ? ' active' : ''}${locked ? ' locked' : ''}${pulse ? ' coach-pulse' : ''}`} onClick={onClick} aria-label={`${label}${badge ? `, ${badge}` : ''}${locked ? ', locked' : ''}`}>
      <span class="nav-medal">
        <NavIcon name={locked ? 'lock' : icon} size={30} />
      </span>
      <span class="nav-label">{label}</span>
      {!!badge && <span class="badge">{badge > 9 ? '9+' : badge}</span>}
    </button>
  );
}

export type { Mood };

/** Reads a mood from a line of dialogue: excited lines smile, questions look surprised, trailing-off lines look wistful. */
export function moodOf(line: string): Mood {
  const l = line.trim();
  if (l.startsWith('...') || l.endsWith('...') || /sorry|miss|passed|cold|crying/i.test(l)) return 'sad';
  if (l.endsWith('?')) return 'surprised';
  if (l.includes('!')) return 'happy';
  return 'neutral';
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
      <div class="capacity" aria-label={`Barn ${barnUsed(s, game.content)} of ${barnCapacity(s, game.content)}`}>
        <div class="capacity-bar">
          <div style={{ width: `${Math.min(100, (barnUsed(s, game.content) / barnCapacity(s, game.content)) * 100)}%` }} />
        </div>
        <span>
          {barnUsed(s, game.content)}/{barnCapacity(s, game.content)}
        </span>
      </div>
      {barnUsed(s, game.content) >= barnCapacity(s, game.content) && <p class="muted small">Your barn is full. New harvests go straight to the shipping crate. Bruno can build a bigger barn (Town → Land).</p>}
      {!crops.length && !materials.length && <p class="muted">Your barn is empty. Harvested crops land here.</p>}
      {crops.length > 0 && (
        <>
          <h3>Crops and goods</h3>
          <ul class="rows">
            {crops.map((c) => (
              <li key={c.id} class="row-item">
                <ItemIcon id={c.id} color={c.color} small />
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
                  {shortName(v)}
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
  const [tab, setTab] = useState<'letters' | 'story'>('letters');
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
    <Sheet title={tab === 'story' ? 'Story so far' : 'Mailbox'} onClose={onClose}>
      <div class="tabs" role="tablist">
        {(['letters', 'story'] as const).map((x) => (
          <button key={x} role="tab" aria-selected={tab === x} class={`tab${tab === x ? ' active' : ''}`} onClick={() => setTab(x)}>
            {x === 'letters' ? 'Letters' : 'Story'}
          </button>
        ))}
      </div>
      {tab === 'story' && <StoryLog game={game} />}
      {tab === 'letters' && !mail.length && <p class="muted">No letters yet.</p>}
      {tab === 'letters' && <ul class="rows">
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
      </ul>}
    </Sheet>
  );
}

/** Every finished quest, chapter by chapter; tap one to re-read what was said. */
/** One line on where a story letter is: on its way (and when), or waiting in Mail. */
function letterLine(game: Game, id: string): string {
  const st = letterStatus(game.state, id, game.now());
  const from = game.content.letters.get(id)?.from;
  const who = from === 'tobias' ? "Tobias's letter" : 'A letter';
  if (st.state === 'coming') return `${who} arrives in about ${formatDuration((st.arrivesAt ?? 0) - game.now())}`;
  if (st.state === 'read') return `You've read ${who.toLowerCase().startsWith('a ') ? 'it' : who}`;
  return `${who} is in your Mail. Open it there`;
}

function StoryLog({ game }: { game: Game }) {
  const c = game.content;
  const s = game.state;
  const [open, setOpen] = useState<string | null>(null);
  const seen = new Set([...s.story.done, ...(s.story.active ? [s.story.active.id] : [])]);
  const chapters = c.chapters.filter((ch) => c.quests.some((q) => q.chapter === ch.n && seen.has(q.id)));
  return (
    <div class="story-log">
      {chapters.map((ch) => (
        <section key={ch.n}>
          <h3>
            Chapter {ch.n} · {ch.title}
          </h3>
          <ul class="rows">
            {c.quests
              .filter((q) => q.chapter === ch.n && seen.has(q.id))
              .map((q) => {
                const v = q.giver === 'mail' ? undefined : c.villagers.get(q.giver);
                const done = s.story.done.includes(q.id);
                const letterId = q.objectives.find((o) => o.type === 'read_mail');
                const letter = letterId?.type === 'read_mail' ? c.letters.get(letterId.id) : undefined;
                // a letter only shows here once it's been read in the mailbox (reading it here doesn't count)
                const unread = !!letterId && letterId.type === 'read_mail' && !done && letterStatus(s, letterId.id, game.now()).state !== 'read';
                const lines = letter ? (unread ? [letterLine(game, (letterId as { id: string }).id)] : [letter.body]) : [...(q.intro ?? []), ...(done ? (q.outro ?? []) : [])];
                return (
                  <li key={q.id} class="story-entry">
                    <button class="row-item" onClick={() => setOpen(open === q.id ? null : q.id)} disabled={!lines.length}>
                      {v ? <Portrait v={v} size={34} /> : <Icon name="mail" size={26} />}
                      <span class="row-name">
                        {q.title}
                        <small>{done ? (v ? v.name : 'A letter') : 'In progress'}</small>
                      </span>
                      {done && <span class="chip owned">Done</span>}
                    </button>
                    {open === q.id && (
                      <div class="story-lines">
                        {lines.map((l, i) => (
                          <p key={i}>{l}</p>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {c.chapters.length > chapters.length && <p class="muted small">More of the story unlocks as Bramblewick comes back to life.</p>}
    </div>
  );
}

function problemReport(game: Game): string {
  const s = game.state;
  const lines = [
    `Cropsy ${__APP_VERSION__}`,
    `Device: ${navigator.userAgent}`,
    `Home screen app: ${isStandalone() ? 'yes' : 'no'}`,
    `Level ${s.level} · ${s.coins} coins · farm ${s.width}x${s.height}`,
    `Quest: ${s.story.active?.id ?? 'none'} (${s.story.active?.status ?? '-'}) progress ${JSON.stringify(s.story.active?.progress ?? [])} · done ${s.story.done.length}`,
    `Errors:`,
    ...recentErrors().map((e) => `  ${new Date(e.t).toISOString()} ${e.msg}${e.where ? ` @ ${e.where}` : ''}`),
    `Recent events:`,
    ...s.log.slice(-15).map((l) => `  ${new Date(l.t * 1000).toISOString()} ${l.e}`),
  ];
  return lines.join('\n');
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
      <label class="toggle">
        <input type="checkbox" checked={s.settings.music !== false} onChange={(e) => game.setMusic((e.target as HTMLInputElement).checked)} />
        <span>Music</span>
      </label>
      <div class="field">
        <span>Text size</span>
        <div class="tabs" role="radiogroup" aria-label="Text size">
          {[
            [1, 'Normal'],
            [1.15, 'Large'],
            [1.3, 'Larger'],
          ].map(([v, label]) => (
            <button key={label} role="radio" aria-checked={(s.settings.textScale ?? 1) === v} class={`tab${(s.settings.textScale ?? 1) === v ? ' active' : ''}`} onClick={() => game.setTextScale(v as number)}>
              {label}
            </button>
          ))}
        </div>
      </div>
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
              game.backedUp();
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
      <h3>About Cropsy</h3>
      <p class="muted small">
        Free, no ads, nothing to buy. Your farm is saved only on this phone; nothing about it is sent anywhere.
        {import.meta.env.VITE_GOATCOUNTER ? ' The game counts launches anonymously (no cookies, no farm data) so its maker knows people are playing.' : ''}
      </p>
      <div class="row">
        <button
          class="btn"
          onClick={async () => {
            const url = 'https://ctmbren.github.io/Cropsy/';
            try {
              if (navigator.share) await navigator.share({ title: 'Cropsy', text: 'A cozy farming game you can play on your phone.', url });
              else {
                await navigator.clipboard.writeText(url);
                setMsg('Link copied!');
              }
            } catch {
              /* share sheet dismissed */
            }
          }}
        >
          Share Cropsy
        </button>
      </div>
      <h3>Something not right?</h3>
      <p class="muted small">
        Copy a problem report and send it to the developer. It includes your level, quest and any recent errors, but not your backup code.
        {recentErrors().length > 0 && ` ${recentErrors().length} recent error${recentErrors().length > 1 ? 's' : ''} logged.`}
      </p>
      <div class="row">
        <button
          class="btn"
          onClick={async () => {
            const report = problemReport(game);
            try {
              await navigator.clipboard.writeText(report);
              setMsg('Problem report copied.');
            } catch {
              setCode(report);
              setMsg('Select the report above and copy it.');
            }
          }}
        >
          Copy problem report
        </button>
        {recentErrors().length > 0 && (
          <button
            class="btn"
            onClick={() => {
              clearErrors();
              setMsg('Error log cleared.');
            }}
          >
            Clear errors
          </button>
        )}
      </div>
      <p class="muted small version">Cropsy {__APP_VERSION__}</p>
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

/** Opens when an empty plot is tapped with no seed armed: pick one to plant there. */
function SeedPicker({ game, plotKey, onClose }: { game: Game; plotKey: string; onClose: () => void }) {
  const s = game.state;
  const crops = unlockedCrops(s, game.content);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="card seed-picker" role="dialog" aria-labelledby="pick-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="pick-title">Plant a seed</h2>
        <div class="seed-grid">
          {crops.map((c) => {
            const cost = seedCost(s, c);
            const poor = s.coins < cost;
            return (
              <button
                key={c.id}
                class={`seed${game.selectedCrop === c.id ? ' selected' : ''}`}
                disabled={poor}
                onClick={() => {
                  game.plantPicked(plotKey, c.id);
                  onClose();
                }}
              >
                <ItemIcon id={c.id} color={c.color} />
                <span class="seed-name">{c.name}</span>
                <span class="seed-meta">
                  <span class="chip time">{formatDuration(c.grow_s)}</span>
                  <span class="cost">
                    <span class="coin sm" aria-hidden="true" />
                    {cost}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <p class="muted small">The seed stays picked, so you can drag across more plots. Tap it in the tray to put it away.</p>
        <button class="btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A crop's mastery: progress, bonuses so far, and the coin-or-XP choice for any unspent level. */
function MasteryCard({ game, cropId, onClose }: { game: Game; cropId: string; onClose: () => void }) {
  const s = game.state;
  const crop = game.content.cropById.get(cropId);
  if (!crop) return null;
  const n = s.harvests?.[cropId] ?? 0;
  const lv = masteryLevel(s, cropId);
  const picks = masteryPicks(s, cropId);
  const pending = masteryPending(s, cropId);
  const pct = Math.round(MASTERY_STEP * 100);
  const coins = picks.filter((p) => p === 'coin').length * pct;
  const xp = picks.filter((p) => p === 'xp').length * pct;
  return (
    <div class="modal-back" onClick={pending ? undefined : onClose}>
      <div class="card level-card mastery-card" role="dialog" aria-labelledby="mastery-title" onClick={(e) => e.stopPropagation()}>
        <ItemIcon id={crop.id} color={crop.color} size={56} />
        <h2 id="mastery-title">
          {crop.name} mastery {lv > 0 ? `★ ${lv}` : ''}
        </h2>
        <p class="muted small">
          {n.toLocaleString()} grown · next level at {masteryThreshold(lv + 1).toLocaleString()}
        </p>
        {(coins > 0 || xp > 0) && (
          <p class="small">
            Bonuses: <b>+{coins}% coins</b> · <b>+{xp}% XP</b>
          </p>
        )}
        {pending > 0 ? (
          <>
            <p>
              <b>Level up!</b> +1 Ribbon. Pick a bonus for {crop.name.toLowerCase()}
              {pending > 1 ? ` (${pending} to choose)` : ''}:
            </p>
            <div class="row">
              <button class="btn gold" onClick={() => game.chooseMastery(cropId, 'coin')}>
                +{pct}% coins
              </button>
              <button class="btn green" onClick={() => game.chooseMastery(cropId, 'xp')}>
                +{pct}% XP
              </button>
            </div>
            <p class="muted small">Coins: crate, market, auto-ship and Fresh tips. XP: every harvest.</p>
            <button class="link-btn small" onClick={onClose}>
              Decide later (tap the ★ on the seed)
            </button>
          </>
        ) : (
          <button class="btn green" onClick={onClose}>
            OK
          </button>
        )}
      </div>
    </div>
  );
}

function LevelCard({ content, level, onClose }: { content: Content; level: number; onClose: () => void }) {
  const items: string[] = [];
  for (const c of content.crops) if (c.unlock_level === level) items.push(`New seed: ${c.name}`);
  for (const b of content.buildings.values()) if (b.unlock_level === level) items.push(`New building in Town: ${b.name}`);
  for (const t of content.tools.values()) if (t.unlock_level === level) items.push(`New tool in Town: ${t.name}`);
  for (const cap of (content.economy as unknown as { land: { caps: { level: number; plots: number }[] } }).land.caps) if (cap.level === level && level > 1) items.push(`Bruno can clear land up to ${cap.plots} plots`);
  if (content.economy.market.unlock_level === level) items.push('The market stall is open in Town');
  for (const q of content.quests) if (q.min_level === level && content.quests.find((x) => x.chapter === q.chapter && x.giver !== 'mail')?.id === q.id) items.push(`Chapter ${q.chapter} of the story can begin`);
  for (const d of decorDefs(content)) if (!d.story && d.level === level) items.push(`New decoration: ${d.name}`);
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="card level-card" role="dialog" aria-labelledby="lvl-title">
        <div class="confetti" aria-hidden="true">
          {Array.from({ length: 18 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, background: ['#ffc531', '#e8506a', '#5cb83a', '#3a8fd6', '#b36ad6'][i % 5], animationDelay: `${(i % 6) * 0.07}s`, transform: `rotate(${i * 47}deg)` }} />
          ))}
        </div>
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

/** Copies the backup code, falling back to the share sheet (which can save it to Notes or Files). */
async function copyBackup(game: Game): Promise<'copied' | 'shared' | 'failed'> {
  const c = toSaveCode(game.state);
  try {
    await navigator.clipboard.writeText(c);
    game.backedUp();
    return 'copied';
  } catch {
    try {
      await navigator.share?.({ title: 'Cropsy backup', text: c });
      game.backedUp();
      return 'shared';
    } catch {
      return 'failed';
    }
  }
}

function BackupCard({ game, onClose }: { game: Game; onClose: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const first = game.state.backup?.lastAt === undefined;
  return (
    <div class="modal-back">
      <div class="card" role="dialog" aria-labelledby="backup-title">
        <h2 id="backup-title">{first ? 'Keep your farm safe' : 'Time for a fresh backup'}</h2>
        <p class="muted">
          {first
            ? "Your farm lives on this phone. If Safari clears its data or you get a new phone, a backup code brings everything back. It's one tap, and you can paste it into Notes."
            : "It's been a while since your last backup code. Your farm has grown since then!"}
        </p>
        {msg && (
          <p class="muted" role="status">
            {msg}
          </p>
        )}
        <div class="row">
          <button
            class="btn"
            onClick={() => {
              game.snoozeBackup();
              onClose();
            }}
          >
            Later
          </button>
          <button
            class="btn green"
            onClick={async () => {
              const r = await copyBackup(game);
              if (r === 'failed') setMsg('Open Settings to see and copy your code.');
              else onClose();
            }}
          >
            Copy backup code
          </button>
        </div>
        <p class="muted small">Restore it any time from Settings.</p>
      </div>
    </div>
  );
}

function rewardText(content: Content, r: CalendarReward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`${r.coins} coins`);
  if (r.item) parts.push(`${r.qty ?? 1} ${itemName(content, r.item).toLowerCase()}`);
  if (r.deco) parts.push(decorDef(content, r.deco)?.name ?? r.deco);
  if (r.ribbons) parts.push(`${r.ribbons} Ribbon${r.ribbons > 1 ? 's' : ''}`);
  return parts.join(' + ');
}

/** The daily gift: seven gifts in a row. Missing a day never resets it. */
function GiftCalendar({ game, claimed, onClaim, onClose }: { game: Game; claimed: CalendarReward | null; onClaim: () => void; onClose: () => void }) {
  const c = game.content;
  const rewards = calendarRewards(c);
  const total = game.state.calendar?.claimed ?? 0;
  const next = nextGift(game.state, c);
  // after claiming, highlight the one just opened
  const current = claimed ? (next + rewards.length - 1) % rewards.length : next;
  const round = claimed ? total - 1 : total;
  return (
    <div class="modal-back">
      <div class="card gift-card" role="dialog" aria-labelledby="gift-title">
        <h2 id="gift-title">{claimed ? 'Opened!' : 'Daily gift'}</h2>
        <div class="gift-days">
          {rewards.map((r, i) => {
            const done = Math.floor(round / rewards.length) * rewards.length + i < round || (claimed && i === current);
            return (
              <div key={i} class={`gift-day${i === current ? ' today' : ''}${done ? ' done' : ''}`}>
                <span class="gift-n">Day {i + 1}</span>
                <Icon name={r.deco ? 'decor' : r.ribbons ? 'ribbon' : r.item ?? 'coin'} size={24} />
                <small>{r.coins ? r.coins : r.qty ? `×${r.qty}` : r.ribbons && !r.deco ? `×${r.ribbons}` : '★'}</small>
              </div>
            );
          })}
        </div>
        <p class="muted">{claimed ? `You got ${rewardText(c, claimed)}. Come back tomorrow for day ${(current + 1) % rewards.length + 1}.` : `Today: ${rewardText(c, rewards[current])}. Missed a day? No problem: your next gift just waits.`}</p>
        {claimed ? (
          <button class="btn green" onClick={onClose}>
            Lovely!
          </button>
        ) : (
          <div class="row">
            <button class="btn" onClick={onClose}>
              Later
            </button>
            <button class="btn green" onClick={onClaim}>
              Open gift
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Field size and the crew's current job, for the Land tab. */
function LandSummary({ game }: { game: Game }) {
  const s = game.state;
  const c = game.content;
  const cap = plotCap(s, c);
  const next = nextCapLevel(s, c);
  const job = s.clearing;
  return (
    <>
      <div class="order">
        <Portrait v={c.villagers.get('bruno')!} size={44} />
        <div class="order-body">
          <div class="order-who">
            Your field: {plotCount(s)} plots
            {landOpen(s) && <span class="muted small"> (up to {cap} at your level)</span>}
          </div>
          <p class="muted small">
            {!landOpen(s)
              ? 'Bruno will help with your land once he has rebuilt your old gate in the story.'
              : job
                ? `Bruno's crew is clearing a ${job.kind}: ${formatDuration(Math.max(0, job.endsAt - game.now()))} left.`
                : plotCount(s) >= cap
                  ? next
                    ? `Reach level ${next.level} and Bruno can clear up to ${next.plots} plots.`
                    : 'Every corner of the homestead is cleared. Bruno is very proud.'
                  : 'Tap a stump or boulder next to your field to clear it, one plot at a time.'}
          </p>
        </div>
      </div>
      {landOpen(s) && plotCount(s) < cap && <p class="muted small">Next plot costs {clearCost(s, c).toLocaleString()} coins. Stumps take about {formatDuration(clearTime(s, c, 'stump'))} and boulders {formatDuration(clearTime(s, c, 'boulder'))}, and you keep the wood or stone.</p>}
    </>
  );
}

/** Tap overgrown land: what it is, what clearing it costs, and the crew's progress. */
function LandCard({ game, cell, now, onClose }: { game: Game; cell: string; now: number; onClose: () => void }) {
  const s = game.state;
  const c = game.content;
  const kind = blockerAt(cell);
  const job = s.clearing;
  const here = job?.cell === cell;
  // close once this cell has become a plot
  if (s.plots[cell]) {
    queueMicrotask(onClose);
    return null;
  }
  const cost = clearCost(s, c);
  const time = clearTime(s, c, kind);
  const reward = clearReward(c, cell, kind);
  const cap = plotCap(s, c);
  const next = nextCapLevel(s, c);
  let blocked: string | null = null;
  if (!landOpen(s)) blocked = 'Bruno will help clear land once he has rebuilt your gate (Chapter 1).';
  else if (!touchesField(s, cell)) blocked = 'Clear the land right next to your field first.';
  else if (plotCount(s) >= cap) blocked = next ? `Your field is as big as it can be for now. Reach level ${next.level} to clear more.` : 'Your field is as big as the homestead allows.';
  else if (job && !here) blocked = `Bruno's crew is busy clearing another ${job.kind}: ${formatDuration(Math.max(0, job.endsAt - now))} left.`;
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="card crop-info" role="dialog" aria-labelledby="land-title" onClick={(e) => e.stopPropagation()}>
        <div class="crop-head">
          <Icon name={kind === 'stump' ? 'wood' : 'stone'} size={46} />
          <div>
            <h2 id="land-title">{kind === 'stump' ? 'Old stump' : 'Boulder'}</h2>
            <p class="muted small">Overgrown land. Clearing it gives you a new plot and {reward.qty} {itemName(c, reward.item).toLowerCase()}.</p>
          </div>
        </div>
        {here ? (
          <>
            <div class="grow-bar" role="progressbar">
              <i style={{ width: `${Math.min(100, Math.round((1 - (job!.endsAt - now) / time) * 100))}%` }} />
            </div>
            <p class="crop-left">
              Bruno's crew is on it: <b>{formatDuration(Math.max(0, job!.endsAt - now))}</b> left
            </p>
            <div class="row">
              <button class="btn green" onClick={onClose}>
                OK
              </button>
            </div>
          </>
        ) : blocked ? (
          <>
            <p class="muted">{blocked}</p>
            <div class="row">
              <button class="btn green" onClick={onClose}>
                OK
              </button>
            </div>
          </>
        ) : (
          <>
            <p class="crop-left">
              <span class="coin sm" aria-hidden="true" /> <b>{cost.toLocaleString()}</b> coins · <b>{formatDuration(time)}</b>
            </p>
            <div class="row">
              <button class="btn" onClick={onClose}>
                Not now
              </button>
              <button
                class="btn green"
                disabled={s.coins < cost}
                onClick={() => {
                  if (game.startClearing(cell).ok) onClose();
                }}
              >
                {s.coins < cost ? 'Need coins' : 'Clear it'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const STAGE_NAMES: Record<string, string> = { seed: 'Just planted', sprout: 'Sprouting', growing: 'Growing', ripe: 'Ripe' };

/** Tap a growing crop: what it is, how long is left, and the option to dig it up early. */
function CropInfo({ game, plotKey, now, onClose }: { game: Game; plotKey: string; now: number; onClose: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const plot = game.state.plots[plotKey];
  const crop = plot?.crop ? game.content.cropById.get(plot.crop) : undefined;
  // closes itself once the crop ripens or is gone
  if (!plot || !crop || stageOf(plot, now) === 'ripe') {
    queueMicrotask(onClose);
    return null;
  }
  const left = remaining(plot, now);
  const pct = Math.round(progress(plot, now) * 100);
  const soil = game.content.economy.soil[plot.soil ?? 0];
  return (
    <div class="modal-back" onClick={onClose}>
      <div class="card crop-info" role="dialog" aria-labelledby="crop-title" onClick={(e) => e.stopPropagation()}>
        <div class="crop-head">
          <ItemIcon id={crop.id} color={crop.color} size={52} />
          <div>
            <h2 id="crop-title">{crop.name}</h2>
            <p class="muted small">{STAGE_NAMES[stageOf(plot, now)]}{plot.fertilized ? ' · Fertilized (double harvest)' : ''}{plot.soil ? ` · ${soil?.name ?? 'Better soil'}` : ''}</p>
          </div>
        </div>
        <div class="grow-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <p class="crop-left">
          Ready in <b>{formatDuration(left)}</b>
        </p>
        {confirm ? (
          <>
            <p class="muted">Dig up this {crop.name.toLowerCase()}? The crop is destroyed and you won't get the seed cost back.</p>
            <div class="row">
              <button class="btn" onClick={() => setConfirm(false)}>
                Keep it
              </button>
              <button
                class="btn red"
                onClick={() => {
                  game.digUp(plotKey);
                  onClose();
                }}
              >
                Dig it up
              </button>
            </div>
          </>
        ) : (
          <div class="row">
            <button class="btn" onClick={() => setConfirm(true)}>
              Dig up
            </button>
            <button class="btn green" onClick={onClose}>
              OK
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ChapterCard({ content, n, onClose }: { content: Content; n: number; onClose: () => void }) {
  const ch = content.chapters.find((x) => x.n === n);
  if (!ch) return null;
  return (
    <div class="modal-back chapter-back" onClick={onClose}>
      <div class="card chapter-card" role="dialog" aria-labelledby="chapter-title">
        <div class="chapter-num">Chapter {n}</div>
        <h2 id="chapter-title">{ch.title}</h2>
        <p class="muted">{ch.blurb}</p>
        <button class="btn green" onClick={onClose}>
          Begin
        </button>
      </div>
    </div>
  );
}

function Need({ have, need, label }: { have: number; need: number; label: string }) {
  const ok = have >= need;
  return (
    <span class={ok ? 'have' : 'need'}>
      <span aria-hidden="true">{ok ? '✓' : '✗'}</span> {Math.min(have, need).toLocaleString()}/{need.toLocaleString()} {label}
    </span>
  );
}

type SceneFn = (v: VillagerDef, title: string, lines: string[]) => void;

function TownSheet({ game, onClose, onScene }: { game: Game; onClose: () => void; onScene: SceneFn }) {
  const s = game.state;
  const c = game.content;
  const day = game.day();
  const projects = [...c.projects.values()].filter((p) => s.flags.includes(`${p.id}_project`));
  const projectDue = projects.some((p) => (s.projects[p.id] ?? 0) < p.stages.length);
  const cart = merchantUnlocked(s);
  const almanac = hasFlag(s, 'almanac_open');
  const scenes = pendingEvents(s, c).length > 0;
  const townOpen = townProjectOpen(s, c);
  const sketch = crittersOpen(s, c);
  const creek = fishingOpen(s);
  const tabs = ['store', ...(cart ? ['cart'] : []), ...(friends(s, c).length ? ['friends'] : []), ...(almanac ? ['almanac'] : []), ...(sketch ? ['sketchbook'] : []), ...(creek ? ['creek'] : []), 'land', ...(marketOpen(s, c) ? ['market'] : []), ...(projects.length || townOpen ? ['projects'] : [])];
  const fishQuest = creek && (activeQuest(s, c)?.objectives.some((o) => o.type === 'fish' || o.type === 'fish_species') ?? false);
  const [tab, setTab] = useState<string>(projectDue ? 'projects' : fishQuest ? 'creek' : scenes ? 'friends' : cart && merchantHere(c, day, s) && !boughtToday(s, day).length ? 'cart' : 'store');
  return (
    <Sheet title="Bramblewick" onClose={onClose}>
      <div class="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} class={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
            {t === 'store' ? "Goldie's store" : t === 'cart' ? "Ziggy's cart" : t === 'friends' ? (scenes ? 'Friends ♥' : 'Friends') : t === 'almanac' ? 'Almanac' : t === 'sketchbook' ? 'Sketchbook' : t === 'creek' ? 'Creek' : t === 'land' ? 'Land' : t === 'market' ? 'Market' : 'Projects'}
          </button>
        ))}
      </div>

      {tab === 'store' && (
        <>
          <h3>Tools</h3>
          <ul class="rows">
            {[...c.tools.values()].map((t) => {
              if (t.consumable) {
                const locked = t.unlock_level > s.level;
                return (
                  <li key={t.id} class="row-item">
                    <Icon name={t.id} size={30} />
                    <span class="row-name">
                      {t.name} <b>×{s.inventory[t.id] ?? 0}</b>
                      <small>{locked ? `Unlocks at level ${t.unlock_level}` : t.description}</small>
                    </span>
                    <button class="btn small" disabled={locked || s.coins < t.coins} onClick={() => game.buyFertilizer(1)}>
                      <span class="coin sm" aria-hidden="true" /> {t.coins}
                    </button>
                    <button class="btn small" disabled={locked || s.coins < t.coins * 5} onClick={() => game.buyFertilizer(5)}>
                      ×5
                    </button>
                  </li>
                );
              }
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
                    <button class="btn small" disabled={locked || s.coins < toolPrice(s, t)} onClick={() => game.buyTool(t.id)}>
                      <span class="coin sm" aria-hidden="true" /> {toolPrice(s, t)}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <h3>Decorations</h3>
          <p class="muted small">
            Farm Beauty <b>{beauty(s, c)}</b> · Fresh Pick tips +{Math.round(tipBonus(s, c) * 100)}% (up to +50%). Place them with <b>Decorate</b> in the seed tray.
          </p>
          <ul class="rows">
            {decorDefs(c)
              .filter((d) => !d.story)
              .map((d) => {
                const locked = d.level > s.level;
                const own = (stored(s)[d.id] ?? 0) + Object.values(placed(s)).filter((x) => x === d.id).length;
                return (
                  <li key={d.id} class="row-item">
                    <ItemIcon id={d.id} color={d.color} />
                    <span class="row-name">
                      {d.name} {own > 0 && <b>×{own}</b>}
                      <small>{locked ? `Unlocks at level ${d.level}` : `Beauty +${d.beauty}`}</small>
                    </span>
                    <button class="btn small" disabled={locked || s.coins < d.coins} onClick={() => game.buyDecor(d.id)}>
                      <span class="coin sm" aria-hidden="true" /> {d.coins.toLocaleString()}
                    </button>
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
                        <span class="coin sm" aria-hidden="true" /> {buildingPrice(s, b)}
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
          <LandSummary game={game} />
          <h3>Bruno's lumber yard</h3>
          <ul class="rows">
            {c.economy.lumber_yard.map((o) => (
              <li key={o.id} class="row-item">
                <Icon name={o.id} size={28} />
                <span class="row-name">
                  {o.qty} {itemName(c, o.id)} <small>You have {s.inventory[o.id] ?? 0}</small>
                </span>
                <button class="btn small" disabled={s.coins < brunoPrice(s, o.coins)} onClick={() => game.buyMaterial(o.id)}>
                  <span class="coin sm" aria-hidden="true" /> {brunoPrice(s, o.coins)}
                </button>
              </li>
            ))}
          </ul>
          <BarnUpgrade game={game} />
        </div>
      )}

      {tab === 'market' && <MarketTab game={game} day={day} />}
      {tab === 'cart' && <CartTab game={game} day={day} />}
      {tab === 'friends' && <FriendsTab game={game} day={day} onScene={onScene} />}
      {tab === 'almanac' && <AlmanacTab game={game} />}
      {tab === 'sketchbook' && <SketchbookTab game={game} />}
      {tab === 'creek' && <CreekTab game={game} />}

      {tab === 'projects' && (
        <div class="projects">
          {[...projects].sort((a, b) => Number((s.projects[a.id] ?? 0) >= a.stages.length) - Number((s.projects[b.id] ?? 0) >= b.stages.length)).map((p) => {
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
          {townOpen && <TownProjects game={game} day={day} />}
        </div>
      )}
    </Sheet>
  );
}

function TownProjects({ game, day }: { game: Game; day: number }) {
  const s = game.state;
  const c = game.content;
  const p = townProject(s, c, day);
  const done = s.town?.week === weekOf(day) && s.town.done;
  const daysLeft = 7 - (day % 7);
  const can = Object.entries(p.wants).every(([id, n]) => (s.inventory[id] ?? 0) >= n) && s.coins >= p.coins;
  return (
    <>
      <h3>This week's town project</h3>
      <div class="order">
        <Icon name="town" size={40} />
        <div class="order-body">
          <div class="order-who">
            {done ? 'Done this week!' : 'The whole town is pitching in'} <span class="chip story">🏆 {s.town?.trophies ?? 0}</span>
          </div>
          {done ? (
            <p class="muted small">A new project starts {daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`}.</p>
          ) : (
            <div class="order-wants">
              {Object.entries(p.wants).map(([id, n]) => (
                <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
              ))}
              <Need have={s.coins} need={p.coins} label="coins" />
            </div>
          )}
          {!done && <p class="muted small">Pays {p.ribbons} Ribbons and a trophy · {daysLeft === 1 ? 'last day' : `${daysLeft} days left`}</p>}
        </div>
        {!done && (
          <button class="btn small green" disabled={!can} onClick={() => game.deliverTownProject()}>
            Give
          </button>
        )}
      </div>
      <h3>Grow Bramblewick</h3>
      {(() => {
        const n = townLevel(s);
        const next = nextTownLevel(s, c);
        const ok = s.coins >= next.coins && Object.entries(next.wants).every(([id, q]) => (s.inventory[id] ?? 0) >= q);
        const bonus = Math.round(Math.min(n, TOWN_BONUS_LEVELS) * TOWN_BONUS_PER_LEVEL * 100);
        return (
          <div class="order">
            <span class="town-level" aria-label={`Town level ${n}`}>{n}</span>
            <div class="order-body">
              <div class="order-who">Town level {n} → {next.level}</div>
              <div class="order-wants">
                <Need have={s.coins} need={next.coins} label="coins" />
                {Object.entries(next.wants).map(([id, q]) => (
                  <Need key={id} have={s.inventory[id] ?? 0} need={q} label={itemName(c, id)} />
                ))}
              </div>
              <p class="muted small">
                Each level adds {TOWN_BONUS_PER_LEVEL * 100}% to everything you sell{n ? ` (now +${bonus}%)` : ''}, up to +{TOWN_BONUS_LEVELS * TOWN_BONUS_PER_LEVEL * 100}%.
              </p>
            </div>
            <button class="btn small green" disabled={!ok} onClick={() => game.raiseTownLevel()}>
              Grow
            </button>
          </div>
        );
      })()}
      <h3>Improve Bramblewick</h3>
      <ul class="rows">
        {improvements(c).map((d) => {
          const owned = hasImprovement(s, d.id);
          const locked = d.level > s.level;
          const v = c.villagers.get(d.by);
          const ok = s.coins >= d.coins && Object.entries(d.items ?? {}).every(([id, n]) => (s.inventory[id] ?? 0) >= n);
          return (
            <li key={d.id} class="row-item improvement">
              {v ? <Portrait v={v} size={36} /> : <Icon name="building" size={30} />}
              <span class="row-name">
                {d.name}
                <small>{owned ? `✓ ${d.perk}` : locked ? `Unlocks at level ${d.level}` : d.perk}</small>
                {!owned && !locked && (
                  <small class="needs">
                    <Need have={s.coins} need={d.coins} label="coins" />
                    {Object.entries(d.items ?? {}).map(([id, n]) => (
                      <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
                    ))}
                  </small>
                )}
              </span>
              {owned ? (
                <span class="chip owned">Built</span>
              ) : (
                <button class="btn small green" disabled={locked || !ok} onClick={() => game.buildImprovement(d.id)}>
                  Build
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

function CartTab({ game, day }: { game: Game; day: number }) {
  const s = game.state;
  const c = game.content;
  const ziggy = c.villagers.get('ziggy')!;
  const [msg, setMsg] = useState<string | null>(null);
  if (!merchantHere(c, day, s)) {
    const d = daysUntilMerchant(c, day, s);
    return (
      <div class="order">
        <Portrait v={ziggy} size={48} />
        <div class="order-body">
          <div class="order-who">Ziggy is on the road</div>
          <p class="muted small">His cart rolls back into Bramblewick {d === 1 ? 'tomorrow' : `in ${d} days`}, with new stock.</p>
        </div>
      </div>
    );
  }
  const stock = merchantStock(s, c, day);
  const sold = boughtToday(s, day);
  return (
    <>
      <div class="order">
        <Portrait v={ziggy} size={48} />
        <div class="order-body">
          <div class="order-who">Ziggy's cart is in town!</div>
          <p class="muted small">{msg ?? 'Only one of each, and only until midnight. New stock every visit.'}</p>
        </div>
      </div>
      <ul class="rows">
        {stock.map((slot, i) => {
          const isSold = sold.includes(i);
          const crop = slot.kind === 'seed' ? c.cropById.get(slot.crop) : undefined;
          return (
            <li key={i} class={`row-item${isSold ? ' sold' : ''}`}>
              {crop ? <ItemIcon id={crop.id} color={crop.color} /> : <Icon name={slot.kind === 'item' ? slot.id : 'ribbon'} size={30} />}
              <span class="row-name">
                {slot.label}
                <small>{slot.detail}</small>
              </span>
              {isSold ? (
                <span class="chip owned">Sold</span>
              ) : (
                <button
                  class="btn small"
                  disabled={s.coins < slot.coins}
                  onClick={() => {
                    const r = game.buyMerchant(i);
                    if (r.ok) setMsg(slot.kind === 'seed' ? `"${crop?.name} seeds! Plant them anywhere. I insist."` : '"A pleasure, as always!"');
                  }}
                >
                  <span class="coin sm" aria-hidden="true" /> {slot.coins.toLocaleString()}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The Field Sketchbook: every Meadow Visitor, page by page, with the pollen jar. */
type CastPhase = 'idle' | 'waiting' | 'bite' | 'early' | 'escaped' | 'caught';

/** Sky and water colours for the local hour. */
function creekSky(hour: number): { sky: string; water: string; label: string } {
  if (hour >= 5 && hour < 10) return { sky: '#f7c9a8', water: '#6aa6c2', label: 'Morning mist' };
  if (hour >= 10 && hour < 17) return { sky: '#a8daf2', water: '#4f9fc9', label: 'Midday' };
  if (hour >= 17 && hour < 21) return { sky: '#f2a46f', water: '#58819f', label: 'Evening' };
  return { sky: '#2c3a63', water: '#24395c', label: 'Night' };
}

/** Creek Dock fishing: cast, wait for the dip, reel in on time. Plus Nell's Creek Journal. */
function CreekTab({ game }: { game: Game }) {
  const s = game.state;
  const c = game.content;
  const f = s.fishing;
  const bites = f?.bites ?? 0;
  const cap = biteCap(s, c);
  const next = nextBiteIn(s, c, game.now());
  const [phase, setPhase] = useState<CastPhase>('idle');
  const [fish, setFish] = useState<FishDef | null>(null);
  const [result, setResult] = useState<CatchResult | null>(null);
  const [view, setView] = useState<'dock' | 'journal'>('dock');
  const [open, setOpen] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const clear = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };
  useEffect(() => clear, []);
  const hour = new Date().getHours();
  const sky = creekSky(hour);

  const cast = () => {
    if (bites <= 0) return;
    clear();
    const on = game.rollFish();
    setFish(on);
    setResult(null);
    setPhase('waiting');
    const wait = 1200 + Math.random() * 2300;
    timers.current.push(
      window.setTimeout(() => {
        setPhase('bite');
        navigator.vibrate?.(30);
        timers.current.push(window.setTimeout(() => setPhase('escaped'), on.window * 1000));
      }, wait),
    );
  };
  const reel = () => {
    if (phase === 'waiting') {
      clear();
      setPhase('early');
    } else if (phase === 'bite' && fish) {
      clear();
      const r = game.catchFish(fish.id);
      setResult(r);
      setPhase(r.ok ? 'caught' : 'idle');
    }
  };
  const casting = phase === 'waiting' || phase === 'bite';
  const seen = f?.seen ?? [];

  if (view === 'journal')
    return (
      <>
        <div class="row">
          <button class="btn small" onClick={() => setView('dock')}>
            ← Back to the dock
          </button>
          <span class="muted small">
            {seen.length}/{FISH.length} species
          </span>
        </div>
        {FISH_PAGES.map((page) => {
          const list = FISH.filter((x) => x.page === page);
          const found = list.filter((x) => seen.includes(x.id)).length;
          return (
            <section key={page}>
              <h3>
                Page {page} · {FISH_PAGE_TITLES[page] ?? ''} <span class="muted small">{found === list.length ? '✓ complete' : `${found}/${list.length}`}</span>
              </h3>
              <ul class="almanac">
                {list.map((x) => {
                  const got = seen.includes(x.id);
                  return (
                    <li key={x.id} class={`almanac-card${got ? '' : ' unknown'}`}>
                      <button class="critter-card" disabled={!got} onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
                        {got || !x.secret ? (
                          <span class={got ? '' : 'silhouette'}>
                            <ItemIcon id={x.id} color={x.color} />
                          </span>
                        ) : (
                          <span class="secret-mark" aria-hidden="true">?</span>
                        )}
                        <span class="almanac-name">{got ? x.name : x.secret ? '???' : 'Not yet caught'}</span>
                        <small>{got ? `Caught ${f?.caught[x.id] ?? 0}` : x.secret ? '' : fishHours(x)}</small>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {open && list.some((x) => x.id === open) && <p class="story-lines critter-note">“{FISH.find((x) => x.id === open)!.note}” <b>– Nell</b></p>}
            </section>
          );
        })}
      </>
    );

  return (
    <>
      <div class={`creek${phase === 'bite' ? ' biting' : ''}`} style={`--sky:${sky.sky};--water:${sky.water}`}>
        <svg class="creek-scene" viewBox="0 0 320 170" aria-hidden="true">
          <rect width="320" height="70" fill="var(--sky)" />
          {hour >= 21 || hour < 5 ? (
            <circle cx="262" cy="26" r="11" fill="#fdf3c8" stroke="#4a2e1a" stroke-width="2" />
          ) : (
            <circle cx="262" cy="30" r="13" fill="#ffe27a" stroke="#4a2e1a" stroke-width="2" />
          )}
          {/* far bank and Nell's houseboat */}
          <path d="M0 62c40-10 90-12 140-6s110 4 180-6v20H0z" fill="#5cb83a" stroke="#4a2e1a" stroke-width="2" />
          <g transform="translate(36 40)">
            <path d="M0 24h50l-6 8H6z" fill="#8a5a3a" stroke="#4a2e1a" stroke-width="2" stroke-linejoin="round" />
            <rect x="10" y="10" width="26" height="14" fill="#3f7f9e" stroke="#4a2e1a" stroke-width="2" />
            <path d="M7 11l16-9 16 9z" fill="#c0532f" stroke="#4a2e1a" stroke-width="2" stroke-linejoin="round" />
            <rect x="16" y="14" width="6" height="5" fill={hour >= 18 || hour < 6 ? '#ffe27a' : '#cfe8f5'} stroke="#4a2e1a" stroke-width="1.5" />
          </g>
          <rect y="70" width="320" height="100" fill="var(--water)" />
          <path d="M20 96h40M120 88h30M210 104h50M60 130h36M240 140h40" stroke="#ffffff" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round" />
          {/* line and bobber */}
          {(casting || phase === 'escaped' || phase === 'early') && (
            <>
              <path d="M300 160 Q240 60 172 112" stroke="#f6efe0" stroke-width="1.4" fill="none" />
              <g class="bobber" transform="translate(172 112)">
                <ellipse cx="0" cy="6" rx="12" ry="3.5" fill="#ffffff" opacity="0.35" class="ripple" />
                <circle cx="0" cy="0" r="6" fill="#ffffff" stroke="#4a2e1a" stroke-width="2" />
                <path d="M-6 0a6 6 0 0 1 12 0z" fill="#e23b2e" stroke="#4a2e1a" stroke-width="2" />
                <path d="M0-6v-5" stroke="#4a2e1a" stroke-width="2" stroke-linecap="round" />
              </g>
              {phase === 'bite' && (
                <text x="172" y="88" text-anchor="middle" class="creek-bang">
                  !
                </text>
              )}
            </>
          )}
          {/* the dock */}
          <path d="M210 170l30-26h80v26z" fill="#b07a4a" stroke="#4a2e1a" stroke-width="2.5" stroke-linejoin="round" />
          <path d="M236 147h84M228 154h92M220 161h100" stroke="#8a5a3a" stroke-width="1.5" />
        </svg>
        <div class="creek-hud">
          <span class="chip">{sky.label}</span>
          <span class="chip">
            Bites {bites}/{cap}
          </span>
        </div>
      </div>

      {phase === 'caught' && result?.ok ? (
        <div class="order catch">
          <ItemIcon id={result.fish.id} size={52} />
          <div class="order-body">
            <div class="order-who">
              {result.firstTime ? 'New! ' : ''}
              {result.fish.name}
            </div>
            {result.firstTime ? (
              <p class="story-lines small">
                “{result.fish.note}” <b>– Nell</b>
              </p>
            ) : (
              <p class="muted small">Added to your barn. Worth {result.fish.sell} coins at the crate.</p>
            )}
            {result.pageDone && <p class="small"><b>Journal page {result.pageDone} complete! +1 Ribbon</b></p>}
          </div>
        </div>
      ) : (
        <p class="muted small creek-msg" aria-live="polite">
          {phase === 'waiting'
            ? 'Watch the bobber…'
            : phase === 'bite'
              ? 'It’s biting! Reel in!'
              : phase === 'early'
                ? 'Too soon! It swam off. (No bite lost.)'
                : phase === 'escaped'
                  ? 'It got away! (No bite lost.)'
                  : bites > 0
                    ? 'Cast your line, wait for the bobber to dip, then reel in.'
                    : `All caught up. Next bite in about ${formatDuration(next ?? 0)}.`}
        </p>
      )}

      <div class="row creek-actions">
        {casting ? (
          <button class={`btn big ${phase === 'bite' ? 'gold pulse' : 'green'}`} onClick={reel}>
            Reel in!
          </button>
        ) : (
          <button class="btn big green" disabled={bites <= 0} onClick={cast}>
            {phase === 'idle' ? 'Cast' : 'Cast again'}
          </button>
        )}
        <button class="btn" onClick={() => (clear(), setPhase('idle'), setView('journal'))}>
          Journal {seen.length}/{FISH.length}
        </button>
      </div>
      {bites < cap && next !== null && bites > 0 && <p class="muted small">Next bite in about {formatDuration(next)}. The creek holds {cap}.</p>}
    </>
  );
}

function fishHours(f: FishDef): string {
  if (f.hours === 'any') return f.needs ? 'Any time, for experts' : 'Any time';
  const [a, b] = f.hours;
  const h = (x: number) => (x === 0 ? '12am' : x < 12 ? `${x}am` : x === 12 ? '12pm' : `${x - 12}pm`);
  return `${h(a)}–${h(b)}`;
}

function SketchbookTab({ game }: { game: Game }) {
  const s = game.state;
  const c = game.content;
  const seen = s.critters?.seen ?? [];
  const pollen = s.critters?.pollen ?? 0;
  const per = pollenPerHoney(c);
  const next = nextVisitorIn(s, c, game.now());
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <p class="muted small">
        Little visitors drop by while your crops grow. Tap them on the farm: each one gives pollen, and new ones get sketched here. Finish a page for a Ribbon.
      </p>
      <div class="order">
        <ItemIcon id="honey" size={40} />
        <div class="order-body">
          <div class="order-who">
            Pollen jar {pollen}/{per}
          </div>
          <div class="grow-bar small" role="progressbar" aria-valuenow={pollen} aria-valuemax={per}>
            <i style={{ width: `${(pollen / per) * 100}%` }} />
          </div>
          <p class="muted small">
            Every {per} pollen makes a Honey (you have {s.inventory.honey ?? 0}).
            <br />
            {(s.critters?.out.length ?? 0) > 0
              ? `${s.critters!.out.length} visiting your farm now!`
              : next !== null
                ? `Next visitor in about ${formatDuration(next)}.`
                : 'Plant something and visitors will come.'}
          </p>
        </div>
      </div>
      {PAGES.map((page) => {
        const list = CRITTERS.filter((x) => x.page === page);
        const found = list.filter((x) => seen.includes(x.id)).length;
        return (
          <section key={page}>
            <h3>
              Page {page} · {PAGE_TITLES[page] ?? ''} <span class="muted small">{found === list.length ? '✓ complete' : `${found}/${list.length}`}</span>
            </h3>
            <ul class="almanac">
              {list.map((x) => {
                const got = seen.includes(x.id);
                return (
                  <li key={x.id} class={`almanac-card${got ? '' : ' unknown'}`}>
                    <button class="critter-card" disabled={!got} onClick={() => setOpen(open === x.id ? null : x.id)} aria-expanded={open === x.id}>
                      <CritterIcon shape={x.shape} color={x.color} unknown={!got} />
                      <span class="almanac-name">{got ? x.name : x.secret ? '???' : 'Not yet seen'}</span>
                      {!got && !x.secret && <small>{x.crops === 'any' ? 'Any crop' : x.crops.map((id) => c.cropById.get(id)?.name).join(', ')}</small>}
                    </button>
                  </li>
                );
              })}
            </ul>
            {open && list.some((x) => x.id === open) && <p class="story-lines critter-note">“{CRITTERS.find((x) => x.id === open)!.note}” <b>– Hazel</b></p>}
          </section>
        );
      })}
    </>
  );
}

function AlmanacTab({ game }: { game: Game }) {
  const s = game.state;
  const c = game.content;
  const found = c.crops.filter((x) => s.seen.includes(x.id)).length;
  const [open, setOpen] = useState<string | null>(null);
  const pct = Math.round(MASTERY_STEP * 100);
  return (
    <>
      <p class="muted small">
        Hazel's Almanac · <b>{found}/{c.crops.length}</b> crops recorded · <b>{lifetimeHarvests(s).toLocaleString()}</b> crops grown. Each mastery level earns a Ribbon and lets you pick +{pct}% coins or +{pct}% XP for that crop. Tap a crop to see its mastery.
      </p>
      <ul class="almanac">
        {c.crops.map((x) => {
          const seen = s.seen.includes(x.id);
          const n = s.harvests?.[x.id] ?? 0;
          const lv = masteryLevel(s, x.id);
          const next = masteryThreshold(lv + 1);
          const prev = lv ? masteryThreshold(lv) : 0;
          const pending = masteryPending(s, x.id);
          return (
            <li key={x.id} class={`almanac-card${seen ? '' : ' unknown'}${pending ? ' pending' : ''}`} onClick={() => seen && setOpen(x.id)}>
              {seen ? <ItemIcon id={x.id} color={x.color} /> : <span class="seed-icon" style={{ background: '#cfc4b0' }} aria-hidden="true" />}
              <span class="almanac-name">{seen ? x.name : '???'}</span>
              {seen && <span class="stars">{lv ? <span class="on">★ {lv}</span> : '★ 0'}</span>}
              {seen && (
                <span class="mini-bar" aria-hidden="true">
                  <i style={{ width: `${Math.round(((n - prev) / (next - prev)) * 100)}%` }} />
                </span>
              )}
              <small>{seen ? (pending ? 'Choose a bonus!' : `${n}/${next} harvests`) : `Level ${x.unlock_level}`}</small>
            </li>
          );
        })}
      </ul>
      {open && <MasteryCard game={game} cropId={open} onClose={() => setOpen(null)} />}
    </>
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
          <ItemIcon id={featured} color={c.cropById.get(featured)?.color} small />
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
              <ItemIcon id={id} color={c.cropById.get(id)?.color ?? c.goods.get(id)?.color} small />
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
              {out ? <ItemIcon id={out.id} color={out.color} small /> : <span class="slot-empty">+</span>}
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
              <ItemIcon id={r.output} color={c.goods.get(r.output)?.color} small />
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

function BarnUpgrade({ game }: { game: Game }) {
  const s = game.state;
  const c = game.content;
  const next = nextBarn(s, c);
  return (
    <>
      <h3>Barn</h3>
      <p class="muted">
        Holds {barnCapacity(s, c)} crops and goods.
      </p>
      {next ? (
        <div class="order">
          <Icon name="barn" size={40} />
          <div class="order-body">
            <div class="order-who">Bigger barn: {next.capacity}</div>
            <div class="order-wants">
              <Need have={s.coins} need={brunoPrice(s, next.coins ?? 0)} label="coins" />
              {Object.entries(next.items ?? {}).map(([id, n]) => (
                <Need key={id} have={s.inventory[id] ?? 0} need={n} label={itemName(c, id)} />
              ))}
            </div>
          </div>
          <button class="btn small green" disabled={s.coins < brunoPrice(s, next.coins ?? 0) || !hasItems(s, next.items ?? {})} onClick={() => game.buyBarn()}>
            Build
          </button>
        </div>
      ) : (
        <p class="muted">Your barn is as big as it gets.</p>
      )}
    </>
  );
}

function Hearts({ n, progress }: { n: number; progress: number }) {
  return (
    <span class="hearts" aria-label={`${n} of 10 hearts`}>
      {Array.from({ length: 10 }, (_, i) => (
        <Icon key={i} name={i < n ? 'heart' : 'heart-empty'} size={15} />
      ))}
      {n < 10 && <span class="heart-next" style={{ width: `${Math.round(progress * 100)}%` }} />}
    </span>
  );
}

function FriendsTab({ game, day, onScene }: { game: Game; day: number; onScene: SceneFn }) {
  const s = game.state;
  const c = game.content;
  const [giving, setGiving] = useState<string | null>(null);
  const giftable = Object.keys(s.inventory).filter((id) => c.cropById.has(id) || c.goods.has(id));
  return (
    <>
      <p class="muted small">Give each friend one gift a day. Filling their orders and finishing their quests helps too. At 5 hearts they'll do something nice for you.</p>
      <ul class="rows">
        {friends(s, c).map((id) => {
          const v = c.villagers.get(id)!;
          const h = hearts(s, c, id);
          const can = canGiftToday(s, id, day);
          return (
            <li key={id} class="friend">
              <div class="friend-head">
                <Portrait v={v} size={48} />
                <div class="friend-body">
                  <div class="order-who">
                    {v.name} <small>{v.role}</small>
                  </div>
                  <Hearts n={h} progress={heartProgress(s, c, id)} />
                </div>
                <button class="btn small green" disabled={!can || !giftable.length} onClick={() => setGiving(giving === id ? null : id)}>
                  {can ? 'Gift' : 'Gifted'}
                </button>
              </div>
              <p class="chatter">“{chatter(s, c, id, day)}”</p>
              {pendingEvents(s, c)
                .filter((e) => e.villager === id)
                .slice(0, 1)
                .map((e) => (
                  <button
                    key={e.hearts}
                    class="btn small green scene-btn"
                    onClick={() => {
                      const ev = game.watchEvent(id, e.hearts);
                      if (ev) onScene(v, ev.title, ev.lines);
                    }}
                  >
                    <Icon name="heart" size={16} /> {shortName(v)} wants to talk: “{e.title}”
                  </button>
                ))}
              {seenEvents(s, c, id).length > 0 && (
                <div class="memories">
                  {seenEvents(s, c, id).map((e) => (
                    <button key={e.hearts} class="memory" onClick={() => onScene(v, e.title, e.lines)}>
                      ♥{e.hearts} {e.title}
                    </button>
                  ))}
                </div>
              )}
              <p class="muted small">
                Loves {v.loves?.map((x) => itemName(c, x).toLowerCase()).join(', ')}
                {h >= 5 ? ` · ${v.perk}` : ` · At 5 hearts: ${v.perk}`}
              </p>
              {giving === id && (
                <div class="gift-pick">
                  {giftable.map((item) => {
                    const t = taste(c, id, item);
                    return (
                      <button
                        key={item}
                        class={`gift-item ${t}`}
                        onClick={() => {
                          game.gift(id, item);
                          setGiving(null);
                        }}
                      >
                        <ItemIcon id={item} color={c.cropById.get(item)?.color ?? c.goods.get(item)?.color} small />
                        {itemName(c, item)}
                        {t === 'loved' && <Icon name="heart" size={14} />}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
