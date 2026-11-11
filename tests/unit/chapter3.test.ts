import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { newFarm, setFlag, unlockedCrops, type FarmState } from '../../src/core/farm';
import { boughtToday, buyFromMerchant, daysUntilMerchant, merchantHere, merchantStock, syncMerchant } from '../../src/core/merchant';
import { recipeTime, startRecipe, grantBuilding } from '../../src/core/processing';
import { deliverStage } from '../../src/core/shop';
import { advance, onEvent, readMail, sendMail, talk } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;
const ch2 = content.quests.filter((q) => q.chapter <= 2).map((q) => q.id);

/** A farm that has finished Chapter 2. */
function afterCh2(level = 10): FarmState {
  const s = newFarm(T0);
  s.level = level;
  s.story.done = [...ch2];
  for (const f of ['met_goldie', 'met_bruno', 'met_rufus', 'mill_built']) setFlag(s, f);
  return s;
}

describe('Chapter 3: Market Day', () => {
  it('picks up a letter that was read before the chapter existed', () => {
    const s = afterCh2();
    sendMail(s, 'tobias_2', 'now', T0, TZ);
    s.mail[0].read = true;
    advance(s, content, T0, TZ);
    expect(s.story.done).toContain('ch3_letter');
    expect(s.story.active).toMatchObject({ id: 'ch3_pip', status: 'offered' });
  });

  it('waits for level 9 before Pip visits', () => {
    const s = afterCh2(8);
    sendMail(s, 'tobias_2', 'now', T0, TZ);
    advance(s, content, T0, TZ);
    readMail(s, content, 'tobias_2', T0, TZ);
    expect(s.story.active).toBeNull();
    s.level = 9;
    advance(s, content, T0, TZ);
    expect(s.story.active?.id).toBe('ch3_pip');
  });

  it('plays from Pip to Ziggy', () => {
    const s = afterCh2();
    let now = T0;
    sendMail(s, 'tobias_2', 'now', now, TZ);
    advance(s, content, now, TZ);
    readMail(s, content, 'tobias_2', now, TZ);
    // Pip wants flour
    expect(talk(s, content, now, TZ).kind).toBe('intro');
    s.inventory.flour = 6;
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.flags).toContain('market_project');
    // Bruno and the market square project
    expect(talk(s, content, now, TZ).kind).toBe('intro');
    const market = content.projects.get('market')!;
    for (const st of market.stages) {
      Object.assign(s.inventory, st.items);
      s.coins += st.coins ?? 0;
      const r = deliverStage(s, content, 'market');
      expect(r.ok).toBe(true);
      if (r.ok) onEvent(s, content, { type: 'project', id: 'market', stage: r.stage }, now, TZ);
    }
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // the market opens overnight
    expect(s.story.active).toBeNull();
    now += 86400;
    readMail(s, content, 'pip_market', now, TZ);
    expect(s.flags).toContain('market_built');
    // opening day: two pastries
    expect(s.story.active?.id).toBe('ch3_pastry');
    talk(s, content, now, TZ);
    s.inventory.pastry = 2;
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.flags).toContain('merchant_open');
    // Ziggy: buy one thing from the cart
    expect(s.story.active?.id).toBe('ch3_ziggy');
    talk(s, content, now, TZ);
    let day = 0;
    while (!merchantHere(content, day)) day++;
    s.coins = 100_000;
    expect(buyFromMerchant(s, content, 1, day).ok).toBe(true);
    onEvent(s, content, { type: 'merchant_buy' }, now, TZ);
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.story.done).toContain('ch3_ziggy');
    expect(s.mail.some((m) => m.id === 'tobias_3')).toBe(true);
  });
});

describe("Ziggy's cart", () => {
  const open = () => {
    const s = afterCh2(10);
    setFlag(s, 'merchant_open');
    s.coins = 100_000;
    return s;
  };

  it('visits every third day', () => {
    const days = Array.from({ length: 9 }, (_, d) => merchantHere(content, d));
    expect(days.filter(Boolean).length).toBe(3);
    const d = days.indexOf(false);
    expect(daysUntilMerchant(content, d)).toBeGreaterThan(0);
  });

  it('sells each slot once, and an early seed unlocks that crop', () => {
    const s = open();
    let day = 0;
    while (!merchantHere(content, day)) day++;
    const stock = merchantStock(s, content, day);
    expect(stock).toHaveLength(4);
    const seed = stock[0];
    expect(seed.kind).toBe('seed');
    if (seed.kind !== 'seed') return;
    expect(unlockedCrops(s, content).some((c) => c.id === seed.crop)).toBe(false);
    expect(buyFromMerchant(s, content, 0, day).ok).toBe(true);
    expect(unlockedCrops(s, content).some((c) => c.id === seed.crop)).toBe(true);
    expect(buyFromMerchant(s, content, 0, day)).toMatchObject({ ok: false, reason: 'sold' });
    // the slots don't reshuffle after buying or levelling up
    s.level = 14;
    expect(merchantStock(s, content, day).map((x) => x.label)).toEqual(stock.map((x) => x.label));
    expect(boughtToday(s, day)).toEqual([0]);
  });

  it('is closed on other days and before the story opens it', () => {
    const s = open();
    let away = 0;
    while (merchantHere(content, away)) away++;
    expect(buyFromMerchant(s, content, 1, away)).toMatchObject({ ok: false, reason: 'away' });
    const fresh = afterCh2();
    let day = 0;
    while (!merchantHere(content, day)) day++;
    expect(buyFromMerchant(fresh, content, 1, day)).toMatchObject({ ok: false, reason: 'locked' });
    syncMerchant(fresh, content, day);
    expect(fresh.merchant).toBeUndefined();
  });

  it('a new visit brings new stock and resets what was bought', () => {
    const s = open();
    let day = 0;
    while (!merchantHere(content, day)) day++;
    buyFromMerchant(s, content, 3, day);
    expect(boughtToday(s, day + 3)).toEqual([]);
    expect(buyFromMerchant(s, content, 3, day + 3).ok).toBe(true);
  });
});

describe("Pip's perk", () => {
  it('makes the bakery 25% faster', () => {
    const s = afterCh2(12);
    grantBuilding(s, content, 'bakery');
    const r = content.buildings.get('bakery')!.recipes[0];
    expect(recipeTime(s, 'bakery', r)).toBe(r.dur_s);
    setFlag(s, 'perk:pip');
    expect(recipeTime(s, 'bakery', r)).toBe(Math.round(r.dur_s * 0.75));
    Object.assign(s.inventory, r.inputs);
    const out = startRecipe(s, content, 'bakery', r.id, T0);
    expect(out.ok && out.item.durS).toBe(Math.round(r.dur_s * 0.75));
  });
});
