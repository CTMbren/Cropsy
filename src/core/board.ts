import type { Content } from './content';
import { addItem, grantXp, hasFlag, hasItems, takeItems, unlockedCrops, type FarmState, type OrderState } from './farm';
import { fnv1a } from './save';
import { dayIndex, rng } from './time';

export const DAILY_ORDERS = 3;
/** Orders pay well above the crate (design: 1.6–2.2× base value). */
const ORDER_MULTIPLIER = 1.8;
const ORDER_VILLAGERS = ['goldie', 'bruno', 'rufus'];

/** Goods the player can make: from buildings they own (the mill counts once it's turning). */
function makeableGoods(state: FarmState, content: Content): { id: string; sell: number; xp: number }[] {
  const out: { id: string; sell: number; xp: number }[] = [];
  for (const [id, def] of content.buildings) {
    const usable = state.buildings[id] && (def.where === 'farm' || hasFlag(state, `${id}_built`));
    if (!usable) continue;
    for (const r of def.recipes) {
      const g = content.goods.get(r.output);
      if (g) out.push({ id: g.id, sell: g.sell, xp: r.xp });
    }
  }
  return out;
}

/** Today's generated orders. Deterministic per local day, so reopening the app shows the same board. */
export function generateOrders(state: FarmState, content: Content, day: number): OrderState[] {
  const crops: { id: string; sell: number; xp: number }[] = unlockedCrops(state, content);
  if (!crops.length) return [];
  const goods = makeableGoods(state, content);
  const orders: OrderState[] = [];
  for (let i = 0; i < DAILY_ORDERS; i++) {
    const r = rng(parseInt(fnv1a(`board:${day}:${i}`), 16));
    // only villagers you've met post orders
    const met = ORDER_VILLAGERS.filter((v) => v === 'goldie' || hasFlag(state, `met_${v}`));
    const villager = met[Math.floor(r() * met.length)];
    const wants: Record<string, number> = {};
    // about a third of orders ask for goods once you can make them
    const wantsGoods = goods.length > 0 && r() < 0.35;
    const pool = wantsGoods ? [...goods] : [...crops];
    const kinds = !wantsGoods && pool.length > 1 && r() < 0.4 ? 2 : 1;
    const value = { coins: 0, xp: 2 };
    for (let j = 0; j < kinds; j++) {
      const c = pool.splice(Math.floor(r() * pool.length), 1)[0];
      const n = wantsGoods ? 1 + Math.floor(r() * 2) : 2 + Math.floor(r() * 4);
      wants[c.id] = n;
      value.coins += c.sell * n;
      value.xp += c.xp * n;
    }
    const ribbons = r() < 0.25 ? 1 : 0;
    orders.push({ id: `day${day}_${i}`, villager, wants, coins: Math.round(value.coins * ORDER_MULTIPLIER), xp: value.xp, ...(ribbons ? { ribbons } : {}) });
  }
  return orders;
}

/** Refreshes generated orders at local midnight; story orders stay pinned. Returns true if refreshed. */
export function refreshBoard(state: FarmState, content: Content, now: number, offsetMin: number): boolean {
  if (!hasFlag(state, 'board_open')) return false;
  const day = dayIndex(now, offsetMin);
  if (state.board.day === day) return false;
  const pinned = state.board.orders.filter((o) => o.story);
  state.board = { day, orders: [...pinned, ...generateOrders(state, content, day)] };
  return true;
}

export function pinOrder(state: FarmState, order: OrderState): void {
  if (state.board.orders.some((o) => o.id === order.id)) return;
  state.board.orders.unshift(order);
}

export type FulfilResult = { ok: true; order: OrderState; levelsGained: number } | { ok: false; reason: 'missing' | 'unknown' };

export function fulfilOrder(state: FarmState, orderId: string): FulfilResult {
  const order = state.board.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: 'unknown' };
  if (!hasItems(state, order.wants)) return { ok: false, reason: 'missing' };
  takeItems(state, order.wants);
  state.coins += order.coins;
  state.ribbons += order.ribbons ?? 0;
  const levelsGained = grantXp(state, order.xp);
  state.board.orders = state.board.orders.filter((o) => o.id !== orderId);
  return { ok: true, order, levelsGained };
}

/** Test/debug helper. */
export function giveItems(state: FarmState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(state, id, n);
}
