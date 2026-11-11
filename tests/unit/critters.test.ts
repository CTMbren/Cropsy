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
  it('arrive every 5 to 10 minutes while crops grow, up to 5 at once', () => {
    for (let n = 0; n < 50; n++) {
      expect(spawnGap(content, n)).toBeGreaterThanOrEqual(300);
      expect(spawnGap(content, n)).toBeLessThanOrEqual(600);
    }
    const s = farm();
    plantAll(s);
    syncCritters(s, content, T0);
    expect(s.critters!.out).toHaveLength(0);
    syncCritters(s, content, T0 + 600);
    expect(s.critters!.out.length).toBeGreaterThanOrEqual(1);
    // away for hours: the farm fills to 5 and no more
    syncCritters(s, content, T0 + 3 * 3600);
    expect(s.critters!.out).toHaveLength(5);
    expect(new Set(s.critters!.out.map((v) => v.plot)).size).toBe(5);
    expect(nextVisitorIn(s, content, T0 + 3 * 3600)).toBeNull();
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
    const first = tapCritter(s, content, ids[0]);
    expect(first).toMatchObject({ ok: true, firstTime: true, honey: 0, pollen: 1 });
    expect(s.villagers.hazel?.points).toBe(10);
    for (const id of ids.slice(1)) tapCritter(s, content, id);
    expect(s.inventory.honey).toBe(1);
    expect(s.critters!.pollen).toBe(0);
    expect(tapCritter(s, content, ids[0])).toEqual({ ok: false, reason: 'gone' });
  });

  it('a full page earns a Ribbon', () => {
    const s = farm();
    const page1 = CRITTERS.filter((c) => c.page === 1);
    s.critters = { out: [], nextAt: T0 + 9999, n: 0, seen: page1.slice(1).map((c) => c.id), pollen: 0 };
    plant(s, content, key(0, 0), 'lettuce', T0);
    s.critters.out.push({ id: 7, species: page1[0].id, plot: key(0, 0) });
    const ribbons = s.ribbons;
    expect(tapCritter(s, content, 7)).toMatchObject({ ok: true, pageDone: 1 });
    expect(s.ribbons).toBe(ribbons + 1);
  });

  it('fly to another growing plot when their crop is harvested', () => {
    const s = farm();
    plant(s, content, key(0, 0), 'radish', T0);
    plant(s, content, key(1, 0), 'pumpkin', T0);
    s.critters = { out: [{ id: 3, species: 'ladybug', plot: key(0, 0) }], nextAt: T0 + 9999, n: 4, seen: [], pollen: 0 };
    harvest(s, content, key(0, 0), T0 + 30);
    syncCritters(s, content, T0 + 31);
    expect(s.critters.out).toEqual([{ id: 3, species: 'ladybug', plot: key(1, 0) }]);
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
