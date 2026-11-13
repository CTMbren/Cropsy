/**
 * Deterministic rolls from a seed string, so reloading can't reroll anything.
 *
 * FNV-1a alone is a fine checksum but a poor roll: its top bits barely change when only the last
 * characters of the seed change, so `species:600`, `species:601`, … all rolled almost the same
 * number and visitors came in long runs of one species. A murmur3 finaliser after FNV spreads
 * every input bit across the whole result.
 */
export function hashU32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** A roll in [0, 1) fixed by the seed. */
export const hash01 = (seed: string) => hashU32(seed) / 0x100000000;
