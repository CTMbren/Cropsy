import { itemValue, type Content, type ExpansionDef, type ToolDef } from './content';
import { addItem, expand, hasItems, takeItems, unlockedCrops, type FarmState } from './farm';
import { fnv1a } from './save';
import { rng } from './time';

// ── Goldie's store: tools ─────────────────────────────────────────

export type BuyResult = { ok: true } | { ok: false; reason: 'locked' | 'owned' | 'no-coins' | 'missing' | 'unknown' };

export function buyTool(state: FarmState, content: Content, id: string): BuyResult {
  const t: ToolDef | undefined = content.tools.get(id);
  if (!t) return { ok: false, reason: 'unknown' };
  if (state.tools.includes(id)) return { ok: false, reason: 'owned' };
  if (t.unlock_level > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < t.coins) return { ok: false, reason: 'no-coins' };
  state.coins -= t.coins;
  state.tools.push(id);
  return { ok: true };
}

// ── Bruno: land expansions ───────────────────────────────────────

/** The next expansion Bruno can build, or null when the farm is at full size. Tier 0 comes from the story. */
export function nextExpansion(state: FarmState, content: Content): ExpansionDef | null {
  return content.economy.expansions[state.expansions] ?? null;
}

export function buyExpansion(state: FarmState, content: Content): BuyResult {
  const e = nextExpansion(state, content);
  if (!e || e.story) return { ok: false, reason: 'unknown' };
  if ((e.level ?? 1) > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < (e.coins ?? 0)) return { ok: false, reason: 'no-coins' };
  if (!hasItems(state, e.items ?? {})) return { ok: false, reason: 'missing' };
  state.coins -= e.coins ?? 0;
  takeItems(state, e.items ?? {});
  expand(state);
  return { ok: true };
}

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
  state.coins += price * qty;
  return price * qty;
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
