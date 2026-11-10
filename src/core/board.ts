import type { Content } from './content';
import { addItem, grantXp, hasFlag, hasItems, takeItems, unlockedCrops, type FarmState, type OrderState } from './farm';
import { fnv1a } from './save';
import { dayIndex, rng } from './time';

export const DAILY_ORDERS = 3;
/** Orders pay well above the crate (design: 1.6–2.2× base value). */
const ORDER_MULTIPLIER = 1.8;
const ORDER_VILLAGERS = ['goldie', 'bruno'];

/** Today's generated orders. Deterministic per local day, so reopening the app shows the same board. */
export function generateOrders(state: FarmState, content: Content, day: number): OrderState[] {
  const crops = unlockedCrops(state, content);
  if (!crops.length) return [];
  const orders: OrderState[] = [];
  for (let i = 0; i < DAILY_ORDERS; i++) {
    const r = rng(parseInt(fnv1a(`board:${day}:${i}`), 16));
    const villager = ORDER_VILLAGERS[Math.floor(r() * ORDER_VILLAGERS.length)];
    const kinds = crops.length > 1 && r() < 0.4 ? 2 : 1;
    const wants: Record<string, number> = {};
    const pool = [...crops];
    for (let j = 0; j < kinds; j++) {
      const c = pool.splice(Math.floor(r() * pool.length), 1)[0];
      wants[c.id] = 2 + Math.floor(r() * 4);
    }
    let value = 0;
    let xp = 2;
    for (const [id, n] of Object.entries(wants)) {
      const c = content.cropById.get(id)!;
      value += c.sell * n;
      xp += c.xp * n;
    }
    orders.push({ id: `day${day}_${i}`, villager, wants, coins: Math.round(value * ORDER_MULTIPLIER), xp });
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
  const levelsGained = grantXp(state, order.xp);
  state.board.orders = state.board.orders.filter((o) => o.id !== orderId);
  return { ok: true, order, levelsGained };
}

/** Test/debug helper. */
export function giveItems(state: FarmState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(state, id, n);
}
