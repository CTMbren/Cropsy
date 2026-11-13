import { hash01 } from './rand';
import fishJson from '../../content/fish.json';
import type { Content } from './content';
import { addItem, hasFlag, type FarmState } from './farm';
import { addFriendship, type FriendshipChange } from './friendship';

/**
 * Creek Dock fishing (Chapter 6). Bites build up over real time, one every 4–8 minutes (time away
 * counts), up to 5 waiting (8 with Nell's 5-heart perk). Each catch uses one bite; a cast that's too
 * early or too late costs nothing. What bites depends on the local time of day. The first of each
 * species goes in the Creek Journal with a note from Nell, and a finished page earns a Ribbon.
 * Fish are items: they sell at the crate and make good gifts, but catching one never pays coins.
 */

export type FishShape = 'slim' | 'round' | 'long' | 'eel' | 'catfish' | 'crayfish';

export interface FishDef {
  id: string;
  name: string;
  page: number;
  /** Local hours it bites, [from, to) wrapping past midnight, or "any". */
  hours: [number, number] | 'any';
  weight: number;
  /** Seconds the player has to reel in once it bites. */
  window: number;
  sell: number;
  color: string;
  fin: string;
  shape: FishShape;
  /** Only bites once this many species are in the journal. */
  needs?: number;
  /** Hidden in the journal until caught. */
  secret?: boolean;
  note: string;
}

export const FISH = fishJson as FishDef[];
export const fishById = new Map(FISH.map((f) => [f.id, f]));
export const FISH_PAGES = [...new Set(FISH.map((f) => f.page))].sort((a, b) => a - b);
export const FISH_PAGE_TITLES: Record<number, string> = { 1: 'Shallows', 2: 'Dusk and dark', 3: 'Legends' };

interface FishingConfig {
  min_s: number;
  max_s: number;
  cap: number;
  perk_cap: number;
  nell_points: number;
}

const cfg = (content: Content) => (content.economy as unknown as { fishing: FishingConfig }).fishing;

export interface FishingState {
  bites: number;
  nextAt: number;
  /** Bites ever landed, which seeds the gap between them. */
  n: number;
  seen: string[];
  /** Catches per species. */
  caught: Record<string, number>;
}

export const fishingOpen = (state: FarmState) => hasFlag(state, 'creek_open');

export function biteCap(state: FarmState, content: Content): number {
  return hasFlag(state, 'perk:nell') ? cfg(content).perk_cap : cfg(content).cap;
}


/** The wait before bite number n: 4–8 minutes. */
export function biteGap(content: Content, n: number): number {
  const c = cfg(content);
  return Math.round(c.min_s + hash01(`bite:${n}`) * (c.max_s - c.min_s));
}

function ensure(state: FarmState, content: Content, now: number): FishingState {
  // the first visit starts with a full creek, so the tutorial never waits
  state.fishing ??= { bites: cfg(content).cap, nextAt: now + biteGap(content, 0), n: 0, seen: [], caught: {} };
  return state.fishing;
}

/** Brings bites up to date. Returns how many arrived. */
export function syncBites(state: FarmState, content: Content, now: number): number {
  if (!fishingOpen(state)) return 0;
  const f = ensure(state, content, now);
  const cap = biteCap(state, content);
  let added = 0;
  for (let guard = 0; f.nextAt <= now && guard < 500; guard++) {
    if (f.bites >= cap) {
      // a full creek doesn't bank more: the next bite is a full gap after now
      f.nextAt = now + biteGap(content, f.n);
      break;
    }
    f.bites += 1;
    f.n += 1;
    added += 1;
    f.nextAt += biteGap(content, f.n);
  }
  return added;
}

/** Seconds until the next bite, or null when the creek is full or closed. */
export function nextBiteIn(state: FarmState, content: Content, now: number): number | null {
  const f = state.fishing;
  if (!f || !fishingOpen(state) || f.bites >= biteCap(state, content)) return null;
  return Math.max(0, f.nextAt - now);
}

/** Local hour (0–23) for a time and a time zone offset in minutes (Date#getTimezoneOffset sign). */
export function localHour(now: number, offsetMin: number): number {
  return Math.floor((((now - offsetMin * 60) % 86400) + 86400) % 86400 / 3600);
}

function inHours(f: FishDef, hour: number): boolean {
  if (f.hours === 'any') return true;
  const [a, b] = f.hours;
  return a < b ? hour >= a && hour < b : hour >= a || hour < b;
}

/** Fish that could bite right now. */
export function fishNow(state: FarmState, now: number, offsetMin: number): FishDef[] {
  const hour = localHour(now, offsetMin);
  const seen = state.fishing?.seen.length ?? 0;
  return FISH.filter((f) => inHours(f, hour) && seen >= (f.needs ?? 0));
}

/** Picks what's on the line for a cast. `r` is a random number in [0, 1). */
export function rollFish(state: FarmState, now: number, offsetMin: number, r: number): FishDef {
  const list = fishNow(state, now, offsetMin);
  const total = list.reduce((a, f) => a + f.weight, 0);
  let x = r * total;
  for (const f of list) {
    x -= f.weight;
    if (x < 0) return f;
  }
  return list[list.length - 1];
}

export type CatchResult =
  | { ok: true; fish: FishDef; firstTime: boolean; pageDone?: number; friendship?: FriendshipChange }
  | { ok: false; reason: 'closed' | 'no_bites' | 'unknown' };

/** Lands a fish: uses a bite, adds it to the barn, and records it in the journal. */
export function catchFish(state: FarmState, content: Content, fishId: string, now: number): CatchResult {
  if (!fishingOpen(state)) return { ok: false, reason: 'closed' };
  const fish = fishById.get(fishId);
  if (!fish) return { ok: false, reason: 'unknown' };
  syncBites(state, content, now);
  const f = ensure(state, content, now);
  if (f.bites <= 0) return { ok: false, reason: 'no_bites' };
  // a full creek starts its clock again as soon as there's room
  if (f.bites >= biteCap(state, content)) f.nextAt = now + biteGap(content, f.n);
  f.bites -= 1;
  f.caught[fish.id] = (f.caught[fish.id] ?? 0) + 1;
  addItem(state, fish.id, 1);
  const firstTime = !f.seen.includes(fish.id);
  let pageDone: number | undefined;
  let friendship: FriendshipChange | undefined;
  if (firstTime) {
    f.seen.push(fish.id);
    if (hasFlag(state, 'met_nell')) friendship = addFriendship(state, content, 'nell', cfg(content).nell_points);
    if (FISH.filter((x) => x.page === fish.page).every((x) => f.seen.includes(x.id))) {
      pageDone = fish.page;
      state.ribbons += 1;
    }
  }
  return { ok: true, fish, firstTime, pageDone, friendship };
}

export const fishSpecies = (state: FarmState) => state.fishing?.seen.length ?? 0;
