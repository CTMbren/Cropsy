/**
 * Trusted game time in whole seconds.
 *
 * Every timer in Cropsy is a closed-form function of timestamps, never an accumulated frame delta,
 * so growth "happens" while the app is closed. `maxSeenTime` is a floor: if the device clock is set
 * backwards, the farm simply freezes until real time catches up — nothing is lost, nothing is gained.
 */
export interface TimeState {
  maxSeenTime: number;
  /** Debug-only offset, added by the ?debug=1 panel to fast-forward. */
  debugOffset: number;
}

export function systemNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function gameNow(t: TimeState, system: number = systemNow()): number {
  const now = Math.max(system + t.debugOffset, t.maxSeenTime);
  t.maxSeenTime = now;
  return now;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60 ? `${s % 60}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
}

/** Minutes behind UTC for the player's time zone right now (same sign as Date#getTimezoneOffset). */
export function localOffsetMinutes(): number {
  return new Date().getTimezoneOffset();
}

/** Local calendar day number: the board refreshes and "next day" letters arrive at local midnight. */
export function dayIndex(now: number, offsetMin: number): number {
  return Math.floor((now - offsetMin * 60) / 86400);
}

/** Market price period: local midnight, 8 am and 4 pm each start a new one. */
export const MARKET_PERIOD_S = 8 * 3600;
export function marketPeriod(now: number, offsetMin: number): number {
  return Math.floor((now - offsetMin * 60) / MARKET_PERIOD_S);
}
/** Unix seconds when the next market period starts. */
export function nextMarketPeriod(now: number, offsetMin: number): number {
  return (marketPeriod(now, offsetMin) + 1) * MARKET_PERIOD_S + offsetMin * 60;
}

/** Unix seconds of the next local midnight after `now`. */
export function nextLocalMidnight(now: number, offsetMin: number): number {
  return (dayIndex(now, offsetMin) + 1) * 86400 + offsetMin * 60;
}

/** Small seeded PRNG (mulberry32) so daily content is the same every time you open the game that day. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
