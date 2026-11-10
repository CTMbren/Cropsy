import type { Content, CropDef } from './content';
import { addXp } from './progression';
import type { TimeState } from './time';

export const SAVE_VERSION = 1;

export interface PlotState {
  crop: string | null;
  plantedAt: number;
  /** Snapshotted at planting so a later rebalance never changes crops already in the ground. */
  growS: number;
}

export interface FarmState {
  version: number;
  coins: number;
  xp: number;
  level: number;
  width: number;
  height: number;
  /** Keyed "x,y". */
  plots: Record<string, PlotState>;
  inventory: Record<string, number>;
  time: TimeState;
  lastSeen: number;
}

export type Stage = 'empty' | 'seed' | 'sprout' | 'growing' | 'ripe';

export const key = (x: number, y: number) => `${x},${y}`;

export function newFarm(now: number): FarmState {
  const width = 4;
  const height = 4;
  const plots: Record<string, PlotState> = {};
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) plots[key(x, y)] = { crop: null, plantedAt: 0, growS: 0 };
  return {
    version: SAVE_VERSION,
    coins: 30,
    xp: 0,
    level: 1,
    width,
    height,
    plots,
    inventory: {},
    time: { maxSeenTime: now, debugOffset: 0 },
    lastSeen: now,
  };
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

export type ActionResult =
  | { ok: true; kind: 'planted'; crop: CropDef }
  | { ok: true; kind: 'harvested'; crop: CropDef; coins: number; xp: number; fresh: boolean; levelsGained: number }
  | { ok: false; reason: 'no-plot' | 'occupied' | 'not-ripe' | 'locked' | 'no-coins' | 'unknown-crop' };

export function plant(state: FarmState, content: Content, k: string, cropId: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (plot.crop) return { ok: false, reason: 'occupied' };
  const crop = content.cropById.get(cropId);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  if (crop.unlock_level > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < crop.seed_cost) return { ok: false, reason: 'no-coins' };
  state.coins -= crop.seed_cost;
  state.plots[k] = { crop: crop.id, plantedAt: now, growS: crop.grow_s };
  return { ok: true, kind: 'planted', crop };
}

/**
 * Harvest sells straight to the shipping crate for now (70% would be the crate rate in the full
 * economy; the slice pays full price so the first minutes feel generous).
 */
export function harvest(state: FarmState, content: Content, k: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (!plot.crop || stageOf(plot, now) !== 'ripe') return { ok: false, reason: 'not-ripe' };
  const crop = content.cropById.get(plot.crop);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  const fresh = isFresh(plot, now);
  const coins = Math.round(crop.sell * (fresh ? 1.2 : 1));
  const xp = Math.round(crop.xp * (fresh ? 1.5 : 1));
  state.coins += coins;
  const lv = addXp(state.level, state.xp, xp);
  state.level = lv.level;
  state.xp = lv.xp;
  state.plots[k] = { crop: null, plantedAt: 0, growS: 0 };
  return { ok: true, kind: 'harvested', crop, coins, xp, fresh, levelsGained: lv.levelsGained };
}

export interface AwaySummary {
  awaySeconds: number;
  ripe: { crop: string; count: number }[];
}

/** What changed while the player was away — shown on return instead of push notifications. */
export function awaySummary(state: FarmState, content: Content, now: number): AwaySummary {
  const counts = new Map<string, number>();
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const ripeAt = p.plantedAt + p.growS;
    if (ripeAt > state.lastSeen && ripeAt <= now) counts.set(p.crop, (counts.get(p.crop) ?? 0) + 1);
  }
  return {
    awaySeconds: Math.max(0, now - state.lastSeen),
    ripe: [...counts].map(([id, count]) => ({ crop: content.cropById.get(id)?.name ?? id, count })),
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
