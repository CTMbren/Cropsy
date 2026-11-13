import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { CRITTERS, nextVisitorIn, spawnGap, speciesFor, syncCritters, tapCritter } from '../../src/core/critters';
import { harvest, key, newFarm, plant, setFlag, type FarmState } from '../../src/core/farm';

const content = loadContent();
const T0 = 1_800_000_000;

function farm(): FarmState {
  const s = newFarm(T0);
  s.obstacles = {};
  s.level = 30;
  s.coins = 100_000;
  return s;
}

/** Plant pumpkins (8 h) everywhere so there's always somewhere to land. */
function plantAll(s: FarmState, crop = 'pumpkin', at = T0) {
  for (const k of Object.keys(s.plots)) plant(s, content, k, crop, at);
}

describe('Meadow Visitors', () => {
  it('arrive every 5 to 10 minutes (the very first in 20 s), up to 6 at once', () => {
    for (let n = 0; n < 50; n++) {
      expect(spawnGap(content, n)).toBeGreaterThanOrEqual(300);
      expect(spawnGap(content, n)).toBeLessThanOrEqual(600);
    }
    const s = farm();
    plantAll(s);
    syncCritters(s, content, T0);
    expect(s.critters!.out).toHaveLength(0);
    const first = syncCritters(s, content, T0 + 20);
    expect(first.first).toBe(true);
    expect(s.critters!.out).toHaveLength(1);
    // away for hours: the farm fills to 6 and no more
    syncCritters(s, content, T0 + 3 * 3600);
    expect(s.critters!.out).toHaveLength(6);
    expect(new Set(s.critters!.out.map((v) => v.plot)).size).toBe(6);
    expect(nextVisitorIn(s, content, T0 + 3 * 3600)).toBeNull();
  });

  it('the first visitor lands on the newest crop', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'pumpkin', T0);
    plant(s, content, key(2, 1), 'carrot', T0 + 5);
    syncCritters(s, content, T0 + 10);
    syncCritters(s, content, T0 + 40);
    expect(s.critters!.out.map((v) => v.plot)).toEqual([key(2, 1)]);
  });

  it('time away counts even when the crops ripened before you came back', () => {
    const s = farm();
    syncCritters(s, content, T0);
    s.critters!.n = 5; // past the first-visitor welcome
    s.critters!.nextAt = T0 + 300;
    plantAll(s, 'strawberry', T0); // ripe in 15 minutes
    syncCritters(s, content, T0 + 6 * 3600);
    expect(s.critters!.out).toHaveLength(6);
    // judged when they arrived: the ones that came while it grew are early-stage species
    expect(s.critters!.out.every((v) => v.at! <= T0 + 6 * 3600)).toBe(true);
  });

  it('arrivals past the cap drop pollen in the jar, up to 10 until you tap one', () => {
    const s = farm();
    plantAll(s);
    syncCritters(s, content, T0);
    const r = syncCritters(s, content, T0 + 24 * 3600);
    expect(s.critters!.out).toHaveLength(6);
    expect(r.banked).toBe(10);
    expect(s.inventory.honey).toBe(2);
    expect(syncCritters(s, content, T0 + 48 * 3600).banked).toBe(0);
    // tapping one (you're here) starts the allowance over
    tapCritter(s, content, s.critters!.out[0].id);
    expect(s.critters!.banked).toBe(0);
  });

  it('stay on ripe crops, and leave a pollen when their plot is harvested', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'radish', T0);
    s.critters = { out: [{ id: 3, species: 'ladybug', plot: key(0, 0), at: T0 + 5 }], nextAt: T0 + 9999, n: 4, seen: [], pollen: 0 };
    syncCritters(s, content, T0 + 600);
    expect(s.critters.out).toHaveLength(1);
    harvest(s, content, key(0, 0), T0 + 600);
    const r = syncCritters(s, content, T0 + 601);
    expect(r.left.map((v) => v.id)).toEqual([3]);
    expect(s.critters.out).toHaveLength(0);
    expect(s.critters.pollen).toBe(1);
  });

  it('a replanted plot means the old crop was harvested', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'radish', T0);
    s.critters = { out: [{ id: 3, species: 'ladybug', plot: key(0, 0), at: T0 + 5 }], nextAt: T0 + 9999, n: 4, seen: [], pollen: 0 };
    harvest(s, content, key(0, 0), T0 + 40);
    plant(s, content, key(0, 0), 'radish', T0 + 41);
    expect(syncCritters(s, content, T0 + 42).left).toHaveLength(1);
  });

  it('the Golden Moth always comes to your first half-grown golden melon', () => {
    const s = farm();
    syncCritters(s, content, T0);
    s.critters!.n = 5;
    s.critters!.nextAt = T0 + 999999;
    plant(s, content, key(3, 3), 'golden_melon', T0);
    expect(syncCritters(s, content, T0 + 3600).moth).toBe(false);
    const r = syncCritters(s, content, T0 + 25 * 3600);
    expect(r.moth).toBe(true);
    expect(s.critters!.out).toEqual([expect.objectContaining({ species: 'golden_moth', plot: key(3, 3) })]);
    // only once it's in the Sketchbook does it stop being guaranteed
    expect(syncCritters(s, content, T0 + 25 * 3600 + 10).moth).toBe(false);
  });

  it('stamps at the 3rd and 10th sighting give a pollen and a note', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'lettuce', T0);
    s.critters = { out: [], nextAt: T0 + 99999, n: 0, seen: [], pollen: 0 };
    const tap = (id: number) => {
      s.critters!.out.push({ id, species: 'ladybug', plot: key(0, 0) });
      return tapCritter(s, content, id);
    };
    const r = [1, 2, 3].map(tap);
    expect(r[1]).not.toHaveProperty('stamp');
    expect(r[2]).toMatchObject({ ok: true, stamp: { n: 3 } });
    expect(s.critters!.pollen).toBe(4);
    for (let i = 4; i <= 9; i++) tap(i);
    expect(tap(10)).toMatchObject({ stamp: { n: 10 } });
    expect(CRITTERS.every((c) => c.stamps.length === 2 && c.stamps.every((x) => x.length > 10))).toBe(true);
  });

  it("don't come to an empty farm, and wait for the tutorial", () => {
    const s = farm();
    syncCritters(s, content, T0 + 86400);
    expect(s.critters!.out).toHaveLength(0);
    const fresh = newFarm(T0);
    plant(fresh, content, key(1, 0), 'radish', T0);
    syncCritters(fresh, content, T0 + 3600);
    expect(fresh.critters).toBeUndefined();
  });

  it('match the crop and how far it has grown', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'golden_melon', T0);
    expect(speciesFor(s, key(0, 0), T0).map((c) => c.id)).toEqual(['ladybug']);
    const half = speciesFor(s, key(0, 0), T0 + 90000).map((c) => c.id);
    expect(half).toContain('golden_moth');
    expect(half).not.toContain('honeybee');
  });

  it('give pollen, make honey every 5, and sketch new species once', () => {
    const s = farm();
    setFlag(s, 'met_hazel');
    plantAll(s);
    syncCritters(s, content, T0);
    syncCritters(s, content, T0 + 3 * 3600);
    const ids = s.critters!.out.map((v) => v.id);
    const honey = s.inventory.honey ?? 0;
    const pollen = s.critters!.pollen;
    const first = tapCritter(s, content, ids[0]);
    expect(first).toMatchObject({ ok: true, firstTime: true, pollen: pollen + 1 });
    expect(s.villagers.hazel?.points).toBeGreaterThanOrEqual(10);
    for (const id of ids.slice(1, 5)) tapCritter(s, content, id);
    expect(s.inventory.honey).toBe(honey + 1);
    expect(tapCritter(s, content, ids[0])).toEqual({ ok: false, reason: 'gone' });
  });

  it('a full page earns a Ribbon', () => {
    const s = farm();
    const page1 = CRITTERS.filter((c) => c.page === 1);
    s.critters = { out: [], nextAt: T0 + 9999, n: 0, seen: page1.slice(1).map((c) => c.id), pollen: 0 };
    plant(s, content, key(0, 0), 'lettuce', T0);
    s.critters.out.push({ id: 7, species: page1[0].id, plot: key(0, 0) });
    setFlag(s, 'met_hazel');
    const ribbons = s.ribbons;
    expect(tapCritter(s, content, 7)).toMatchObject({ ok: true, pageDone: 1 });
    expect(s.ribbons).toBe(ribbons + 1);
    // Hazel: 10 for the new species, 30 for the page
    expect(s.villagers.hazel?.points).toBe(40);
  });

  it('every crop can host at least one species from the start', () => {
    const s = farm();
    for (const c of content.crops) {
      plant(s, content, key(0, 0), c.id, T0);
      expect(speciesFor(s, key(0, 0), T0).length).toBeGreaterThan(0);
      s.plots[key(0, 0)].crop = null;
    }
  });
});
