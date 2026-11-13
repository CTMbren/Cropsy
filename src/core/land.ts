import { hash01 } from './rand';
import type { Content } from './content';
import { addItem, emptyPlot, key, parseKey, type FarmState } from './farm';
import { fnv1a } from './save';
import { brunoPrice } from './shop';

/**
 * Land is won back one plot at a time. The field sits in a 9×9 homestead whose wild cells are
 * overgrown with old stumps and boulders. Any wild cell touching the field (side by side, not
 * diagonally) can be cleared by Bruno's crew: it costs coins and takes 30 minutes or more, one
 * plot at a time. When the crew finishes, the cell becomes a new plot and its wood or stone is
 * yours. How many plots you can own grows with your level. Bruno's gate (Chapter 1) opens this.
 */

export type Blocker = 'stump' | 'boulder';

interface LandConfig {
  max_size: number;
  caps: { level: number; plots: number }[];
  base_coins: number;
  coin_growth: number;
  stump_s: number;
  boulder_s: number;
  time_growth: number;
  stump_wood: number;
  boulder_stone: number;
  gold_chance: number;
}

const cfg = (content: Content) => (content.economy as unknown as { land: LandConfig }).land;
/** The original (weak) roll. Kept only for the map's stump/boulder layout, so uncleared land never changes. */
const layoutRoll = (seed: string) => parseInt(fnv1a(seed), 16) / 0x100000000;

/** Bruno clears land once he's rebuilt the gate (the first expansion comes from the story). */
export const landOpen = (state: FarmState) => state.expansions >= 1;

/** What's growing over a wild cell. Fixed per cell, roughly 60% stumps and 40% boulders. */
export const blockerAt = (cell: string): Blocker => (layoutRoll(`wild:${cell}`) < 0.4 ? 'boulder' : 'stump');

export function inHomestead(content: Content, cell: string): boolean {
  const [x, y] = parseKey(cell);
  const n = cfg(content).max_size;
  return x >= 0 && y >= 0 && x < n && y < n;
}

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const N8 = [...N4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Wild cells next to the field (diagonals included), which the farm draws as overgrown land. */
export function wildCells(state: FarmState, content: Content): string[] {
  const out = new Set<string>();
  for (const k of Object.keys(state.plots)) {
    const [x, y] = parseKey(k);
    for (const [dx, dy] of N8) {
      const c = key(x + dx, y + dy);
      if (!state.plots[c] && inHomestead(content, c)) out.add(c);
    }
  }
  return [...out].sort();
}

/** Can this wild cell be cleared (it shares a side with the field)? */
export function touchesField(state: FarmState, cell: string): boolean {
  const [x, y] = parseKey(cell);
  return !state.plots[cell] && N4.some(([dx, dy]) => !!state.plots[key(x + dx, y + dy)]);
}

/** The most plots you may own at your level. */
export function plotCap(state: FarmState, content: Content): number {
  return cfg(content)
    .caps.filter((c) => c.level <= state.level)
    .reduce((m, c) => Math.max(m, c.plots), 0);
}

/** The level that raises the cap next, if any. */
export function nextCapLevel(state: FarmState, content: Content): { level: number; plots: number } | null {
  return cfg(content).caps.find((c) => c.level > state.level) ?? null;
}

export const plotCount = (state: FarmState) => Object.keys(state.plots).length;

/** Coins for the next plot: rises gently with every plot beyond the first 25. */
export function clearCost(state: FarmState, content: Content): number {
  const c = cfg(content);
  const extra = Math.max(0, plotCount(state) - 25);
  return brunoPrice(state, Math.round((c.base_coins * Math.pow(c.coin_growth, extra)) / 5) * 5);
}

/** How long the crew takes: 30 min for a stump, 1 h for a boulder, a little longer per plot owned. */
export function clearTime(state: FarmState, content: Content, kind: Blocker): number {
  const c = cfg(content);
  const extra = Math.max(0, plotCount(state) - 25);
  return Math.round((kind === 'stump' ? c.stump_s : c.boulder_s) * (1 + c.time_growth * extra));
}

export function clearReward(content: Content, cell: string, kind: Blocker): { item: string; qty: number; gold: boolean } {
  const c = cfg(content);
  return kind === 'stump' ? { item: 'wood', qty: c.stump_wood, gold: false } : { item: 'stone', qty: c.boulder_stone, gold: hash01(`gold:${cell}`) < c.gold_chance };
}

export type ClearResult = { ok: true; endsAt: number } | { ok: false; reason: 'locked' | 'busy' | 'not-wild' | 'not-adjacent' | 'cap' | 'no-coins' };

export function startClearing(state: FarmState, content: Content, cell: string, now: number): ClearResult {
  if (!landOpen(state)) return { ok: false, reason: 'locked' };
  if (state.clearing) return { ok: false, reason: 'busy' };
  if (state.plots[cell] || !inHomestead(content, cell)) return { ok: false, reason: 'not-wild' };
  if (!touchesField(state, cell)) return { ok: false, reason: 'not-adjacent' };
  if (plotCount(state) >= plotCap(state, content)) return { ok: false, reason: 'cap' };
  const coins = clearCost(state, content);
  if (state.coins < coins) return { ok: false, reason: 'no-coins' };
  state.coins -= coins;
  const kind = blockerAt(cell);
  state.clearing = { cell, kind, endsAt: now + clearTime(state, content, kind) };
  return { ok: true, endsAt: state.clearing.endsAt };
}

/** Finishes the crew's job when its time is up: the cell becomes a plot and pays its wood or stone. */
export function syncLand(state: FarmState, content: Content, now: number): { cell: string; item: string; qty: number; gold: boolean } | null {
  const job = state.clearing;
  if (!job || now < job.endsAt) return null;
  delete state.clearing;
  const [x, y] = parseKey(job.cell);
  state.plots[job.cell] = emptyPlot();
  state.width = Math.max(state.width, x + 1);
  state.height = Math.max(state.height, y + 1);
  const r = clearReward(content, job.cell, job.kind);
  addItem(state, r.item, r.qty);
  if (r.gold) addItem(state, 'gold', 1);
  return { cell: job.cell, ...r };
}
