import notesJson from '../../content/notes.json';
import tipsJson from '../../content/tips.json';
import { specialOpen } from './board';
import type { Content } from './content';
import { crittersOpen } from './critters';
import { hasFlag, log, type FarmState } from './farm';
import { fishingOpen } from './fishing';
import { friends } from './friendship';
import { landOpen } from './land';
import { merchantUnlocked } from './merchant';
import { marketOpen } from './shop';
import { sendMail } from './story';
import { townProjectOpen } from './town';

/**
 * Tobias's notes: his old farming notebook, handed over when Chapter 1 ends. Pages open as the
 * systems they explain open, so nothing is spoiled. Plus the tips layer: one-time nudges from the
 * villager who runs a thing, and an occasional tip from the notes. Both retire for good once the
 * player already does what they suggest.
 */

// ── Unlock rules ─────────────────────────────────────────────────
export type Unlock = 'start' | 'market' | 'board' | 'special' | 'soil' | 'land' | 'buildings' | 'friends' | 'ziggy' | 'almanac' | 'meadow' | 'creek' | 'town' | 'pickling' | 'loom' | 'upgrade';

export const UNLOCK_HINT: Record<Unlock, string> = {
  start: '',
  market: 'Opens when the market square is rebuilt',
  board: 'Opens with the Board',
  special: 'Opens with the Daily Special',
  soil: 'Opens at level 10',
  land: 'Opens when Bruno opens the back field',
  buildings: 'Opens with your first building',
  friends: 'Opens when you make a friend',
  ziggy: "Opens when Ziggy's cart comes to town",
  almanac: "Opens with Hazel's Almanac",
  meadow: 'Opens at level 3',
  creek: 'Opens when the creek dock is rebuilt',
  town: 'Opens at level 10',
  pickling: "Opens with Goldie's pickle crocks",
  loom: 'Opens at level 17',
  upgrade: 'Opens at level 15',
};

export function unlocked(state: FarmState, content: Content, u: Unlock): boolean {
  switch (u) {
    case 'start':
      return true;
    case 'market':
      return marketOpen(state, content);
    case 'board':
      return hasFlag(state, 'board_open');
    case 'special':
      return hasFlag(state, 'board_open') && specialOpen(state, content);
    case 'soil':
      return state.level >= (content.economy.soil[1]?.level ?? 10);
    case 'land':
      return landOpen(state);
    case 'buildings':
      return hasFlag(state, 'mill_built') || Object.keys(state.buildings ?? {}).length > 0;
    case 'friends':
      return friends(state, content).length > 0;
    case 'ziggy':
      return merchantUnlocked(state);
    case 'almanac':
      return hasFlag(state, 'almanac_open');
    case 'meadow':
      return crittersOpen(state, content);
    case 'creek':
      return fishingOpen(state);
    case 'town':
      return townProjectOpen(state, content);
    case 'pickling':
      return !!state.buildings.pickling;
    case 'loom':
      return state.level >= (content.buildings.get('loom')?.unlock_level ?? 17);
    case 'upgrade':
      return state.level >= 15 && Object.keys(state.buildings).length > 0;
  }
}

/** Where a page's "Try it" (or a tip's "Show me") goes: the farm, a sheet, a Town tab, or a notes page. */
export type Target = string;

// ── Pages ────────────────────────────────────────────────────────
export type Bullet = string | { text: string; needs: Unlock };
export interface NotesPage {
  id: string;
  title: string;
  icon: string;
  intro: string;
  bullets: Bullet[];
  table?: boolean;
  try: Target;
}

export const NOTES_PAGES = notesJson as NotesPage[];

export const PAGE_UNLOCK: Record<string, Unlock> = {
  planting: 'start',
  selling: 'start',
  board: 'board',
  planning: 'start',
  land: 'land',
  buildings: 'buildings',
  friends: 'friends',
  ziggy: 'ziggy',
  almanac: 'almanac',
  meadow: 'meadow',
  creek: 'creek',
  town: 'town',
  ribbons: 'start',
};

/** Has Tobias's notebook been handed over (end of Chapter 1)? */
export const notesOpen = (state: FarmState) => hasFlag(state, 'notes_open');

export interface PageView {
  page: NotesPage;
  open: boolean;
  isNew: boolean;
  /** Bullets the player can see right now. */
  bullets: string[];
  hint: string;
}

export function notesPages(state: FarmState, content: Content): PageView[] {
  const read = state.notes?.read ?? [];
  return NOTES_PAGES.map((page) => {
    const u = PAGE_UNLOCK[page.id] ?? 'start';
    const open = unlocked(state, content, u);
    const bullets = page.bullets.filter((b) => typeof b === 'string' || unlocked(state, content, b.needs)).map((b) => (typeof b === 'string' ? b : b.text));
    // a page counts as new again when one of its locked bullets opens
    const sig = `${page.id}:${bullets.length}`;
    return { page, open, isNew: open && !read.includes(sig), bullets, hint: UNLOCK_HINT[u] };
  });
}

/** Pages with something unread (for the menu dot). */
export const unreadPages = (state: FarmState, content: Content) => (notesOpen(state) ? notesPages(state, content).filter((p) => p.isNew) : []);

export function readPage(state: FarmState, content: Content, id: string, now: number): void {
  const v = notesPages(state, content).find((p) => p.page.id === id);
  if (!v?.open) return;
  state.notes ??= { read: [] };
  const sig = `${id}:${v.bullets.length}`;
  if (state.notes.read.includes(sig)) return;
  state.notes.read = state.notes.read.filter((x) => !x.startsWith(`${id}:`));
  state.notes.read.push(sig);
  log(state, now, `notes page ${id}`);
}

/**
 * Keeps Tobias's notes in step with the farm: sends his letter once the notebook is handed over,
 * and returns the titles of pages that have opened since the last sync (for a toast).
 */
export function syncNotes(state: FarmState, content: Content, now: number, offsetMin: number): string[] {
  if (!notesOpen(state)) return [];
  if (!state.mail.some((m) => m.id === 'tobias_notes')) sendMail(state, 'tobias_notes', 'now', now, offsetMin);
  state.notes ??= { read: [] };
  const views = notesPages(state, content);
  const sigs = views.filter((v) => v.open).map((v) => `${v.page.id}:${v.bullets.length}`);
  const first = !state.notes.known;
  const known = new Set(state.notes.known ?? []);
  state.notes.known = sigs;
  if (first) return [];
  return views.filter((v) => v.open && !known.has(`${v.page.id}:${v.bullets.length}`)).map((v) => v.page.title);
}

// ── Tips ─────────────────────────────────────────────────────────
/** Things the player does that retire a tip: market sales, featured sales, orders, Fresh Picks, barn upgrades, mastery picks, long crops planted. */
export type Habit = 'market' | 'featured' | 'orders' | 'fresh' | 'barn' | 'picks' | 'long';

export interface NudgeDef {
  id: string;
  from: string;
  text: string;
  show: Target;
  retire: Partial<Record<Habit, number>>;
}
export interface TipDef {
  id: string;
  text: string;
  page: string;
  needs?: Unlock;
  retire?: Partial<Record<Habit, number>>;
}

export const NUDGES = (tipsJson as { nudges: NudgeDef[] }).nudges;
export const TIPS = (tipsJson as { tips: TipDef[] }).tips;

/** Tips of the day are at least this far apart. */
export const TIP_GAP_S = 4 * 3600;

export interface Banner {
  id: string;
  /** Villager id for the portrait (Tobias for tips of the day). */
  from: string;
  /** "From Tobias's notes" for tips; the villager's name is added by the UI for nudges. */
  tip: boolean;
  text: string;
  show: Target;
}

export interface TipState {
  /** Nudges and tips already shown. */
  shown: string[];
  /** When a tip or nudge last showed. */
  lastAt?: number;
  /** Habit counters. */
  did: Partial<Record<Habit, number>>;
  /** When a mastery star was first seen waiting, for the "mastery waiting" nudge. */
  pendingSince?: number;
}

const tips = (state: FarmState): TipState => (state.tipState ??= { shown: [], did: {} });

export const tipsOn = (state: FarmState) => state.settings.tips !== false;

export function did(state: FarmState, habit: Habit, n = 1): void {
  const t = tips(state);
  t.did[habit] = (t.did[habit] ?? 0) + n;
}

export const habit = (state: FarmState, h: Habit) => state.tipState?.did[h] ?? 0;

function retired(state: FarmState, rule?: Partial<Record<Habit, number>>): boolean {
  if (!rule) return false;
  return Object.entries(rule).every(([h, n]) => habit(state, h as Habit) >= (n ?? 0));
}

/**
 * A one-time nudge, if it hasn't shown before and the player doesn't already do what it suggests.
 * `vars` fill {placeholders} in the text. Marks it shown.
 */
export function nudge(state: FarmState, id: string, now: number, vars: Record<string, string | number> = {}): Banner | null {
  if (!tipsOn(state) || !notesOpen(state)) return null;
  const def = NUDGES.find((n) => n.id === id);
  const t = tips(state);
  if (!def || t.shown.includes(id) || retired(state, def.retire)) return null;
  t.shown.push(id);
  t.lastAt = now;
  log(state, now, `tip shown ${id}`);
  return { id, from: def.from, tip: false, text: def.text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? '')), show: def.show };
}

/**
 * The tip of the day: at most one a session (the caller tracks the session), 4 hours apart, only once
 * the notebook is handed over, only for systems the player has, and never one they already follow.
 * Unseen tips come first, in priority order; once all are seen, the cycle starts again.
 */
export function tipOfTheDay(state: FarmState, content: Content, now: number): Banner | null {
  if (!tipsOn(state) || !notesOpen(state)) return null;
  const t = tips(state);
  if (t.lastAt !== undefined && now - t.lastAt < TIP_GAP_S) return null;
  const ok = TIPS.filter((x) => (!x.needs || unlocked(state, content, x.needs)) && !retired(state, x.retire));
  if (!ok.length) return null;
  let pick = ok.find((x) => !t.shown.includes(x.id));
  if (!pick) {
    // every tip seen: start the cycle again
    t.shown = t.shown.filter((id) => !TIPS.some((x) => x.id === id));
    pick = ok[0];
  }
  t.shown.push(pick.id);
  t.lastAt = now;
  log(state, now, `tip shown ${pick.id}`);
  return { id: pick.id, from: 'tobias', tip: true, text: pick.text, show: `notes:${pick.page}` };
}

/** Keeps the mastery-waiting clock: returns true once a star has been waiting a day. */
export function masteryWaitingADay(state: FarmState, pending: boolean, now: number): boolean {
  const t = tips(state);
  if (!pending) {
    t.pendingSince = undefined;
    return false;
  }
  t.pendingSince ??= now;
  return now - t.pendingSince >= 86400;
}
