import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { decorSpots, spotCell } from '../../src/core/decor';
import { expand, key, newFarm, plant, setFlag, type FarmState } from '../../src/core/farm';
import { blockerAt, clearCost, clearTime, plotCap, plotCount, startClearing, syncLand, touchesField, wildCells } from '../../src/core/land';

const content = loadContent();
const T0 = 1_800_000_000;

/** A farm just past Bruno's gate: 5×5. */
function gated(level = 6): FarmState {
  const s = newFarm(T0);
  expand(s);
  s.obstacles = {};
  s.level = level;
  s.coins = 100_000;
  return s;
}

describe('clearing land one plot at a time', () => {
  it('stays locked until Bruno rebuilds the gate', () => {
    const s = newFarm(T0);
    s.coins = 1000;
    expect(startClearing(s, content, key(4, 0), T0)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('shows stumps and boulders all round the field, clearable only where they touch it', () => {
    const s = gated();
    const wild = wildCells(s, content);
    expect(wild).toContain(key(5, 0));
    expect(wild).toContain(key(5, 5)); // the diagonal corner is drawn…
    expect(touchesField(s, key(5, 5))).toBe(false); // …but can't be cleared yet
    expect(touchesField(s, key(5, 2))).toBe(true);
    expect(wild.every((k) => ['stump', 'boulder'].includes(blockerAt(k)))).toBe(true);
    expect(startClearing(s, content, key(5, 5), T0)).toMatchObject({ ok: false, reason: 'not-adjacent' });
  });

  it('costs coins and 30+ minutes, one job at a time, and pays wood or stone', () => {
    const s = gated();
    const cell = wildCells(s, content).find((k) => touchesField(s, k) && blockerAt(k) === 'stump')!;
    const cost = clearCost(s, content);
    const time = clearTime(s, content, 'stump');
    expect(time).toBeGreaterThanOrEqual(1800);
    expect(clearTime(s, content, 'boulder')).toBeGreaterThanOrEqual(3600);
    const r = startClearing(s, content, cell, T0);
    expect(r).toEqual({ ok: true, endsAt: T0 + time });
    expect(s.coins).toBe(100_000 - cost);
    const other = wildCells(s, content).find((k) => k !== cell && touchesField(s, k))!;
    expect(startClearing(s, content, other, T0)).toMatchObject({ ok: false, reason: 'busy' });
    expect(syncLand(s, content, T0 + time - 1)).toBeNull();
    expect(s.plots[cell]).toBeUndefined();
    expect(syncLand(s, content, T0 + time)).toMatchObject({ cell, item: 'wood', qty: 3 });
    expect(s.plots[cell]).toMatchObject({ crop: null });
    expect(s.inventory.wood).toBe(3);
    expect(plotCount(s)).toBe(26);
    expect(s.clearing).toBeUndefined();
    // the new plot can be planted straight away
    expect(plant(s, content, cell, 'radish', T0 + time).ok).toBe(true);
  });

  it('each plot costs a bit more and takes a bit longer', () => {
    const s = gated(20);
    const c0 = clearCost(s, content);
    const t0 = clearTime(s, content, 'stump');
    let now = T0;
    for (let i = 0; i < 10; i++) {
      const cell = wildCells(s, content).find((k) => touchesField(s, k))!;
      const r = startClearing(s, content, cell, now);
      if (!r.ok) throw new Error(r.reason);
      now = r.endsAt;
      syncLand(s, content, now);
    }
    expect(clearCost(s, content)).toBeGreaterThan(c0);
    expect(clearTime(s, content, 'stump')).toBeGreaterThan(t0);
  });

  it('the plot cap rises with level', () => {
    const s = gated(5);
    expect(plotCap(s, content)).toBe(25);
    expect(startClearing(s, content, key(5, 0), T0)).toMatchObject({ ok: false, reason: 'cap' });
    s.level = 6;
    expect(plotCap(s, content)).toBe(36);
    s.level = 20;
    expect(plotCap(s, content)).toBe(81);
  });

  it('stops at the edge of the 9×9 homestead', () => {
    const s = gated(20);
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) s.plots[key(x, y)] ??= { crop: null, plantedAt: 0, growS: 0, soil: 0 };
    expect(wildCells(s, content)).toEqual([]);
    expect(startClearing(s, content, key(9, 0), T0)).toMatchObject({ ok: false, reason: 'not-wild' });
  });

  it('decorations stand beyond the overgrown land', () => {
    const s = gated();
    setFlag(s, 'x');
    const wild = new Set(wildCells(s, content));
    for (const spot of decorSpots(s)) {
      const c = spotCell(s, spot);
      expect(wild.has(key(Math.round(c.x), Math.round(c.y)))).toBe(false);
    }
  });
});
