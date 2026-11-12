import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { placeDecor, stored } from '../../src/core/decor';
import { fertilize, harvest, key, MYSTERY, MYSTERY_SEED, mysteryBloom, mysteryCfg, mysteryPrice, mysteryXp, newFarm, plant, replantAll, sell, setFlag, unlockedCrops } from '../../src/core/farm';
import { buyFromMerchant, merchantHere, merchantStock } from '../../src/core/merchant';

const content = loadContent();
const T0 = 1_800_000_000;

describe('Mystery seeds from Ziggy', () => {
  it("are the cart's fifth slot every visit, priced by level", () => {
    const s = newFarm(T0);
    s.level = 12;
    s.coins = 10_000;
    setFlag(s, 'merchant_open');
    const day = [...Array(10).keys()].find((d) => merchantHere(content, d, s))!;
    const stock = merchantStock(s, content, day);
    expect(stock[4]).toMatchObject({ kind: 'item', id: MYSTERY_SEED, qty: 1, coins: mysteryPrice(content, 12) });
    expect(buyFromMerchant(s, content, 4, day).ok).toBe(true);
    expect(s.inventory[MYSTERY_SEED]).toBe(1);
    expect(buyFromMerchant(s, content, 4, day)).toMatchObject({ ok: false, reason: 'sold' });
  });

  it('never shows up as a normal crop', () => {
    expect(content.crops.some((c) => c.id === MYSTERY)).toBe(false);
    expect(content.cropById.get(MYSTERY)?.hidden).toBe(true);
    expect(unlockedCrops(newFarm(T0), content).some((c) => c.id === MYSTERY)).toBe(false);
  });

  it('plants from the barn, takes 12–16 hours, and blooms into a rare flower with big XP', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    s.level = 12;
    const k = key(0, 0);
    expect(plant(s, content, k, MYSTERY, T0)).toMatchObject({ ok: false, reason: 'none' });
    s.inventory[MYSTERY_SEED] = 1;
    const coins = s.coins;
    expect(plant(s, content, k, MYSTERY, T0).ok).toBe(true);
    expect(s.coins).toBe(coins);
    expect(s.inventory[MYSTERY_SEED] ?? 0).toBe(0);
    const p = s.plots[k];
    expect(p.growS).toBeGreaterThanOrEqual(12 * 3600);
    expect(p.growS).toBeLessThanOrEqual(16 * 3600);
    // no doubling with fertilizer, and Replant all doesn't use mystery seeds
    s.inventory.fertilizer = 1;
    expect(fertilize(s, k, T0 + 60)).toMatchObject({ ok: false, reason: 'mystery' });
    expect(harvest(s, content, k, T0 + 3600).ok).toBe(false);

    const bloom = mysteryBloom(content, k, p.plantedAt);
    const xpBefore = s.xp;
    const levelBefore = s.level;
    const r = harvest(s, content, k, T0 + p.growS);
    expect(r).toMatchObject({ ok: true, kind: 'harvested', bloom: bloom.id, bloomNew: true, xp: mysteryXp(content, 12) });
    expect(s.xp > xpBefore || s.level > levelBefore).toBe(true);
    expect(s.inventory[bloom.id]).toBe(1);
    expect(s.harvests?.[MYSTERY]).toBeUndefined();
    expect(replantAll(s, content, T0 + p.growS)).not.toContain(k);
  });

  it('blooms sell for a good price or become decorations', () => {
    const s = newFarm(T0);
    for (const b of mysteryCfg(content).blooms) {
      expect(content.goods.get(b.id)?.sell).toBe(b.sell);
      s.inventory[b.id] = 2;
    }
    const before = s.coins;
    expect(sell(s, content, 'moonpetal', 1)).toBeGreaterThan(500);
    expect(s.coins).toBeGreaterThan(before);
    // decoration: move it to storage and place it
    s.inventory.rainbow_rose -= 1;
    s.decorStore = { rainbow_rose: 1 };
    expect(placeDecor(s, 'rainbow_rose', 'C').ok).toBe(true);
    expect(stored(s).rainbow_rose).toBeUndefined();
  });

  it('rolls every bloom over many plantings, with the Rainbow Rose rarest', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const b = mysteryBloom(content, key(i % 9, 0), T0 + i * 37);
      counts[b.id] = (counts[b.id] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(mysteryCfg(content).blooms.map((b) => b.id).sort());
    expect(counts.rainbow_rose).toBeLessThan(counts.moonpetal);
  });
});

describe('a cart visit that started before mystery seeds', () => {
  it('gets the mystery seed added, without moving the other slots or what was bought', async () => {
    const { syncMerchant } = await import('../../src/core/merchant');
    const s = newFarm(T0);
    s.level = 12;
    s.coins = 10_000;
    setFlag(s, 'merchant_open');
    const day = [...Array(10).keys()].find((d) => merchantHere(content, d, s))!;
    syncMerchant(s, content, day);
    // simulate an old save: four slots, the first already bought
    s.merchant!.stock = s.merchant!.stock!.slice(0, 4);
    s.merchant!.bought = [0];
    const old = JSON.stringify(s.merchant!.stock);
    syncMerchant(s, content, day);
    expect(JSON.stringify(s.merchant!.stock.slice(0, 4))).toBe(old);
    expect(s.merchant!.stock[4]).toMatchObject({ id: MYSTERY_SEED });
    expect(s.merchant!.bought).toEqual([0]);
    expect(buyFromMerchant(s, content, 4, day).ok).toBe(true);
    expect(s.inventory[MYSTERY_SEED]).toBe(1);
    syncMerchant(s, content, day);
    expect(s.merchant!.stock).toHaveLength(5);
  });
});
