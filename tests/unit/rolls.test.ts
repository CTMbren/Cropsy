import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { CRITTERS, spawnGap } from '../../src/core/critters';
import { newFarm } from '../../src/core/farm';
import { biteGap } from '../../src/core/fishing';
import { blockerAt, clearReward } from '../../src/core/land';
import { hash01 } from '../../src/core/rand';
import { migrate } from '../../src/core/save';

const content = loadContent();

/** Picks like the meadow does: weights over the species that fit. */
function pick(list: { id: string; weight: number }[], r: number): string {
  const total = list.reduce((a, x) => a + x.weight, 0);
  let x = r * total;
  for (const s of list) {
    x -= s.weight;
    if (x < 0) return s.id;
  }
  return list[list.length - 1].id;
}

describe('random rolls', () => {
  it('are spread evenly even when seeds differ only in their last digits', () => {
    for (const prefix of ['species:', 'plot:', 'gap:', 'bite:', 'gold:']) {
      const buckets = Array(10).fill(0);
      for (let n = 0; n < 5000; n++) buckets[Math.floor(hash01(`${prefix}${n}`) * 10)]++;
      for (const b of buckets) expect(Math.abs(b - 500)).toBeLessThan(90);
      // neighbouring seeds don't roll alike
      let close = 0;
      for (let n = 0; n < 2000; n++) if (Math.abs(hash01(`${prefix}${n}`) - hash01(`${prefix}${n + 1}`)) < 0.05) close++;
      expect(close / 2000).toBeLessThan(0.15);
    }
  });

  it('give every meadow species its fair share, with no long runs of one species', () => {
    const sp = CRITTERS.filter((c) => (c.crops === 'any' || c.crops.includes('wheat')) && c.id !== 'golden_moth');
    const total = sp.reduce((a, x) => a + x.weight, 0);
    const counts: Record<string, number> = {};
    let run = 1;
    let longest = 1;
    let last = '';
    const N = 3000;
    for (let n = 600; n < 600 + N; n++) {
      const id = pick(sp, hash01(`species:${n}`));
      counts[id] = (counts[id] ?? 0) + 1;
      run = id === last ? run + 1 : 1;
      longest = Math.max(longest, run);
      last = id;
    }
    for (const s of sp) {
      const want = (s.weight / total) * N;
      expect(Math.abs((counts[s.id] ?? 0) - want)).toBeLessThan(want * 0.25 + 15);
    }
    expect(longest).toBeLessThan(12);
  });

  it('keep visitor and bite gaps inside their ranges, and varied', () => {
    const gaps = Array.from({ length: 200 }, (_, n) => spawnGap(content, n));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(300);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(600);
    expect(new Set(gaps.slice(0, 20)).size).toBeGreaterThan(15);
    const bites = Array.from({ length: 200 }, (_, n) => biteGap(content, n));
    expect(Math.min(...bites)).toBeGreaterThanOrEqual(240);
    expect(Math.max(...bites)).toBeLessThanOrEqual(480);
  });

  it('hide gold in about 1 in 10 of Bruno’s boulders, fixed per plot, without changing the map', () => {
    const boulders: string[] = [];
    for (let x = 0; x < 40; x++) for (let y = 0; y < 40; y++) if (blockerAt(`${x},${y}`) === 'boulder') boulders.push(`${x},${y}`);
    const gold = boulders.filter((k) => clearReward(content, k, 'boulder').gold).length;
    expect(gold / boulders.length).toBeGreaterThan(0.07);
    expect(gold / boulders.length).toBeLessThan(0.13);
    expect(clearReward(content, '6,5', 'boulder')).toEqual(clearReward(content, '6,5', 'boulder'));
    // the stump/boulder layout is the same as before the fix
    expect(['5,0', '6,0', '8,0', '0,4', '2,8'].map(blockerAt)).toEqual(['boulder', 'boulder', 'boulder', 'boulder', 'boulder']);
    expect(blockerAt('7,0')).toBe('stump');
  });

  it("pays one nugget for every 10 boulders Bruno's crew already cleared, with his letter", () => {
    const s = newFarm(1_800_000_000);
    s.version = 6;
    s.expansions = 1;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) s.plots[`${x},${y}`] ??= { crop: null, plantedAt: 0, growS: 0, soil: 0 };
    const m = migrate(JSON.parse(JSON.stringify(s)));
    // the full 9×9 has 32 boulders outside the 5×5 field
    expect(m.inventory.gold).toBe(3);
    expect(m.mail.some((x) => x.id === 'bruno_gold')).toBe(true);
    expect(content.letters.has('bruno_gold')).toBe(true);
    const small = newFarm(1_800_000_000);
    small.version = 6;
    const sm = migrate(JSON.parse(JSON.stringify(small)));
    expect(sm.inventory.gold ?? 0).toBe(0);
    expect(sm.mail.some((x) => x.id === 'bruno_gold')).toBe(false);
  });

  it('no game roll uses FNV directly as a number any more (except the fixed map layout)', () => {
    const dir = 'src/core';
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      const direct = src.match(/parseInt\(fnv1a\([^)]*\), 16\) \/ 0x100000000/g) ?? [];
      expect(direct.length, f).toBe(f === 'land.ts' ? 1 : 0);
    }
  });
});
