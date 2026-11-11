import { describe, expect, it } from 'vitest';
import { fulfilOrder, pinOrder } from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { key, newFarm, plant, sell, type FarmState } from '../../src/core/farm';
import { merchantHere } from '../../src/core/merchant';
import { buildImprovement, deliverTownProject, nextTownLevel, raiseTownLevel, syncTownProject, townLevel, townProject } from '../../src/core/town';

const content = loadContent();
const T0 = 1_800_000_000;

function rich(level = 25): FarmState {
  const s = newFarm(T0);
  s.obstacles = {};
  s.level = level;
  s.coins = 10_000_000;
  Object.assign(s.inventory, { wood: 200, stone: 200, gold: 10 });
  return s;
}

describe('Bramblewick improvements', () => {
  it('cost coins and materials once and switch on their perks', () => {
    const s = rich(12);
    expect(buildImprovement(s, content, 'greenhouse')).toMatchObject({ ok: false, reason: 'locked' });
    // bridge: Ziggy every 2 days
    expect([0, 1, 2, 3, 4, 5].filter((d) => merchantHere(content, d, s))).toHaveLength(2);
    expect(buildImprovement(s, content, 'bridge').ok).toBe(true);
    expect(buildImprovement(s, content, 'bridge')).toMatchObject({ ok: false, reason: 'owned' });
    expect([0, 1, 2, 3, 4, 5].filter((d) => merchantHere(content, d, s))).toHaveLength(3);
    // greenhouse: 10% faster
    s.level = 25;
    buildImprovement(s, content, 'greenhouse');
    plant(s, content, key(0, 0), 'potato', T0);
    expect(s.plots[key(0, 0)].growS).toBe(Math.round(14400 * 0.9));
    // clock: orders pay 20% more
    buildImprovement(s, content, 'clock');
    pinOrder(s, { id: 'o', villager: 'goldie', wants: { carrot: 1 }, coins: 100, xp: 1 });
    s.inventory.carrot = 1;
    const before = s.coins;
    fulfilOrder(s, content, 'o');
    expect(s.coins - before).toBe(120);
    // scarecrow: +10% at the crate
    buildImprovement(s, content, 'scarecrow');
    s.inventory.carrot = 10;
    expect(sell(s, content, 'carrot', 10)).toBe(Math.round(7 * 10 * 1.1));
  });
});

describe('weekly town project', () => {
  it('is the same all week, pays once, and renews next week', () => {
    const s = rich(15);
    syncTownProject(s, content, 70);
    const p = townProject(s, content, 70);
    s.level = 20;
    expect(townProject(s, content, 73)).toEqual(p);
    for (const [id, n] of Object.entries(p.wants)) s.inventory[id] = n;
    const ribbons = s.ribbons;
    expect(deliverTownProject(s, content, 72).ok).toBe(true);
    expect(s.ribbons).toBe(ribbons + p.ribbons);
    expect(deliverTownProject(s, content, 73)).toMatchObject({ ok: false, reason: 'done' });
    syncTownProject(s, content, 77);
    expect(s.town).toMatchObject({ week: 11, done: false, trophies: 1 });
  });

  it('opens at level 10', () => {
    expect(deliverTownProject(rich(9), content, 1)).toMatchObject({ ok: false, reason: 'locked' });
  });
});

describe('town level', () => {
  it('gets more expensive each level and raises sell prices up to +50%', () => {
    const s = rich(25);
    const costs: number[] = [];
    for (let i = 0; i < 30; i++) {
      const next = nextTownLevel(s, content);
      costs.push(next.coins);
      for (const [id, n] of Object.entries(next.wants)) s.inventory[id] = n;
      s.coins = next.coins;
      expect(raiseTownLevel(s, content).ok).toBe(true);
    }
    expect(townLevel(s)).toBe(30);
    expect(costs[1]).toBeGreaterThan(costs[0]);
    s.inventory.carrot = 10;
    expect(sell(s, content, 'carrot', 10)).toBe(Math.round(70 * 1.5));
  });
});
