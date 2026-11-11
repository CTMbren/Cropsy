import critterJson from '../../content/critters.json';
import type { Content } from './content';
import { addItem, hasFlag, progress, stageOf, type FarmState } from './farm';
import { addFriendship } from './friendship';
import { fnv1a } from './save';

/**
 * Meadow Visitors: little critters visit crops while they grow. One arrives every 5–10 minutes
 * while anything is growing (time away counts), up to 5 on the farm at once, and they wait until
 * tapped. Which species turns up depends on the crop and how far along it is. Tapping gives pollen
 * (5 make a Honey); the first of each species is sketched into the Field Sketchbook, and every
 * finished page earns a Ribbon. Visitors never touch crop timers and never pay coins.
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
}

interface CritterConfig {
  min_s: number;
  max_s: number;
  cap: number;
  pollen_per_honey: number;
  unlock_level: number;
  hazel_points: number;
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

/** Plots with a crop still growing (not ripe), no obstacle, and no visitor already on them. */
function hostPlots(state: FarmState, now: number, taken: Set<string>): string[] {
  return Object.keys(state.plots)
    .filter((k) => {
      const p = state.plots[k];
      return p.crop && !state.obstacles[k] && !taken.has(k) && stageOf(p, now) !== 'ripe';
    })
    .sort();
}

/** Species that would visit this plot right now. */
export function speciesFor(state: FarmState, plot: string, now: number): CritterDef[] {
  const p = state.plots[plot];
  if (!p?.crop) return [];
  const f = progress(p, now);
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

function ensure(state: FarmState, content: Content, now: number) {
  state.critters ??= { out: [], nextAt: now + spawnGap(content, 0), n: 0, seen: [], pollen: 0 };
  return state.critters;
}

/**
 * Brings the farm's visitors up to date: moves visitors off plots that ripened or emptied (or
 * sends them back to wait), then lands any that arrived since the last check, up to the cap.
 */
export function syncCritters(state: FarmState, content: Content, now: number): Visitor[] {
  if (!crittersOpen(state, content)) return [];
  const c = ensure(state, content, now);
  const cap = cfg(content).cap;
  const arrived: Visitor[] = [];
  // visitors whose crop ripened, was harvested or dug up fly to another growing plot (keeping
  // their species when it fits there), or leave if nothing is growing
  const taken = new Set<string>();
  const displaced: Visitor[] = [];
  const keep: Visitor[] = [];
  for (const v of c.out) {
    const p = state.plots[v.plot];
    if (p?.crop && !state.obstacles[v.plot] && stageOf(p, now) !== 'ripe' && !taken.has(v.plot)) {
      keep.push(v);
      taken.add(v.plot);
    } else displaced.push(v);
  }
  c.out = keep;
  for (const v of displaced) {
    const hosts = hostPlots(state, now, taken);
    if (!hosts.length) break;
    const fits = hosts.filter((k) => speciesFor(state, k, now).some((s) => s.id === v.species));
    const k = (fits.length ? fits : hosts)[Math.floor(hash01(`move:${v.id}:${now}`) * (fits.length || hosts.length))];
    const species = fits.length ? v.species : pick(speciesFor(state, k, now), hash01(`moved:${v.id}`)).id;
    c.out.push({ ...v, species, plot: k });
    taken.add(k);
  }
  // new arrivals: only while something is growing; the clock doesn't run on an empty farm
  for (let guard = 0; c.nextAt <= now && guard < 500; guard++) {
    const hosts = hostPlots(state, now, taken);
    if (!hosts.length || c.out.length >= cap) {
      // nothing to land on, or the farm is full: the next one comes a full gap after now
      c.nextAt = now + spawnGap(content, c.n);
      break;
    }
    const k = hosts[Math.floor(hash01(`plot:${c.n}`) * hosts.length)];
    const sp = speciesFor(state, k, now);
    if (!sp.length) {
      c.nextAt = now + spawnGap(content, c.n);
      break;
    }
    const v = { id: c.n, species: pick(sp, hash01(`species:${c.n}`)).id, plot: k };
    c.out.push(v);
    taken.add(k);
    arrived.push(v);
    c.n += 1;
    c.nextAt += spawnGap(content, c.n);
  }
  return arrived;
}

export type TapResult =
  | { ok: true; species: CritterDef; firstTime: boolean; honey: number; pollen: number; pageDone?: number }
  | { ok: false; reason: 'gone' };

export function tapCritter(state: FarmState, content: Content, id: number): TapResult {
  const c = state.critters;
  const i = c?.out.findIndex((v) => v.id === id) ?? -1;
  if (!c || i < 0) return { ok: false, reason: 'gone' };
  const [v] = c.out.splice(i, 1);
  const species = critterById.get(v.species)!;
  const cf = cfg(content);
  c.pollen += 1;
  let honey = 0;
  while (c.pollen >= cf.pollen_per_honey) {
    c.pollen -= cf.pollen_per_honey;
    honey += 1;
  }
  if (honey) addItem(state, 'honey', honey);
  const firstTime = !c.seen.includes(species.id);
  let pageDone: number | undefined;
  if (firstTime) {
    c.seen.push(species.id);
    if (hasFlag(state, 'met_hazel')) addFriendship(state, content, 'hazel', cf.hazel_points);
    if (CRITTERS.filter((x) => x.page === species.page).every((x) => c.seen.includes(x.id))) {
      pageDone = species.page;
      state.ribbons += 1;
    }
  }
  return { ok: true, species, firstTime, honey, pollen: c.pollen, pageDone };
}

/** Seconds until the next visitor, or null when none can come (nothing growing, or the farm is full). */
export function nextVisitorIn(state: FarmState, content: Content, now: number): number | null {
  const c = state.critters;
  if (!c || !crittersOpen(state, content) || c.out.length >= cfg(content).cap) return null;
  if (!hostPlots(state, now, new Set(c.out.map((v) => v.plot))).length) return null;
  return Math.max(0, c.nextAt - now);
}

export const pollenPerHoney = (content: Content) => cfg(content).pollen_per_honey;
