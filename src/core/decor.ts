import type { Content } from './content';
import { addItem, type FarmState } from './farm';

/**
 * Decorations stand on a row of spots just outside the field's two front edges (and the corner
 * between them), so they never take up crop space. Spots are named by edge and index ("R0" is the
 * first spot along the right-hand edge, "F0" along the front, "C" the corner), so they move
 * outward with the field when it expands. Bought decorations wait in storage until placed.
 */

export interface DecorDef {
  id: string;
  name: string;
  coins: number;
  level: number;
  beauty: number;
  color: string;
  /** Story gifts can't be bought. */
  story?: boolean;
}

export const decorDefs = (content: Content): DecorDef[] => (content.economy as unknown as { decorations: DecorDef[] }).decorations;
export const decorDef = (content: Content, id: string) => decorDefs(content).find((d) => d.id === id);

/** Every decoration spot for the farm's current size. */
export function decorSpots(state: FarmState): string[] {
  return [...Array.from({ length: state.height }, (_, i) => `R${i}`), 'C', ...Array.from({ length: state.width }, (_, i) => `F${i}`)];
}

/** Fractional cell coordinates of a spot (one tile outside the field). */
export function spotCell(state: FarmState, spot: string): { x: number; y: number } {
  // one tile further out than the field's edge, beyond any overgrown land waiting to be cleared
  if (spot === 'C') return { x: state.width + 1.1, y: state.height + 1.1 };
  const i = Number(spot.slice(1));
  return spot[0] === 'R' ? { x: state.width + 1.1, y: i } : { x: i, y: state.height + 1.1 };
}

export const placed = (state: FarmState): Record<string, string> => state.decor ?? {};
export const stored = (state: FarmState): Record<string, number> => state.decorStore ?? {};

export type DecorResult = { ok: true } | { ok: false; reason: 'locked' | 'no-coins' | 'unknown' | 'none' | 'taken' | 'empty' };

export function buyDecor(state: FarmState, content: Content, id: string): DecorResult {
  const d = decorDef(content, id);
  if (!d || d.story) return { ok: false, reason: 'unknown' };
  if (d.level > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < d.coins) return { ok: false, reason: 'no-coins' };
  state.coins -= d.coins;
  grantDecor(state, id);
  return { ok: true };
}

export function grantDecor(state: FarmState, id: string, n = 1): void {
  state.decorStore ??= {};
  state.decorStore[id] = (state.decorStore[id] ?? 0) + n;
}

export function placeDecor(state: FarmState, id: string, spot: string): DecorResult {
  if (!decorSpots(state).includes(spot)) return { ok: false, reason: 'unknown' };
  if ((stored(state)[id] ?? 0) < 1) return { ok: false, reason: 'none' };
  if (placed(state)[spot]) return { ok: false, reason: 'taken' };
  state.decor ??= {};
  state.decor[spot] = id;
  state.decorStore![id] -= 1;
  if (!state.decorStore![id]) delete state.decorStore![id];
  return { ok: true };
}

/** Picks a placed decoration back up into storage. */
export function pickUpDecor(state: FarmState, spot: string): DecorResult {
  const id = placed(state)[spot];
  if (!id) return { ok: false, reason: 'empty' };
  delete state.decor![spot];
  grantDecor(state, id);
  return { ok: true };
}

/** Farm Beauty: the sum of placed decorations' beauty. */
export function beauty(state: FarmState, content: Content): number {
  return Object.values(placed(state)).reduce((a, id) => a + (decorDef(content, id)?.beauty ?? 0), 0);
}

/** Beauty makes Fresh Pick tips bigger: +1% per point, up to +50%. */
export function tipBonus(state: FarmState, content: Content): number {
  const b = (content.economy as unknown as { beauty: { tip_bonus_per_point: number; max_bonus: number } }).beauty;
  return Math.min(b.max_bonus, beauty(state, content) * b.tip_bonus_per_point);
}

// ── Daily gift calendar ─────────────────────────────────────────

export type CalendarReward = { coins?: number; item?: string; qty?: number; ribbons?: number; deco?: string };

export const calendarRewards = (content: Content): CalendarReward[] => (content.economy as unknown as { calendar: CalendarReward[] }).calendar;

/** The calendar opens once the tutorial is over (level 3). */
export const calendarOpen = (state: FarmState) => state.level >= 3;

/** Index (0–6) of the next gift. Missing a day never resets it: it just waits. */
export function nextGift(state: FarmState, content: Content): number {
  return (state.calendar?.claimed ?? 0) % calendarRewards(content).length;
}

export function canClaim(state: FarmState, day: number): boolean {
  return calendarOpen(state) && state.calendar?.lastDay !== day;
}

export function claimGift(state: FarmState, content: Content, day: number): CalendarReward | null {
  if (!canClaim(state, day)) return null;
  const r = calendarRewards(content)[nextGift(state, content)];
  if (r.coins) state.coins += r.coins;
  if (r.item) addItem(state, r.item, r.qty ?? 1);
  if (r.ribbons) state.ribbons += r.ribbons;
  if (r.deco) grantDecor(state, r.deco);
  state.calendar = { claimed: (state.calendar?.claimed ?? 0) + 1, lastDay: day };
  return r;
}
