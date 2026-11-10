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
