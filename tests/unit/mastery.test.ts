import { describe, expect, it } from 'vitest';
import { almanacNotes, syncAlmanac } from '../../src/core/almanac';
import { loadContent } from '../../src/core/content';
import {
  chooseMastery,
  coinStep,
  cropStats,
  growTimeFor,
  harvest,
  key,
  masteryLevel,
  masteryOptions,
  masteryThreshold,
  mondayWeek,
  newFarm,
  oldMasteryThreshold,
  plant,
  redoMastery,
  redoReady,
  sell,
  seedCost,
  setFlag,
  unplant,
  type FarmState,
  type MasteryPick,
} from '../../src/core/farm';
import { migrate } from '../../src/core/save';
import { dayIndex } from '../../src/core/time';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;
const crop = (id: string) => content.cropById.get(id)!;

function farm(almanac = true): FarmState {
  const s = newFarm(T0);
  s.obstacles = {};
  s.level = 30;
  s.coins = 1_000_000;
  s.seen = content.crops.map((c) => c.id);
  if (almanac) setFlag(s, 'almanac_open');
  return s;
}

/** Gives a crop `n` levels and spends them on `picks`. */
function master(s: FarmState, id: string, picks: MasteryPick[]): void {
  s.harvests ??= {};
  s.harvests[id] = masteryThreshold(picks.length);
  for (const p of picks) expect(chooseMastery(s, id, p, content)).toBe(true);
}

describe('mastery thresholds', () => {
  it('keeps 75 and 250, then each gap grows by 50, forever', () => {
    expect(Array.from({ length: 12 }, (_, i) => masteryThreshold(i + 1))).toEqual([75, 250, 400, 600, 850, 1150, 1500, 1900, 2350, 2850, 3400, 4000]);
    for (let n = 3; n < 60; n++) expect(masteryThreshold(n + 1) - masteryThreshold(n)).toBe(masteryThreshold(n) - masteryThreshold(n - 1) + 50);
  });

  it('never asks for more than the old curve', () => {
    for (let n = 1; n < 40; n++) expect(masteryThreshold(n)).toBeLessThanOrEqual(oldMasteryThreshold(n));
  });

  it('recounts old saves and pays the Ribbons the new curve owes', () => {
    const s = farm();
    s.version = 4;
    s.harvests = { wheat: 3493, radish: 74, carrot: 600 };
    s.ribbons = 10;
    // wheat: ★8 old → ★11 new; carrot: ★3 → ★4; radish: 0 → 0
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.ribbons).toBe(10 + 3 + 1);
    expect(masteryLevel(m, 'wheat')).toBe(11);
  });
});

describe('mastery options', () => {
  it('offers only Coins and XP before the Almanac, all five after', () => {
    const s = farm(false);
    s.harvests = { tomato: 250 };
    expect(masteryOptions(s, 'tomato', content).map((o) => o.kind)).toEqual(['coin', 'xp']);
    expect(chooseMastery(s, 'tomato', 'speed', content)).toBe(false);
    setFlag(s, 'almanac_open');
    expect(masteryOptions(s, 'tomato', content).map((o) => o.kind)).toEqual(['coin', 'xp', 'speed', 'bounty', 'thrift']);
    expect(chooseMastery(s, 'tomato', 'speed', content)).toBe(true);
  });

  it('caps the Almanac tracks but keeps capped cards visible as mastered', () => {
    const s = farm();
    master(s, 'tomato', Array(5).fill('bounty'));
    s.harvests!.tomato = masteryThreshold(6);
    const b = masteryOptions(s, 'tomato', content).find((o) => o.kind === 'bounty')!;
    expect(b).toMatchObject({ mastered: true, open: false });
    expect(chooseMastery(s, 'tomato', 'bounty', content)).toBe(false);
    expect(chooseMastery(s, 'tomato', 'coin', content)).toBe(true);
    // radish seeds already cost 1, so Thrifty starts mastered
    s.harvests!.radish = 75;
    expect(masteryOptions(s, 'radish', content).find((o) => o.kind === 'thrift')).toMatchObject({ mastered: true });
  });
});

describe('coin pick', () => {
  it('pays more per pick on cheap crops, 5% on crops worth 100+, and never inverts', () => {
    expect(coinStep(3)).toBeCloseTo(0.2);
    expect(coinStep(10)).toBeCloseTo(0.158, 2);
    expect(coinStep(100)).toBeCloseTo(0.05);
    expect(coinStep(1800)).toBeCloseTo(0.05);
    let prev = 0;
    for (let sell = 1; sell <= 2000; sell++) {
      const v = coinStep(sell) * sell;
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('keeps spare change, so single radish sales add up', () => {
    const s = farm();
    master(s, 'radish', ['coin']);
    s.inventory.radish = 10;
    const before = s.coins;
    // crate: 2 coins each; +20% is 0.4 a radish, so 10 single sales pay 20 + 4
    for (let i = 0; i < 10; i++) sell(s, content, 'radish', 1);
    expect(s.coins - before).toBe(24);
  });

  it('leaves sales without coin mastery unchanged', () => {
    const s = farm();
    s.inventory.tomato = 3;
    const before = s.coins;
    sell(s, content, 'tomato', 3);
    expect(s.coins - before).toBe(Math.round(Math.round(75 * 0.7) * 3));
  });
});

describe('Quick Growth, Bountiful, Thrifty', () => {
  it('Quick Growth shortens grow time at planting, down to a 35% floor', () => {
    const s = farm();
    master(s, 'tomato', Array(4).fill('speed'));
    expect(growTimeFor(s, content, crop('tomato'), 0)).toBe(Math.round(3600 * 0.8));
    s.masteryPicks!.tomato = [];
    master(s, 'tomato', Array(10).fill('speed'));
    expect(growTimeFor(s, content, crop('tomato'), 0)).toBe(1800);
    // golden soil × greenhouse × −50% = 0.36, floor 0.35 doesn't bite here
    setFlag(s, 'imp:greenhouse');
    expect(growTimeFor(s, content, crop('tomato'), 3)).toBe(Math.round(3600 * 0.36));
    plant(s, content, key(0, 0), 'tomato', T0);
    expect(s.plots[key(0, 0)].growS).toBe(Math.round(3600 * 0.5 * 0.9));
    expect(cropStats(s, 'tomato').fastest).toBe(Math.round(3600 * 0.5 * 0.9));
  });

  it('never applies to crops already in the ground', () => {
    const s = farm();
    s.harvests = { tomato: 75 };
    plant(s, content, key(0, 0), 'tomato', T0);
    chooseMastery(s, 'tomato', 'speed', content);
    expect(s.plots[key(0, 0)].growS).toBe(3600);
  });

  it('Thrifty cuts seed cost up to half, rounded, never below 1', () => {
    const s = farm();
    master(s, 'tomato', Array(5).fill('thrift'));
    expect(seedCost(s, crop('tomato'))).toBe(Math.round(25 * 0.5));
    master(s, 'carrot', Array(5).fill('thrift'));
    expect(seedCost(s, crop('carrot'))).toBe(2);
    const coins = s.coins;
    plant(s, content, key(0, 0), 'tomato', T0);
    expect(coins - s.coins).toBe(13);
    expect(cropStats(s, 'tomato').saved).toBe(12);
    unplant(s, content, key(0, 0), T0 + 1);
    expect(s.coins).toBe(coins);
    expect(cropStats(s, 'tomato').saved).toBe(0);
  });

  it('Bountiful adds to the extra-crop chance and counts its own extras', () => {
    const s = farm();
    master(s, 'radish', Array(5).fill('bounty'));
    s.harvests!.radish = 1_000_000; // levels don't matter here; picks do
    let extra = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const k = key(i % 4, Math.floor(i / 4) % 4);
      const t = T0 + i * 100;
      plant(s, content, k, 'radish', t);
      const r = harvest(s, content, k, t + 30);
      if (r.ok && r.kind === 'harvested') extra += r.qty - 1;
    }
    expect(extra / n).toBeGreaterThan(0.15);
    expect(extra / n).toBeLessThan(0.25);
    expect(cropStats(s, 'radish').bonus).toBe(extra);
  });
});

describe('weekly re-do', () => {
  const day = dayIndex(T0, TZ);

  it('is ready once the Almanac opens, clears one crop, and refreshes on Monday', () => {
    const s = farm(false);
    master(s, 'tomato', ['coin', 'xp']);
    expect(redoReady(s, day)).toBe(false);
    setFlag(s, 'almanac_open');
    expect(redoReady(s, day)).toBe(true);
    const ribbons = s.ribbons;
    expect(redoMastery(s, 'tomato', day)).toBe(true);
    expect(s.masteryPicks!.tomato).toEqual([]);
    expect(s.ribbons).toBe(ribbons);
    expect(chooseMastery(s, 'tomato', 'speed', content)).toBe(true);
    expect(chooseMastery(s, 'tomato', 'thrift', content)).toBe(true);
    // one a week, no stacking
    master(s, 'corn', ['coin']);
    expect(redoMastery(s, 'corn', day)).toBe(false);
    let next = day + 1;
    while (mondayWeek(next) === mondayWeek(day)) next++;
    expect(new Date(next * 86400 * 1000).getUTCDay()).toBe(1);
    expect(redoReady(s, next + 14)).toBe(true);
    expect(redoMastery(s, 'corn', next + 14)).toBe(true);
    expect(redoReady(s, next + 20)).toBe(false);
    expect(redoReady(s, next + 21)).toBe(true);
  });

  it('gives nothing when the clock goes backwards', () => {
    const s = farm();
    master(s, 'tomato', ['coin']);
    redoMastery(s, 'tomato', day + 14);
    expect(redoReady(s, day)).toBe(false);
  });

  it("needs picks to redo", () => {
    const s = farm();
    expect(redoMastery(s, 'tomato', day)).toBe(false);
    expect(redoReady(s, day)).toBe(true);
  });
});

describe('Almanac letters and notes', () => {
  it('sends the new-Almanac letter once, and the gold-page letter at the first ★10', () => {
    const s = farm();
    expect(syncAlmanac(s, T0, TZ)).toEqual(['hazel_almanac']);
    expect(syncAlmanac(s, T0, TZ)).toEqual([]);
    s.harvests = { wheat: masteryThreshold(10) };
    expect(syncAlmanac(s, T0, TZ)).toEqual(['hazel_signature']);
    s.harvests.corn = masteryThreshold(10);
    expect(syncAlmanac(s, T0, TZ)).toEqual([]);
    for (const id of ['hazel_almanac', 'hazel_signature']) expect(content.letters.has(id)).toBe(true);
  });

  it('has notes at ★1, 3, 5, 7 and 10 for every crop, then one every 5 stars', () => {
    for (const c of content.crops.filter((x) => x.id !== 'mystery')) expect(almanacNotes(c.id, 10).map((n) => n.star)).toEqual([1, 3, 5, 7, 10]);
    expect(almanacNotes('wheat', 21).map((n) => n.star)).toEqual([1, 3, 5, 7, 10, 15, 20]);
    expect(almanacNotes('wheat', 0)).toEqual([]);
  });
});
