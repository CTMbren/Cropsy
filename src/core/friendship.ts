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

// ── Heart events ─────────────────────────────────────────────────

export interface HeartEvent {
  villager: string;
  hearts: number;
  title: string;
  lines: string[];
}

const eventFlag = (v: string, h: number) => `event:${v}:${h}`;

/** Heart events you've unlocked (enough hearts) but not yet watched, lowest first. */
export function pendingEvents(state: FarmState, content: Content): HeartEvent[] {
  const out: HeartEvent[] = [];
  for (const id of friends(state, content)) {
    const h = hearts(state, content, id);
    for (const e of content.villagers.get(id)?.events ?? []) if (h >= e.hearts && !hasFlag(state, eventFlag(id, e.hearts))) out.push({ villager: id, ...e });
  }
  return out.sort((a, b) => a.hearts - b.hearts);
}

/** Heart events already watched (for re-reading). */
export function seenEvents(state: FarmState, content: Content, id: string): HeartEvent[] {
  return (content.villagers.get(id)?.events ?? []).filter((e) => hasFlag(state, eventFlag(id, e.hearts))).map((e) => ({ villager: id, ...e }));
}

/** Watching a heart event for the first time gives Ribbons (2 at 3 hearts, 3 at 6, and so on). */
export function watchEvent(state: FarmState, content: Content, id: string, h: number): { event: HeartEvent; ribbons: number } | null {
  const e = pendingEvents(state, content).find((x) => x.villager === id && x.hearts === h);
  if (!e) return null;
  setFlag(state, eventFlag(id, h));
  const ribbons = 1 + Math.floor(h / 3);
  state.ribbons += ribbons;
  return { event: e, ribbons };
}

// ── Moss ─────────────────────────────────────────────────────────

export type MossFind = { item: string; qty: number } | { coins: number };

/** What Moss digs up: fixed per day and dig, so reloading can't reroll it. */
export function mossFind(day: number, n: number): MossFind {
  let h = 2166136261;
  for (const ch of `moss:${day}:${n}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = (h >>> 0) % 100;
  if (r < 30) return { item: 'wood', qty: 4 };
  if (r < 55) return { item: 'stone', qty: 3 };
  if (r < 80) return { item: 'fertilizer', qty: 2 };
  if (r < 95) return { coins: 150 };
  return { item: 'gold', qty: 1 };
}

/** Finds left today: one a day, two with Juniper's 5-heart perk. */
export function mossDigsLeft(state: FarmState, day: number): number {
  if (!hasFlag(state, 'moss_visits')) return 0;
  const per = hasFlag(state, 'perk:juniper') ? 2 : 1;
  const used = state.moss?.day === day ? state.moss.digs : 0;
  return Math.max(0, per - used);
}

export function patMoss(state: FarmState, day: number): MossFind | null {
  if (mossDigsLeft(state, day) <= 0) return null;
  const used = state.moss?.day === day ? state.moss.digs : 0;
  const f = mossFind(day, used);
  state.moss = { day, digs: used + 1 };
  if ('coins' in f) state.coins += f.coins;
  else addItem(state, f.item, f.qty);
  return f;
}
