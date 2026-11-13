import type { BuildingDef, Content, RecipeDef } from './content';
import { barnCapacity, barnUsed, grantXp, hasItems, storeInBarn, takeItems, type BuildingState, type FarmState, type QueueItem } from './farm';

/**
 * Processing buildings turn crops into goods. Each building works through its queue on one line,
 * or two once upgraded; every item's start and end are plain timestamps, so the queue keeps running
 * while the game is closed and nothing needs to tick.
 */

export function owned(state: FarmState, id: string): BuildingState | null {
  return state.buildings[id] ?? null;
}

export function recipeOf(b: BuildingDef, id: string): RecipeDef | undefined {
  return b.recipes.find((r) => r.id === id);
}

const endOf = (q: QueueItem) => q.startsAt + q.durS;

/** Crafting lines working at once: every slot for hands-off buildings (pickling), else 1 or 2. */
export const linesOf = (b: BuildingState, def?: BuildingDef) => (def?.parallel ? b.slots : (b.lines ?? 1));

/**
 * When a new item can start: now if a line is free, otherwise when the first busy line frees up.
 * With greedy scheduling, each line's last item is among the `lines` latest-ending items.
 */
function nextStart(b: BuildingState, def: BuildingDef, now: number): number {
  const ends = b.queue.map(endOf).sort((a, c) => c - a);
  const lines = linesOf(b, def);
  if (ends.length < lines) return now;
  return Math.max(now, Math.min(...ends.slice(0, lines)));
}

export type RecipeLock = { kind: 'open' } | { kind: 'level'; level: number } | { kind: 'card'; villager: string };

/** Whether a recipe can be made yet: by level, or with a friend's recipe card (3 hearts). */
export function recipeLock(state: FarmState, r: RecipeDef): RecipeLock {
  if (r.card && !state.flags.includes(`recipe:${r.id}`)) return { kind: 'card', villager: r.card };
  if ((r.level ?? 1) > state.level) return { kind: 'level', level: r.level! };
  return { kind: 'open' };
}
export const recipeOpen = (state: FarmState, r: RecipeDef) => recipeLock(state, r).kind === 'open';

/** Buildings with finished goods waiting to be collected, and how many. */
export function goodsReady(state: FarmState, now: number): { building: string; n: number }[] {
  return Object.entries(state.buildings)
    .map(([building, b]) => ({ building, n: b.queue.filter((q) => now >= endOf(q)).length }))
    .filter((x) => x.n > 0);
}

export type QueueView = { item: QueueItem; status: 'done' | 'working' | 'waiting'; remaining: number };

export function queueView(b: BuildingState, now: number): QueueView[] {
  return b.queue.map((item) => {
    const status = now >= endOf(item) ? 'done' : now >= item.startsAt ? 'working' : 'waiting';
    return { item, status, remaining: Math.max(0, endOf(item) - now) };
  });
}

export const readyCount = (b: BuildingState, now: number) => b.queue.filter((q) => now >= endOf(q)).length;

export type StartResult = { ok: true; item: QueueItem } | { ok: false; reason: 'not-owned' | 'full' | 'missing' | 'unknown' | 'locked' };

/** Adds a recipe to the building's queue, taking its inputs from the barn now. */
export function startRecipe(state: FarmState, content: Content, buildingId: string, recipeId: string, now: number): StartResult {
  const b = state.buildings[buildingId];
  const def = content.buildings.get(buildingId);
  if (!b || !def) return { ok: false, reason: 'not-owned' };
  const r = recipeOf(def, recipeId);
  if (!r) return { ok: false, reason: 'unknown' };
  if (!recipeOpen(state, r)) return { ok: false, reason: 'locked' };
  if (b.queue.length >= b.slots) return { ok: false, reason: 'full' };
  if (!hasItems(state, r.inputs)) return { ok: false, reason: 'missing' };
  takeItems(state, r.inputs);
  const item: QueueItem = { recipe: r.id, startsAt: nextStart(b, def, now), durS: recipeTime(state, buildingId, r) };
  b.queue.push(item);
  return { ok: true, item };
}

/** Pip's 5-heart perk: the bakery works 25% faster. */
export function recipeTime(state: FarmState, buildingId: string, r: RecipeDef): number {
  return buildingId === 'bakery' && state.flags.includes('perk:pip') ? Math.round(r.dur_s * 0.75) : r.dur_s;
}

/** Moves finished goods to the barn. Returns what was collected and levels gained. */
export function collect(state: FarmState, content: Content, buildingId: string, now: number): { items: Record<string, number>; levelsGained: number; leftForSpace: number } {
  const b = state.buildings[buildingId];
  const def = content.buildings.get(buildingId);
  const items: Record<string, number> = {};
  let xp = 0;
  let leftForSpace = 0;
  if (!b || !def) return { items, levelsGained: 0, leftForSpace };
  const keep: QueueItem[] = [];
  for (const q of b.queue) {
    const r = recipeOf(def, q.recipe);
    // a full barn leaves finished goods waiting in the building rather than shipping them
    if (r && now >= endOf(q) && barnUsed(state, content) >= barnCapacity(state, content)) {
      leftForSpace += 1;
      keep.push(q);
    } else if (r && now >= endOf(q)) {
      storeInBarn(state, content, r.output, 1);
      items[r.output] = (items[r.output] ?? 0) + 1;
      xp += r.xp;
    } else keep.push(q);
  }
  b.queue = keep;
  return { items, levelsGained: xp ? grantXp(state, xp) : 0, leftForSpace };
}

/** Extra queue slots cost Ribbons (design: 2, 4, 6), up to five slots. */
export function slotUpgradeCost(content: Content, b: BuildingState, def: BuildingDef): number | null {
  const i = b.slots - def.slots;
  return content.economy.slot_upgrade_ribbons[i] ?? null;
}

export function upgradeSlots(state: FarmState, content: Content, buildingId: string): boolean {
  const b = state.buildings[buildingId];
  const def = content.buildings.get(buildingId);
  if (!b || !def) return false;
  const cost = slotUpgradeCost(content, b, def);
  if (cost === null || state.ribbons < cost) return false;
  state.ribbons -= cost;
  b.slots += 1;
  return true;
}

export function grantBuilding(state: FarmState, content: Content, id: string): void {
  const def = content.buildings.get(id);
  if (def && !state.buildings[id]) state.buildings[id] = { slots: def.slots, queue: [] };
}

/** Goldie's 5-heart perk takes 10% off buildings. */
export function buildingPrice(state: FarmState, def: BuildingDef): number {
  const base = def.cost?.coins ?? 0;
  return state.flags.includes('perk:goldie') ? Math.round(base * 0.9) : base;
}

export function canAffordBuilding(state: FarmState, def: BuildingDef): boolean {
  return state.coins >= buildingPrice(state, def) && hasItems(state, def.cost?.items ?? {});
}

export function buyBuilding(state: FarmState, content: Content, id: string): boolean {
  const def = content.buildings.get(id);
  if (!def || def.where !== 'farm' || def.granted || state.buildings[id]) return false;
  if ((def.unlock_level ?? 1) > state.level || !canAffordBuilding(state, def)) return false;
  state.coins -= buildingPrice(state, def);
  takeItems(state, def.cost?.items ?? {});
  grantBuilding(state, content, id);
  return true;
}

// ── Second-line upgrades ─────────────────────────────────────────
export type UpgradeResult = { ok: true } | { ok: false; reason: 'not-owned' | 'none' | 'done' | 'level' | 'coins' | 'items' };

/** Can this building be upgraded to a second line now (and if not, why)? */
export function upgradeStatus(state: FarmState, content: Content, id: string): UpgradeResult {
  const b = state.buildings[id];
  const def = content.buildings.get(id);
  if (!b || !def) return { ok: false, reason: 'not-owned' };
  const u = def.upgrade;
  if (!u) return { ok: false, reason: 'none' };
  if (linesOf(b) >= 2) return { ok: false, reason: 'done' };
  if (state.level < u.level) return { ok: false, reason: 'level' };
  if (state.coins < u.coins) return { ok: false, reason: 'coins' };
  if (!hasItems(state, u.items ?? {})) return { ok: false, reason: 'items' };
  return { ok: true };
}

/** Buys the building's second line. Items already queued keep their times; new ones use the free line. */
export function buyUpgrade(state: FarmState, content: Content, id: string): UpgradeResult {
  const r = upgradeStatus(state, content, id);
  if (!r.ok) return r;
  const u = content.buildings.get(id)!.upgrade!;
  state.coins -= u.coins;
  takeItems(state, u.items ?? {});
  state.buildings[id].lines = 2;
  return r;
}
