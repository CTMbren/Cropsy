import type { Content } from './content';
import { addItem, hasFlag, setFlag, type FarmState, type FriendState } from './farm';

/**
 * Villager friendship: 0–10 hearts. Points come from gifts (once per villager per day), filling
 * their orders and finishing their quests. Five hearts unlocks a small perk.
 */

export type Taste = 'loved' | 'liked' | 'neutral' | 'disliked';

const friend = (state: FarmState, id: string): FriendState => (state.villagers[id] ??= { points: 0, giftDay: -1 });

export function hearts(state: FarmState, content: Content, id: string): number {
  return Math.min(10, Math.floor((state.villagers[id]?.points ?? 0) / content.economy.friendship.per_heart));
}

/** Progress (0..1) toward the next heart. */
export function heartProgress(state: FarmState, content: Content, id: string): number {
  if (hearts(state, content, id) >= 10) return 1;
  const per = content.economy.friendship.per_heart;
  return ((state.villagers[id]?.points ?? 0) % per) / per;
}

export function taste(content: Content, villagerId: string, itemId: string): Taste {
  const v = content.villagers.get(villagerId);
  if (v?.loves?.includes(itemId)) return 'loved';
  if (v?.likes?.includes(itemId)) return 'liked';
  if (v?.dislikes?.includes(itemId)) return 'disliked';
  return 'neutral';
}

/** Villagers you've met (Tobias only writes letters, so he can't receive gifts). */
export function friends(state: FarmState, content: Content): string[] {
  return [...content.villagers.keys()].filter((id) => id !== 'tobias' && (id === 'goldie' ? hasFlag(state, 'met_goldie') : hasFlag(state, `met_${id}`)));
}

export interface FriendshipChange {
  villager: string;
  points: number;
  heartsBefore: number;
  heartsAfter: number;
  perk?: string;
}

/** Adds friendship points and applies the 5-heart perk once. */
export function addFriendship(state: FarmState, content: Content, id: string, points: number): FriendshipChange {
  const before = hearts(state, content, id);
  friend(state, id).points += points;
  const after = hearts(state, content, id);
  const out: FriendshipChange = { villager: id, points, heartsBefore: before, heartsAfter: after };
  const perkFlag = `perk:${id}`;
  if (after >= content.economy.friendship.perk_hearts && !hasFlag(state, perkFlag)) {
    setFlag(state, perkFlag);
    out.perk = content.villagers.get(id)?.perk;
    // Rufus's perk: a free extra slot at the mill
    if (id === 'rufus' && state.buildings.mill) state.buildings.mill.slots += 1;
  }
  return out;
}

export type GiftResult = ({ ok: true; taste: Taste } & FriendshipChange) | { ok: false; reason: 'already' | 'none' | 'unknown' | 'stranger' };

export function canGiftToday(state: FarmState, id: string, day: number): boolean {
  return (state.villagers[id]?.giftDay ?? -1) !== day;
}

export function giveGift(state: FarmState, content: Content, villagerId: string, itemId: string, day: number): GiftResult {
  if (!content.villagers.has(villagerId)) return { ok: false, reason: 'unknown' };
  if (!friends(state, content).includes(villagerId)) return { ok: false, reason: 'stranger' };
  if (!canGiftToday(state, villagerId, day)) return { ok: false, reason: 'already' };
  if ((state.inventory[itemId] ?? 0) < 1) return { ok: false, reason: 'none' };
  addItem(state, itemId, -1);
  friend(state, villagerId).giftDay = day;
  const t = taste(content, villagerId, itemId);
  return { ok: true, taste: t, ...addFriendship(state, content, villagerId, content.economy.friendship.gift[t]) };
}

/** A line of chatter that matches how well you know them. */
export function chatter(state: FarmState, content: Content, id: string, day: number): string {
  const v = content.villagers.get(id);
  const h = hearts(state, content, id);
  const band = h >= 9 ? 3 : h >= 6 ? 2 : h >= 3 ? 1 : 0;
  const lines = v?.lines?.[band] ?? ['…'];
  return lines[day % lines.length];
}
