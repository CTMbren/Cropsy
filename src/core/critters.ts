import critterJson from '../../content/critters.json';
import type { Content } from './content';
import { addItem, hasFlag, progress, type FarmState } from './farm';
import { addFriendship } from './friendship';
import { fnv1a } from './save';

/**
 * Meadow Visitors: little critters visit crops. One arrives every 5–10 minutes while anything is
 * planted (time away counts, ripe crops included), up to 6 on the farm at once, and they wait on
 * their plot until tapped or until it's harvested (then they leave a pollen behind). Arrivals past
 * the cap drop pollen in the jar instead, up to a limit per absence. Which species turns up depends
 * on the crop and how far along it was when it arrived. Tapping gives pollen (5 make a Honey); the
 * first of each species is sketched into the Field Sketchbook, the 3rd and 10th sightings earn a
 * stamp and a new note, and every finished page earns a Ribbon. Visitors never touch crop timers
 * and never pay coins.
 */

export type CritterShape = 'ladybug' | 'bee' | 'snail' | 'caterpillar' | 'butterfly' | 'beetle' | 'dragonfly' | 'moth';

export interface CritterDef {
  id: string;
  name: string;
  shape: CritterShape;
  color: string;
  page: number;
  /** Crops it visits, or "any". */
  crops: string[] | 'any';
  /** How grown the crop must be (0–1). */
  min: number;
  /** Relative chance among the species that fit a plot. */
  weight: number;
  /** Hidden in the sketchbook until found. */
  secret?: boolean;
  note: string;
  /** Hazel's notes for the 3rd and 10th sightings. */
  stamps: [string, string];
}

export const CRITTERS = critterJson as CritterDef[];
export const critterById = new Map(CRITTERS.map((c) => [c.id, c]));
export const PAGES = [...new Set(CRITTERS.map((c) => c.page))].sort((a, b) => a - b);
export const PAGE_TITLES: Record<number, string> = { 1: 'Early risers', 2: 'Summer field', 3: 'Orchard and vine', 4: 'Rare visitors' };

export interface Visitor {
  /** Unique per farm, so taps and animations can track one visitor. */
  id: number;
  species: string;
  plot: string;
  /** When it landed (a plot replanted after this means its crop was harvested). */
  at?: number;
}

export interface CritterState {
  out: Visitor[];
  nextAt: number;
  n: number;
  seen: string[];
  pollen: number;
  /** Sightings per species (taps), for the stamps. */
  counts?: Record<string, number>;
  /** Pollen banked by arrivals past the cap since you last tapped a visitor. */
  banked?: number;
}

interface CritterConfig {
  min_s: number;
  max_s: number;
  cap: number;
  pollen_per_honey: number;
  unlock_level: number;
  hazel_points: number;
  /** Most pollen the jar banks from arrivals past the cap, per absence. */
  overflow_max: number;
  /** Sightings that earn a stamp (and +1 pollen, and a new note). */
  stamps: number[];
  /** Extra Hazel friendship for a finished Sketchbook page. */
  page_hazel_points: number;
  /** The very first visitor arrives this many seconds after something is planted. */
  first_s: number;
  /** How much likelier a golden melon plot is to be picked, once the Golden Moth has been seen. */
  melon_weight: number;
}

const cfg = (content: Content) => (content.economy as unknown as { critters: CritterConfig }).critters;

/** A number in [0, 1) fixed by a seed string, so spawns don't reroll on reload. */
function hash01(seed: string): number {
  return parseInt(fnv1a(seed), 16) / 0x100000000;
}

/** The wait before visitor number n: 5–10 minutes. */
export function spawnGap(content: Content, n: number): number {
  const c = cfg(content);
  return Math.round(c.min_s + hash01(`gap:${n}`) * (c.max_s - c.min_s));
}

export const crittersOpen = (state: FarmState, content: Content) => state.level >= cfg(content).unlock_level;

/** Plots with a crop planted by time `t` (still there now, ripe or not), no obstacle, no visitor. */
function hostPlots(state: FarmState, t: number, taken: Set<string>): string[] {
  return Object.keys(state.plots)
    .filter((k) => {
      const p = state.plots[k];
      return p.crop && !state.obstacles[k] && !taken.has(k) && p.plantedAt <= t;
    })
    .sort();
}

/** Species that would visit this plot at time `t` (how grown it was then decides). */
export function speciesFor(state: FarmState, plot: string, t: number): CritterDef[] {
  const p = state.plots[plot];
  if (!p?.crop) return [];
  const f = progress(p, t);
  return CRITTERS.filter((c) => (c.crops === 'any' || c.crops.includes(p.crop!)) && f >= c.min);
}

function pick<T extends { weight: number }>(list: T[], r: number): T {
  const total = list.reduce((a, x) => a + x.weight, 0);
  let x = r * total;
  for (const item of list) {
    x -= item.weight;
    if (x < 0) return item;
  }
  return list[list.length - 1];
}

function ensure(state: FarmState, content: Content, now: number): CritterState {
  // the very first visitor comes quickly, so a new player meets the feature
  state.critters ??= { out: [], nextAt: now + cfg(content).first_s, n: 0, seen: [], pollen: 0 };
  return state.critters;
}

/** Adds pollen to the jar; whole jars become Honey. Returns the honey made. */
function addPollen(state: FarmState, content: Content, c: CritterState, n: number): number {
  c.pollen += n;
  let honey = 0;
  while (c.pollen >= cfg(content).pollen_per_honey) {
    c.pollen -= cfg(content).pollen_per_honey;
    honey += 1;
  }
  if (honey) addItem(state, 'honey', honey);
  return honey;
}

export interface SyncResult {
  arrived: Visitor[];
  /** Visitors whose plot was harvested or cleared: each left a pollen. */
  left: Visitor[];
  /** Pollen banked by arrivals while the farm was full. */
  banked: number;
  honey: number;
  /** The very first visitor ever (Hazel says hello). */
  first: boolean;
  /** The Golden Moth's guaranteed first visit. */
  moth: boolean;
}

/**
 * Brings the farm's visitors up to date. Visitors stay on their plot until it's harvested (then
 * they leave a pollen); arrivals since the last check land in order, each judged at the time it
 * arrived, so a field that ripened while you were away still had visitors. Past the cap, arrivals
 * drop pollen in the jar instead (up to a limit until you next tap one).
 */
export function syncCritters(state: FarmState, content: Content, now: number): SyncResult {
  const res: SyncResult = { arrived: [], left: [], banked: 0, honey: 0, first: false, moth: false };
  if (!crittersOpen(state, content)) return res;
  const cf = cfg(content);
  const c = ensure(state, content, now);
  // visitors whose plot was harvested, dug up or cleared fly off, leaving a pollen behind
  const taken = new Set<string>();
  const keep: Visitor[] = [];
  for (const v of c.out) {
    const p = state.plots[v.plot];
    const stays = p?.crop && !state.obstacles[v.plot] && !taken.has(v.plot) && (v.at === undefined || p.plantedAt <= v.at);
    if (stays) {
      keep.push(v);
      taken.add(v.plot);
    } else res.left.push(v);
  }
  c.out = keep;
  if (res.left.length) res.honey += addPollen(state, content, c, res.left.length);

  // the Golden Moth always comes to your first golden melon once it's half grown
  if (!c.seen.includes('golden_moth') && !c.out.some((v) => v.species === 'golden_moth')) {
    const melon = Object.keys(state.plots)
      .sort()
      .find((k) => state.plots[k].crop === 'golden_melon' && !taken.has(k) && !state.obstacles[k] && progress(state.plots[k], now) >= 0.5);
    if (melon) {
      const v = { id: c.n, species: 'golden_moth', plot: melon, at: now };
      c.out.push(v);
      taken.add(melon);
      res.arrived.push(v);
      res.moth = true;
      c.n += 1;
    }
  }

  // new arrivals, each at its own time
  for (let guard = 0; c.nextAt <= now; guard++) {
    if (guard >= 200) {
      c.nextAt = now + spawnGap(content, c.n);
      break;
    }
    const t = c.nextAt;
    if (c.out.length >= cf.cap) {
      // the farm is full: this one drops a pollen in the jar instead (up to a limit)
      if ((c.banked ?? 0) >= cf.overflow_max) {
        c.nextAt = now + spawnGap(content, c.n);
        break;
      }
      c.banked = (c.banked ?? 0) + 1;
      res.banked += 1;
      c.n += 1;
      c.nextAt = t + spawnGap(content, c.n);
      continue;
    }
    const hosts = hostPlots(state, t, taken);
    if (!hosts.length) {
      // nothing was planted yet at t: the clock starts again when the next crop went in
      const later = Object.values(state.plots)
        .filter((p) => p.crop && p.plantedAt > t && p.plantedAt <= now)
        .map((p) => p.plantedAt);
      const gap = c.n === 0 ? cf.first_s : spawnGap(content, c.n);
      if (later.length) {
        c.nextAt = Math.min(...later) + gap;
        continue;
      }
      c.nextAt = now + gap;
      break;
    }
    // the first visitor ever lands on the newest crop; golden melons draw a crowd once the moth is known
    let k: string;
    if (c.n === 0) k = hosts.reduce((a, b) => (state.plots[b].plantedAt > state.plots[a].plantedAt ? b : a));
    else {
      const w = hosts.map((h) => (state.plots[h].crop === 'golden_melon' && c.seen.includes('golden_moth') ? cf.melon_weight : 1));
      let x = hash01(`plot:${c.n}`) * w.reduce((a, b) => a + b, 0);
      k = hosts[hosts.length - 1];
      for (let i = 0; i < hosts.length; i++) {
        x -= w[i];
        if (x < 0) {
          k = hosts[i];
          break;
        }
      }
    }
    // the Golden Moth's first visit is the guaranteed one above; after that it can come by chance
    const sp = speciesFor(state, k, t).filter((x) => x.id !== 'golden_moth' || c.seen.includes('golden_moth'));
    if (!sp.length) {
      c.nextAt = t + spawnGap(content, c.n);
      continue;
    }
    const v = { id: c.n, species: pick(sp, hash01(`species:${c.n}`)).id, plot: k, at: t };
    if (c.n === 0) res.first = true;
    c.out.push(v);
    taken.add(k);
    res.arrived.push(v);
    c.n += 1;
    c.nextAt = t + spawnGap(content, c.n);
  }
  if (res.banked) res.honey += addPollen(state, content, c, res.banked);
  return res;
}

export type TapResult =
  | { ok: true; species: CritterDef; firstTime: boolean; honey: number; pollen: number; pageDone?: number; stamp?: { n: number; note: string } }
  | { ok: false; reason: 'gone' };

export function tapCritter(state: FarmState, content: Content, id: number): TapResult {
  const c = state.critters;
  const i = c?.out.findIndex((v) => v.id === id) ?? -1;
  if (!c || i < 0) return { ok: false, reason: 'gone' };
  const [v] = c.out.splice(i, 1);
  const species = critterById.get(v.species)!;
  const cf = cfg(content);
  // you're here tapping, so the jar's away-time allowance starts over
  c.banked = 0;
  const count = ((c.counts ??= {})[species.id] ?? 0) + 1;
  c.counts[species.id] = count;
  const s = cf.stamps.indexOf(count);
  const stamp = s >= 0 ? { n: count, note: species.stamps[s] } : undefined;
  const honey = addPollen(state, content, c, 1 + (stamp ? 1 : 0));
  const firstTime = !c.seen.includes(species.id);
  let pageDone: number | undefined;
  if (firstTime) {
    c.seen.push(species.id);
    if (hasFlag(state, 'met_hazel')) addFriendship(state, content, 'hazel', cf.hazel_points);
    if (CRITTERS.filter((x) => x.page === species.page).every((x) => c.seen.includes(x.id))) {
      pageDone = species.page;
      state.ribbons += 1;
      if (hasFlag(state, 'met_hazel')) addFriendship(state, content, 'hazel', cf.page_hazel_points);
    }
  }
  return { ok: true, species, firstTime, honey, pollen: c.pollen, pageDone, ...(stamp ? { stamp } : {}) };
}

/** Seconds until the next visitor, or null when none can come (nothing growing, or the farm is full). */
export function nextVisitorIn(state: FarmState, content: Content, now: number): number | null {
  const c = state.critters;
  if (!c || !crittersOpen(state, content) || c.out.length >= cfg(content).cap) return null;
  if (!hostPlots(state, now, new Set(c.out.map((v) => v.plot))).length) return null;
  return Math.max(0, c.nextAt - now);
}

export const pollenPerHoney = (content: Content) => cfg(content).pollen_per_honey;
export const stampThresholds = (content: Content) => cfg(content).stamps;
export const critterCap = (content: Content) => cfg(content).cap;
