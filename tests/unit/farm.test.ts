import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { awaySummary, freshWindow, harvest, key, newFarm, nextReady, plant, stageOf } from '../../src/core/farm';
import { addXp, xpToNext } from '../../src/core/progression';
import { gameNow } from '../../src/core/time';

const content = loadContent();
const T0 = 1_800_000_000;

describe('growth', () => {
  it('moves through stages and ripens exactly at grow time', () => {
    const s = newFarm(T0);
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
    const s = newFarm(T0);
    plant(s, content, key(1, 1), 'carrot', T0);
    expect(stageOf(s.plots[key(1, 1)], T0 + 3 * 86400)).toBe('ripe');
  });

  it('snapshots grow time at planting so rebalancing does not affect growing crops', () => {
    const s = newFarm(T0);
    plant(s, content, key(0, 0), 'radish', T0);
    content.cropById.get('radish')!.grow_s = 999;
    expect(s.plots[key(0, 0)].growS).toBe(30);
    content.cropById.get('radish')!.grow_s = 30;
  });
});

describe('plant and harvest rules', () => {
  it('charges seed cost and refuses when broke, occupied or locked', () => {
    const s = newFarm(T0);
    s.coins = 1;
    expect(plant(s, content, key(0, 0), 'radish', T0)).toMatchObject({ ok: true });
    expect(s.coins).toBe(0);
    expect(plant(s, content, key(0, 0), 'radish', T0)).toMatchObject({ ok: false, reason: 'occupied' });
    expect(plant(s, content, key(1, 0), 'radish', T0)).toMatchObject({ ok: false, reason: 'no-coins' });
    s.coins = 100;
    expect(plant(s, content, key(1, 0), 'wheat', T0)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('only harvests ripe crops, with a Fresh Pick bonus inside the window', () => {
    const s = newFarm(T0);
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(harvest(s, content, key(0, 0), T0 + 60)).toMatchObject({ ok: false, reason: 'not-ripe' });
    const fresh = harvest(s, content, key(0, 0), T0 + 120);
    expect(fresh).toMatchObject({ ok: true, fresh: true, coins: 12 });
    plant(s, content, key(0, 0), 'carrot', T0);
    const stale = harvest(s, content, key(0, 0), T0 + 120 + freshWindow(120) + 1);
    expect(stale).toMatchObject({ ok: true, fresh: false, coins: 10 });
  });

  it('fresh window is clamped between 30 minutes and 8 hours', () => {
    expect(freshWindow(30)).toBe(1800);
    expect(freshWindow(86400)).toBe(8 * 3600);
  });
});

describe('progression', () => {
  it('follows 20 + 15·L^1.8', () => {
    expect(xpToNext(1)).toBe(35);
    expect(xpToNext(10)).toBe(Math.round(20 + 15 * Math.pow(10, 1.8)));
  });

  it('handles several level-ups from one gain', () => {
    const r = addXp(1, 0, 35 + xpToNext(2) + 5);
    expect(r).toEqual({ level: 3, xp: 5, levelsGained: 2 });
  });
});

describe('time', () => {
  it('freezes rather than rewinding when the clock goes backwards', () => {
    const t = { maxSeenTime: T0, debugOffset: 0 };
    expect(gameNow(t, T0 - 3600)).toBe(T0);
    expect(gameNow(t, T0 + 5)).toBe(T0 + 5);
  });
});

describe('return hooks', () => {
  it('summarises crops that ripened while away and the next ready time', () => {
    const s = newFarm(T0);
    plant(s, content, key(0, 0), 'radish', T0);
    plant(s, content, key(1, 0), 'radish', T0);
    plant(s, content, key(2, 0), 'carrot', T0);
    expect(nextReady(s, T0)).toBe(30);
    const sum = awaySummary(s, content, T0 + 60);
    expect(sum.ripe).toEqual([{ crop: 'Radish', count: 2 }]);
  });
});
