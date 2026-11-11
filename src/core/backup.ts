import type { FarmState } from './farm';

const DAY = 86400;

/**
 * Safari can clear a website's data, and a phone can be lost, so the game gently asks for a
 * backup code: first at level 5, then if a week passes without one. "Later" waits three days.
 */
export function needsBackupNudge(state: FarmState, now: number): boolean {
  if (state.level < 5) return false;
  const b = state.backup ?? {};
  if (b.lastAt !== undefined && now - b.lastAt < 7 * DAY) return false;
  if (b.nudgedAt !== undefined && now - b.nudgedAt < 3 * DAY) return false;
  return true;
}

export function markBackedUp(state: FarmState, now: number): void {
  state.backup = { ...state.backup, lastAt: now };
}

export function snoozeBackup(state: FarmState, now: number): void {
  state.backup = { ...state.backup, nudgedAt: now };
}
