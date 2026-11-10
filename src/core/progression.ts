import economy from '../../content/economy.json';

/** XP needed to go from `level` to `level + 1`: base + mult · L^exp (tuned with `npm run sim`). */
export function xpToNext(level: number): number {
  const c = (economy as { xp_curve: { base: number; mult: number; exp: number } }).xp_curve;
  return Math.round(c.base + c.mult * Math.pow(level, c.exp));
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
