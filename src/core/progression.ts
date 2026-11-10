/** XP needed to go from `level` to `level + 1` (design doc: 20 + 15 · L^1.8). */
export function xpToNext(level: number): number {
  return Math.round(20 + 15 * Math.pow(level, 1.8));
}

/** Applies gained XP, handling several level-ups at once. */
export function addXp(level: number, xp: number, gained: number): { level: number; xp: number; levelsGained: number } {
  let l = level;
  let x = xp + gained;
  let levelsGained = 0;
  while (l < 30 && x >= xpToNext(l)) {
    x -= xpToNext(l);
    l += 1;
    levelsGained += 1;
  }
  return { level: l, xp: x, levelsGained };
}
