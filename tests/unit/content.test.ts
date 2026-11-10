import { describe, expect, it } from 'vitest';
import { loadContent, validateCrops } from '../../src/core/content';

describe('content', () => {
  it('crops.json is valid and sorted by unlock level', () => {
    const { crops } = loadContent();
    expect(crops.length).toBeGreaterThan(0);
    const levels = crops.map((c) => c.unlock_level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('every crop makes a profit', () => {
    for (const c of loadContent().crops) expect(c.sell).toBeGreaterThan(c.seed_cost);
  });

  it('rejects bad data with a readable message', () => {
    expect(() => validateCrops([{ id: 'x' }])).toThrow(/crops.json\[0\]/);
    expect(() => validateCrops([{ id: 'a', name: 'A', color: '#f00', leaf: '#0f0', grow_s: 0, seed_cost: 1, sell: 2, xp: 1, unlock_level: 1 }])).toThrow(/grow_s/);
  });
});
