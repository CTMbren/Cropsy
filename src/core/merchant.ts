import { itemName, type Content } from './content';
import { addItem, hasFlag, setFlag, type FarmState } from './farm';
import { fnv1a } from './save';
import { rng } from './time';

/**
 * Ziggy's traveling cart. It rolls into town every few days (local days, so it arrives at
 * midnight wherever the player is) with four slots: a rare seed from a few levels ahead, a
 * material bundle, a gold nugget or a cheap material, and fertilizer. Stock comes from the day
 * number, so it needs no server and is the same all day. Each slot can be bought once per visit.
 */

export type MerchantSlot =
  | { kind: 'seed'; crop: string; coins: number; label: string; detail: string }
  | { kind: 'item'; id: string; qty: number; coins: number; label: string; detail: string };

export const merchantUnlocked = (state: FarmState) => hasFlag(state, 'merchant_open');

/** Is the cart in town on this local day? */
export function merchantHere(content: Content, day: number): boolean {
  const m = content.economy.merchant;
  return (((day + m.first_day_offset) % m.every_days) + m.every_days) % m.every_days === 0;
}

/** Days until the cart next arrives (0 = today). */
export function daysUntilMerchant(content: Content, day: number): number {
  for (let d = 0; d < content.economy.merchant.every_days; d++) if (merchantHere(content, day + d)) return d;
  return 0;
}

/** Ziggy's friend's price (his 5-heart perk). */
export const merchantPrice = (state: FarmState, coins: number) => (hasFlag(state, 'perk:ziggy') ? Math.round(coins * 0.9) : coins);

/**
 * Today's stock. It is fixed when the cart arrives (the first time it's looked at that day), so
 * buying a seed or levelling up mid-visit doesn't reshuffle the slots.
 */
export function merchantStock(state: FarmState, content: Content, day: number): MerchantSlot[] {
  if (state.merchant?.day === day && state.merchant.stock) return state.merchant.stock.map((s) => ({ ...s, coins: merchantPrice(state, s.coins) }));
  return rollStock(state, content, day).map((s) => ({ ...s, coins: merchantPrice(state, s.coins) }));
}

/** Records today's stock in the save when the cart is in town (call on each change). */
export function syncMerchant(state: FarmState, content: Content, day: number): void {
  if (!merchantUnlocked(state) || !merchantHere(content, day)) return;
  if (state.merchant?.day !== day || !state.merchant.stock) state.merchant = { day, bought: boughtToday(state, day), stock: rollStock(state, content, day) };
}

function rollStock(state: FarmState, content: Content, day: number): MerchantSlot[] {
  const m = content.economy.merchant;
  const r = rng(parseInt(fnv1a(`merchant:${day}`), 16));
  const slots: MerchantSlot[] = [];
  // 1. a seed from a few levels ahead that you haven't unlocked yet
  const [lo, hi] = m.seeds.levels_ahead;
  const seeds = content.crops.filter((c) => c.unlock_level > state.level && c.unlock_level - state.level >= lo && c.unlock_level - state.level <= hi && !hasFlag(state, `early:${c.id}`));
  const pool = seeds.length ? seeds : content.crops.filter((c) => c.unlock_level > state.level && !hasFlag(state, `early:${c.id}`)).slice(0, 1);
  if (pool.length) {
    const c = pool[Math.floor(r() * pool.length)];
    slots.push({ kind: 'seed', crop: c.id, coins: c.seed_cost * m.seeds.price_mult, label: `${c.name} seeds`, detail: `Plant ${c.name} now instead of at level ${c.unlock_level}` });
  } else r();
  // 2. a bundle of wood or stone, cheaper than Bruno's
  const bulk = m.materials.filter((x) => x.id !== 'gold');
  const b = bulk[Math.floor(r() * bulk.length)];
  slots.push({ kind: 'item', id: b.id, qty: b.qty, coins: b.coins, label: `${b.qty} ${itemName(content, b.id)}`, detail: 'A bargain from beyond the mountains' });
  // 3. a gold nugget (half the visits), otherwise the other material
  const gold = m.materials.find((x) => x.id === 'gold');
  if (gold && r() < 0.5) slots.push({ kind: 'item', id: 'gold', qty: gold.qty, coins: gold.coins, label: 'Gold nugget', detail: 'For golden soil and the biggest farm upgrades' });
  else {
    const other = bulk.find((x) => x.id !== b.id) ?? b;
    slots.push({ kind: 'item', id: other.id, qty: other.qty, coins: other.coins, label: `${other.qty} ${itemName(content, other.id)}`, detail: 'Ziggy swears it fell off a cart. His cart.' });
  }
  // 4. fertilizer in bulk
  slots.push({ kind: 'item', id: 'fertilizer', qty: m.fertilizer.qty, coins: m.fertilizer.coins, label: `${m.fertilizer.qty} Fertilizer`, detail: 'Each one doubles a harvest' });
  return slots;
}

export function boughtToday(state: FarmState, day: number): number[] {
  return state.merchant?.day === day ? state.merchant.bought : [];
}

export type MerchantResult = { ok: true; slot: MerchantSlot } | { ok: false; reason: 'locked' | 'away' | 'sold' | 'no-coins' | 'unknown' };

export function buyFromMerchant(state: FarmState, content: Content, index: number, day: number): MerchantResult {
  if (!merchantUnlocked(state)) return { ok: false, reason: 'locked' };
  if (!merchantHere(content, day)) return { ok: false, reason: 'away' };
  syncMerchant(state, content, day);
  const slot = merchantStock(state, content, day)[index];
  if (!slot) return { ok: false, reason: 'unknown' };
  if (boughtToday(state, day).includes(index)) return { ok: false, reason: 'sold' };
  if (state.coins < slot.coins) return { ok: false, reason: 'no-coins' };
  state.coins -= slot.coins;
  if (slot.kind === 'seed') setFlag(state, `early:${slot.crop}`);
  else addItem(state, slot.id, slot.qty);
  state.merchant!.bought.push(index);
  return { ok: true, slot };
}
