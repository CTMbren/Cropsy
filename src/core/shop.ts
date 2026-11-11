import { itemValue, type BarnTier, type Content, type ToolDef } from './content';
import { addItem, hasItems, sellBonus, takeItems, unlockedCrops, type FarmState } from './farm';
import { fnv1a } from './save';
import { rng } from './time';

// ── Goldie's store: tools ─────────────────────────────────────────

export type BuyResult = { ok: true } | { ok: false; reason: 'locked' | 'owned' | 'no-coins' | 'missing' | 'unknown' };

/** Goldie's 5-heart perk takes 10% off tools; Bruno's takes 10% off land and barn upgrades. */
export const toolPrice = (state: FarmState, t: ToolDef) => (state.flags.includes('perk:goldie') && !t.consumable ? Math.round(t.coins * 0.9) : t.coins);
export const brunoPrice = (state: FarmState, coins: number) => (state.flags.includes('perk:bruno') ? Math.round(coins * 0.9) : coins);

export function buyTool(state: FarmState, content: Content, id: string, n = 1): BuyResult {
  const t: ToolDef | undefined = content.tools.get(id);
  if (!t) return { ok: false, reason: 'unknown' };
  if (!t.consumable && state.tools.includes(id)) return { ok: false, reason: 'owned' };
  if (t.unlock_level > state.level) return { ok: false, reason: 'locked' };
  const price = toolPrice(state, t) * (t.consumable ? n : 1);
  if (state.coins < price) return { ok: false, reason: 'no-coins' };
  state.coins -= price;
  if (t.consumable) addItem(state, id, n);
  else state.tools.push(id);
  return { ok: true };
}

// ── Bruno: barn upgrades ─────────────────────────────────────────

export function nextBarn(state: FarmState, content: Content): BarnTier | null {
  return content.economy.barn[state.barnLevel + 1] ?? null;
}

export function buyBarn(state: FarmState, content: Content): BuyResult {
  const b = nextBarn(state, content);
  if (!b) return { ok: false, reason: 'unknown' };
  const coins = brunoPrice(state, b.coins ?? 0);
  if (state.coins < coins) return { ok: false, reason: 'no-coins' };
  if (!hasItems(state, b.items ?? {})) return { ok: false, reason: 'missing' };
  state.coins -= coins;
  takeItems(state, b.items ?? {});
  state.barnLevel += 1;
  return { ok: true };
}

// Land is cleared plot by plot now: see land.ts.

// ── Market stall: daily prices ───────────────────────────────────

export const marketOpen = (state: FarmState, content: Content) => state.level >= content.economy.market.unlock_level;

/** Today's featured crop pays a bonus. Chosen from crops the player has unlocked. */
export function featuredCrop(state: FarmState, content: Content, day: number): string | null {
  const crops = unlockedCrops(state, content);
  if (!crops.length) return null;
  const r = rng(parseInt(fnv1a(`featured:${day}`), 16));
  return crops[Math.floor(r() * crops.length)].id;
}

/** Price multiplier for an item today: 0.8–1.4, the same all day, plus the featured bonus. */
export function priceFactor(state: FarmState, content: Content, itemId: string, day: number): number {
  const m = content.economy.market;
  const r = rng(parseInt(fnv1a(`price:${itemId}:${day}`), 16));
  const base = m.min + (m.max - m.min) * r();
  return Math.round((itemId === featuredCrop(state, content, day) ? base * m.featured_bonus : base) * 100) / 100;
}

export function marketPrice(state: FarmState, content: Content, itemId: string, day: number): number {
  const v = itemValue(content, itemId);
  return v === null ? 0 : Math.max(1, Math.round(v * priceFactor(state, content, itemId, day)));
}

export function marketSell(state: FarmState, content: Content, itemId: string, n: number, day: number): number {
  if (!marketOpen(state, content)) return 0;
  const qty = Math.min(n, state.inventory[itemId] ?? 0);
  const price = marketPrice(state, content, itemId, day);
  if (qty <= 0 || !price) return 0;
  addItem(state, itemId, -qty);
  const coins = Math.round(price * qty * sellBonus(state, itemId));
  state.coins += coins;
  return coins;
}

// ── Restoration projects ─────────────────────────────────────────

export type ProjectResult = { ok: true; stage: number; finished: boolean } | { ok: false; reason: 'unknown' | 'finished' | 'missing' | 'no-coins' | 'locked' };

/** Delivers the next stage of a village restoration project. */
export function deliverStage(state: FarmState, content: Content, id: string): ProjectResult {
  const p = content.projects.get(id);
  if (!p) return { ok: false, reason: 'unknown' };
  if (!state.flags.includes(`${id}_project`)) return { ok: false, reason: 'locked' };
  const done = state.projects[id] ?? 0;
  const st = p.stages[done];
  if (!st) return { ok: false, reason: 'finished' };
  if (!hasItems(state, st.items ?? {})) return { ok: false, reason: 'missing' };
  if (state.coins < (st.coins ?? 0)) return { ok: false, reason: 'no-coins' };
  takeItems(state, st.items ?? {});
  state.coins -= st.coins ?? 0;
  state.projects[id] = done + 1;
  return { ok: true, stage: done + 1, finished: done + 1 >= p.stages.length };
}

// ── Bruno's lumber yard ─────────────────────────────────────────

export function buyMaterial(state: FarmState, content: Content, id: string): BuyResult {
  const offer = content.economy.lumber_yard.find((o) => o.id === id);
  if (!offer) return { ok: false, reason: 'unknown' };
  const coins = brunoPrice(state, offer.coins);
  if (state.coins < coins) return { ok: false, reason: 'no-coins' };
  state.coins -= coins;
  addItem(state, id, offer.qty);
  return { ok: true };
}
