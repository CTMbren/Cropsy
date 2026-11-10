import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { awaySummary, clearObstacle, cratePrice, expand, freshWindow, harvest, key, newFarm, nextReady, plant, replantAll, sell, stageOf } from '../../src/core/farm';
import { addXp, xpToNext } from '../../src/core/progression';
import { dayIndex, gameNow, nextLocalMidnight } from '../../src/core/time';

const content = loadContent();
const T0 = 1_800_000_000;
/** A farm with the starting obstacles cleared, for testing crop rules on their own. */
const clearFarm = () => {
  const s = newFarm(T0);
  s.obstacles = {};
  return s;
};

describe('growth', () => {
  it('moves through stages and ripens exactly at grow time', () => {
    const s = clearFarm();
    const k = key(0, 0);
    expect(plant(s, content, k, 'radish', T0).ok).toBe(true);
    const p = s.plots[k];
    expect(stageOf(p, T0)).toBe('seed');
    expect(stageOf(p, T0 + 10)).toBe('sprout');
    expect(stageOf(p, T0 + 20)).toBe('growing');
    expect(stageOf(p, T0 + 29)).toBe('growing');
    expect(stageOf(p, T0 + 30)).toBe('ripe');
  });

  it('keeps growing while the game is closed (offline progress)', () => {
    const s = clearFarm();
    plant(s, content, key(1, 1), 'carrot', T0);
    expect(stageOf(s.plots[key(1, 1)], T0 + 3 * 86400)).toBe('ripe');
  });

  it('snapshots grow time at planting so rebalancing does not affect growing crops', () => {
    const s = clearFarm();
    plant(s, content, key(0, 0), 'radish', T0);
    content.cropById.get('radish')!.grow_s = 999;
    expect(s.plots[key(0, 0)].growS).toBe(30);
    content.cropById.get('radish')!.grow_s = 30;
  });
});

describe('plant, harvest, sell', () => {
  it('charges seed cost and refuses when broke, occupied, locked or overgrown', () => {
    const s = newFarm(T0);
    s.coins = 1;
    expect(plant(s, content, key(0, 0), 'radish', T0)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(plant(s, content, key(1, 0), 'radish', T0)).toMatchObject({ ok: true });
    expect(s.coins).toBe(0);
    expect(plant(s, content, key(1, 0), 'radish', T0)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(plant(s, content, key(0, 1), 'radish', T0)).toMatchObject({ ok: false, reason: 'no-coins' });
    s.coins = 100;
    expect(plant(s, content, key(0, 1), 'wheat', T0)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('harvest puts the crop in the barn; Fresh Pick adds a tip and bonus XP', () => {
    const s = clearFarm();
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(harvest(s, content, key(0, 0), T0 + 60)).toMatchObject({ ok: false, reason: 'not-ripe' });
    const coins = s.coins;
    expect(harvest(s, content, key(0, 0), T0 + 120)).toMatchObject({ ok: true, fresh: true, tip: 2, xp: 2 });
    expect(s.inventory.carrot).toBe(1);
    expect(s.coins).toBe(coins + 2);
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(harvest(s, content, key(0, 0), T0 + 120 + freshWindow(120) + 1)).toMatchObject({ ok: true, fresh: false, tip: 0 });
    expect(s.inventory.carrot).toBe(2);
  });

  it('the shipping crate pays 70% and never more than you have', () => {
    const s = clearFarm();
    s.inventory.carrot = 3;
    const carrot = content.cropById.get('carrot')!;
    expect(cratePrice(carrot)).toBe(7);
    const before = s.coins;
    expect(sell(s, content, 'carrot', 10)).toBe(21);
    expect(s.coins).toBe(before + 21);
    expect(s.inventory.carrot).toBeUndefined();
    expect(sell(s, content, 'carrot', 1)).toBe(0);
  });

  it('Replant All re-plants empty plots with their last crop', () => {
    const s = clearFarm();
    plant(s, content, key(0, 0), 'radish', T0);
    plant(s, content, key(1, 0), 'carrot', T0);
    harvest(s, content, key(0, 0), T0 + 200);
    harvest(s, content, key(1, 0), T0 + 200);
    const planted = replantAll(s, content, T0 + 200);
    expect(planted.sort()).toEqual([key(0, 0), key(1, 0)]);
    expect(s.plots[key(1, 0)].crop).toBe('carrot');
  });

  it('fresh window is clamped between 30 minutes and 8 hours', () => {
    expect(freshWindow(30)).toBe(1800);
    expect(freshWindow(86400)).toBe(8 * 3600);
  });
});

describe('obstacles and expansion', () => {
  it('weeds are free, branches give wood, rocks cost coins and give stone', () => {
    const s = newFarm(T0);
    expect(clearObstacle(s, key(0, 0))).toMatchObject({ ok: true, obstacle: 'weeds', item: null });
    expect(clearObstacle(s, key(2, 0))).toMatchObject({ ok: true, obstacle: 'branch', item: 'wood' });
    s.coins = 4;
    expect(clearObstacle(s, key(3, 1))).toMatchObject({ ok: false, reason: 'no-coins' });
    s.coins = 5;
    expect(clearObstacle(s, key(3, 1))).toMatchObject({ ok: true, item: 'stone' });
    expect(s.inventory).toEqual({ wood: 1, stone: 1 });
    expect(s.coins).toBe(0);
  });

  it('the starting farm has enough weeds, wood and stone for Chapter 1', () => {
    const s = newFarm(T0);
    const content = loadContent();
    const kinds = Object.values(s.obstacles);
    const gate = content.questById.get('ch1_gate')!.objectives[0] as { items: Record<string, number> };
    const weeds = content.questById.get('ch1_weeds')!.objectives[0] as { n: number };
    expect(kinds.filter((k) => k === 'branch').length).toBeGreaterThanOrEqual(gate.items.wood);
    expect(kinds.filter((k) => k === 'rock').length).toBeGreaterThanOrEqual(gate.items.stone);
    expect(kinds.filter((k) => k === 'weeds').length).toBeGreaterThanOrEqual(weeds.n);
  });

  it('expanding adds a row and column with new obstacles', () => {
    const s = newFarm(T0);
    const added = expand(s);
    expect(s.width).toBe(5);
    expect(added.length).toBe(9);
    expect(added.filter((k) => s.obstacles[k]).length).toBeGreaterThan(4);
  });
});

describe('progression', () => {
  it('follows 20 + 15·L^1.8', () => {
    expect(xpToNext(1)).toBe(35);
    expect(xpToNext(10)).toBe(Math.round(20 + 15 * Math.pow(10, 1.8)));
  });

  it('handles several level-ups from one gain', () => {
    expect(addXp(1, 0, 35 + xpToNext(2) + 5)).toEqual({ level: 3, xp: 5, levelsGained: 2 });
  });
});

describe('time', () => {
  it('freezes rather than rewinding when the clock goes backwards', () => {
    const t = { maxSeenTime: T0, debugOffset: 0 };
    expect(gameNow(t, T0 - 3600)).toBe(T0);
    expect(gameNow(t, T0 + 5)).toBe(T0 + 5);
  });

  it('local days and midnights respect the time zone', () => {
    const pst = 480; // UTC-8
    const midnight = nextLocalMidnight(T0, pst);
    expect(dayIndex(midnight, pst)).toBe(dayIndex(T0, pst) + 1);
    expect(dayIndex(midnight - 1, pst)).toBe(dayIndex(T0, pst));
    expect(((midnight - pst * 60) % 86400 + 86400) % 86400).toBe(0);
  });
});

describe('return hooks', () => {
  it('summarises crops that ripened and letters that arrived while away', () => {
    const s = clearFarm();
    plant(s, content, key(0, 0), 'radish', T0);
    plant(s, content, key(1, 0), 'radish', T0);
    plant(s, content, key(2, 0), 'carrot', T0);
    s.mail.push({ id: 'bruno_gate_done', arrivesAt: T0 + 50, read: false });
    expect(nextReady(s, T0)).toBe(30);
    const sum = awaySummary(s, content, T0 + 60);
    expect(sum.ripe).toEqual([{ crop: 'Radish', count: 2 }]);
    expect(sum.newMail).toBe(1);
  });
});
