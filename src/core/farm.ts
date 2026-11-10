import type { Content, CropDef, OrderDef } from './content';
import { addXp } from './progression';
import type { TimeState } from './time';

export const SAVE_VERSION = 2;

export type ObstacleKind = 'weeds' | 'branch' | 'rock';

export interface PlotState {
  crop: string | null;
  plantedAt: number;
  /** Snapshotted at planting so a later rebalance never changes crops already in the ground. */
  growS: number;
}

export type QuestStatus = 'offered' | 'active' | 'ready';

export interface StoryState {
  done: string[];
  active: { id: string; status: QuestStatus; progress: number[] } | null;
}

export interface MailState {
  id: string;
  arrivesAt: number;
  read: boolean;
}

export interface OrderState extends OrderDef {
  /** Set for orders pinned by a story quest; they survive the daily refresh. */
  story?: string;
}

export interface FarmState {
  version: number;
  coins: number;
  xp: number;
  level: number;
  width: number;
  height: number;
  /** Keyed "x,y". Every usable cell has a plot; obstacles sit on top of plots until cleared. */
  plots: Record<string, PlotState>;
  obstacles: Record<string, ObstacleKind>;
  /** Crops and materials (wood, stone). */
  inventory: Record<string, number>;
  /** Last crop planted per plot, for Replant All. */
  lastCrop: Record<string, string>;
  expansions: number;
  flags: string[];
  story: StoryState;
  mail: MailState[];
  board: { day: number; orders: OrderState[] };
  settings: { muted: boolean };
  /** Local-only event log for playtests (capped). */
  log: { t: number; e: string }[];
  time: TimeState;
  lastSeen: number;
}

export type Stage = 'empty' | 'seed' | 'sprout' | 'growing' | 'ripe';

export const key = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): [number, number] => k.split(',').map(Number) as [number, number];

/** Tobias's overgrown farm: most of the 4×4 field starts under weeds, branches and rocks. */
const START_OBSTACLES: Record<string, ObstacleKind> = {
  '0,0': 'weeds',
  '2,0': 'branch',
  '3,0': 'weeds',
  '2,1': 'weeds',
  '3,1': 'rock',
  '0,2': 'branch',
  '1,2': 'weeds',
  '3,2': 'branch',
  '0,3': 'rock',
  '1,3': 'weeds',
  '2,3': 'rock',
  '3,3': 'branch',
};
const EXPANSION_PATTERN: ObstacleKind[] = ['weeds', 'rock', 'branch', 'weeds', 'rock', 'weeds', 'branch', 'rock', 'weeds', 'weeds', 'branch'];

const emptyPlot = (): PlotState => ({ crop: null, plantedAt: 0, growS: 0 });

export function newFarm(now: number): FarmState {
  const width = 4;
  const height = 4;
  const plots: Record<string, PlotState> = {};
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) plots[key(x, y)] = emptyPlot();
  return {
    version: SAVE_VERSION,
    coins: 30,
    xp: 0,
    level: 1,
    width,
    height,
    plots,
    obstacles: { ...START_OBSTACLES },
    inventory: {},
    lastCrop: {},
    expansions: 0,
    flags: [],
    story: { done: [], active: null },
    mail: [],
    board: { day: -1, orders: [] },
    settings: { muted: false },
    log: [],
    time: { maxSeenTime: now, debugOffset: 0 },
    lastSeen: now,
  };
}

export const hasFlag = (s: FarmState, f: string) => s.flags.includes(f);
export function setFlag(s: FarmState, f: string): void {
  if (!s.flags.includes(f)) s.flags.push(f);
}

export function log(s: FarmState, now: number, e: string): void {
  s.log.push({ t: now, e });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

export function addItem(s: FarmState, id: string, n: number): void {
  s.inventory[id] = (s.inventory[id] ?? 0) + n;
  if (s.inventory[id] <= 0) delete s.inventory[id];
}

export function hasItems(s: FarmState, items: Record<string, number>): boolean {
  return Object.entries(items).every(([id, n]) => (s.inventory[id] ?? 0) >= n);
}

export function takeItems(s: FarmState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(s, id, -n);
}

/** Adds XP and returns how many levels were gained. */
export function grantXp(s: FarmState, xp: number): number {
  const r = addXp(s.level, s.xp, xp);
  s.level = r.level;
  s.xp = r.xp;
  return r.levelsGained;
}

/** Fraction 0..1 of growth; 1 means ripe. */
export function progress(p: PlotState, now: number): number {
  if (!p.crop) return 0;
  return Math.min(1, Math.max(0, (now - p.plantedAt) / p.growS));
}

export function stageOf(p: PlotState, now: number): Stage {
  if (!p.crop) return 'empty';
  const f = progress(p, now);
  if (f >= 1) return 'ripe';
  if (f >= 0.6) return 'growing';
  if (f >= 0.25) return 'sprout';
  return 'seed';
}

export function remaining(p: PlotState, now: number): number {
  return p.crop ? Math.max(0, p.plantedAt + p.growS - now) : 0;
}

/** Fresh Pick: harvesting within a window equal to the grow time (min 30 min, max 8 h) after ripening. */
export function freshWindow(growS: number): number {
  return Math.min(8 * 3600, Math.max(30 * 60, growS));
}

export function isFresh(p: PlotState, now: number): boolean {
  if (!p.crop) return false;
  const ripeAt = p.plantedAt + p.growS;
  return now >= ripeAt && now <= ripeAt + freshWindow(p.growS);
}

export function unlockedCrops(state: FarmState, content: Content): CropDef[] {
  return content.crops.filter((c) => c.unlock_level <= state.level);
}

/** Shipping crate pays 70% of a crop's value (never less than 1 coin). */
export const cratePrice = (crop: CropDef) => Math.max(1, Math.round(crop.sell * 0.7));

export type Fail = { ok: false; reason: 'no-plot' | 'occupied' | 'not-ripe' | 'locked' | 'no-coins' | 'unknown-crop' | 'blocked' | 'none' };
export type ActionResult =
  | { ok: true; kind: 'planted'; crop: CropDef }
  | { ok: true; kind: 'harvested'; crop: CropDef; tip: number; xp: number; fresh: boolean; levelsGained: number }
  | { ok: true; kind: 'cleared'; obstacle: ObstacleKind; item: string | null; cost: number; levelsGained: number }
  | Fail;

export const OBSTACLES: Record<ObstacleKind, { cost: number; item: string | null; xp: number; label: string }> = {
  weeds: { cost: 0, item: null, xp: 1, label: 'Weeds' },
  branch: { cost: 0, item: 'wood', xp: 1, label: 'Branches' },
  rock: { cost: 5, item: 'stone', xp: 2, label: 'Rock' },
};

export function clearObstacle(state: FarmState, k: string): ActionResult {
  const kind = state.obstacles[k];
  if (!kind) return { ok: false, reason: 'none' };
  const o = OBSTACLES[kind];
  if (state.coins < o.cost) return { ok: false, reason: 'no-coins' };
  state.coins -= o.cost;
  delete state.obstacles[k];
  if (o.item) addItem(state, o.item, 1);
  const levelsGained = grantXp(state, o.xp);
  return { ok: true, kind: 'cleared', obstacle: kind, item: o.item, cost: o.cost, levelsGained };
}

export function plant(state: FarmState, content: Content, k: string, cropId: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (state.obstacles[k]) return { ok: false, reason: 'blocked' };
  if (plot.crop) return { ok: false, reason: 'occupied' };
  const crop = content.cropById.get(cropId);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  if (crop.unlock_level > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < crop.seed_cost) return { ok: false, reason: 'no-coins' };
  state.coins -= crop.seed_cost;
  state.plots[k] = { crop: crop.id, plantedAt: now, growS: crop.grow_s };
  state.lastCrop[k] = crop.id;
  return { ok: true, kind: 'planted', crop };
}

/** Harvested crops go to the barn. A Fresh Pick adds a small coin tip and bonus XP. */
export function harvest(state: FarmState, content: Content, k: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (!plot.crop || stageOf(plot, now) !== 'ripe') return { ok: false, reason: 'not-ripe' };
  const crop = content.cropById.get(plot.crop);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  const fresh = isFresh(plot, now);
  const tip = fresh ? Math.max(1, Math.round(crop.sell * 0.2)) : 0;
  const xp = Math.round(crop.xp * (fresh ? 1.5 : 1));
  state.coins += tip;
  addItem(state, crop.id, 1);
  const levelsGained = grantXp(state, xp);
  state.plots[k] = emptyPlot();
  return { ok: true, kind: 'harvested', crop, tip, xp, fresh, levelsGained };
}

/** Plants each empty plot with the crop it last grew, as far as coins allow. Returns plots planted. */
export function replantAll(state: FarmState, content: Content, now: number): string[] {
  const planted: string[] = [];
  for (const [k, cropId] of Object.entries(state.lastCrop)) {
    const r = plant(state, content, k, cropId, now);
    if (r.ok) planted.push(k);
  }
  return planted;
}

/** Sells crops at the shipping crate. Returns coins earned (0 if nothing sold). */
export function sell(state: FarmState, content: Content, cropId: string, n: number): number {
  const crop = content.cropById.get(cropId);
  const have = state.inventory[cropId] ?? 0;
  const qty = Math.min(n, have);
  if (!crop || qty <= 0) return 0;
  const coins = cratePrice(crop) * qty;
  addItem(state, cropId, -qty);
  state.coins += coins;
  return coins;
}

/** Bruno's work: grows the field by one row and column, with fresh obstacles on the new cells. */
export function expand(state: FarmState): string[] {
  const w = state.width + 1;
  const h = state.height + 1;
  const added: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = key(x, y);
      if (state.plots[k]) continue;
      state.plots[k] = emptyPlot();
      added.push(k);
    }
  }
  added.forEach((k, i) => {
    if (i % 4 !== 3) state.obstacles[k] = EXPANSION_PATTERN[(i + state.expansions * 3) % EXPANSION_PATTERN.length];
  });
  state.width = w;
  state.height = h;
  state.expansions += 1;
  return added;
}

export interface AwaySummary {
  awaySeconds: number;
  ripe: { crop: string; count: number }[];
  newMail: number;
  newOrders: boolean;
}

/** What changed while the player was away — shown on return instead of push notifications. */
export function awaySummary(state: FarmState, content: Content, now: number, newOrders = false): AwaySummary {
  const counts = new Map<string, number>();
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const ripeAt = p.plantedAt + p.growS;
    if (ripeAt > state.lastSeen && ripeAt <= now) counts.set(p.crop, (counts.get(p.crop) ?? 0) + 1);
  }
  const newMail = state.mail.filter((m) => !m.read && m.arrivesAt > state.lastSeen && m.arrivesAt <= now).length;
  return {
    awaySeconds: Math.max(0, now - state.lastSeen),
    ripe: [...counts].map(([id, count]) => ({ crop: content.cropById.get(id)?.name ?? id, count })),
    newMail,
    newOrders,
  };
}

export function nextReady(state: FarmState, now: number): number | null {
  let best: number | null = null;
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const r = remaining(p, now);
    if (r > 0 && (best === null || r < best)) best = r;
  }
  return best;
}
