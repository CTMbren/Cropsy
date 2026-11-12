import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { beauty, buyDecor, calendarRewards, canClaim, claimGift, decorSpots, nextGift, pickUpDecor, placeDecor, spotCell, stored, tipBonus } from '../../src/core/decor';
import { expand, harvest, isFresh, key, newFarm, plant, setFlag, type FarmState } from '../../src/core/farm';
import { deliverStage } from '../../src/core/shop';
import { advance, onEvent, readMail, sendMail, talk } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;

function afterCh4(level = 20): FarmState {
  const s = newFarm(T0);
  s.obstacles = {};
  s.level = level;
  s.coins = 100_000;
  s.story.done = content.quests.filter((q) => q.chapter <= 4).map((q) => q.id);
  for (const f of ['met_goldie', 'met_bruno', 'met_rufus', 'met_pip', 'met_ziggy', 'met_hazel', 'met_juniper', 'mill_built']) setFlag(s, f);
  return s;
}

describe('Chapter 5: The Golden Harvest', () => {
  it('plays from Tobias\'s letter to the finale', () => {
    const s = afterCh4();
    let now = T0;
    sendMail(s, 'tobias_4', 'now', now, TZ);
    advance(s, content, now, TZ);
    readMail(s, content, 'tobias_4', now, TZ);
    expect(s.flags).toContain('festival_project');
    // a festival stage delivered before Goldie's visit still counts
    const fest = content.projects.get('festival')!;
    Object.assign(s.inventory, fest.stages[0].items);
    expect(deliverStage(s, content, 'festival').ok).toBe(true);
    expect(s.story.active?.id).toBe('ch5_festival');
    talk(s, content, now, TZ);
    expect(s.story.active?.progress).toEqual([1]);
    for (const st of fest.stages.slice(1)) {
      Object.assign(s.inventory, st.items);
      const r = deliverStage(s, content, 'festival');
      if (r.ok) onEvent(s, content, { type: 'project', id: 'festival', stage: r.stage }, now, TZ);
    }
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // Hazel hands over Tobias's golden melon seeds
    expect(s.flags).toContain('early:golden_melon');
    expect(s.story.active?.id).toBe('ch5_golden');
    talk(s, content, now, TZ);
    expect(plant(s, content, key(0, 0), 'golden_melon', now).ok).toBe(true);
    now += 172800;
    const h = harvest(s, content, key(0, 0), now);
    expect(h.ok).toBe(true);
    onEvent(s, content, { type: 'harvest', crop: 'golden_melon' }, now, TZ);
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // Tobias comes home
    expect(s.story.active?.id).toBe('ch5_tobias');
    talk(s, content, now, TZ);
    const ribbons = s.ribbons;
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.ribbons).toBe(ribbons + 10);
    expect(s.flags).toContain('story_complete');
    expect(s.story.done.length).toBe(content.quests.filter((q) => q.chapter <= 5).length);
    // his thank-you letter brings a statue
    now += 86400;
    readMail(s, content, 'tobias_5', now, TZ);
    expect(stored(s).statue).toBe(1);
  });
});

describe('decorations', () => {
  it('are bought, placed beside the field and picked back up', () => {
    const s = afterCh4(10);
    expect(buyDecor(s, content, 'fountain')).toMatchObject({ ok: false, reason: 'locked' });
    expect(buyDecor(s, content, 'statue')).toMatchObject({ ok: false, reason: 'unknown' });
    const coins = s.coins;
    expect(buyDecor(s, content, 'scarecrow').ok).toBe(true);
    expect(s.coins).toBe(coins - 2000);
    expect(decorSpots(s)).toHaveLength(s.width + s.height + 1);
    expect(placeDecor(s, 'scarecrow', 'R0').ok).toBe(true);
    expect(placeDecor(s, 'scarecrow', 'R1')).toMatchObject({ ok: false, reason: 'none' });
    expect(beauty(s, content)).toBe(5);
    buyDecor(s, content, 'bench');
    expect(placeDecor(s, 'bench', 'R0')).toMatchObject({ ok: false, reason: 'taken' });
    expect(pickUpDecor(s, 'R0').ok).toBe(true);
    expect(stored(s)).toEqual({ scarecrow: 1, bench: 1 });
    expect(beauty(s, content)).toBe(0);
  });

  it('spots stay outside the field when it expands', () => {
    const s = afterCh4();
    placeDecor(s, 'x', 'F0');
    s.decorStore = { hay: 1 };
    placeDecor(s, 'hay', 'F2');
    expand(s);
    const c = spotCell(s, 'F2');
    expect(c.y).toBeGreaterThanOrEqual(s.height);
    expect(s.plots[key(Math.round(c.x), Math.round(c.y))]).toBeUndefined();
  });

  it('beauty raises Fresh Pick tips, capped at +50%', () => {
    const s = afterCh4();
    s.decorStore = { fountain: 3, statue: 1 };
    for (const [i, id] of ['fountain', 'fountain', 'fountain', 'statue'].entries()) placeDecor(s, id, `R${i}`);
    expect(tipBonus(s, content)).toBe(0.5);
    plant(s, content, key(0, 0), 'tomato', T0);
    const p = s.plots[key(0, 0)];
    expect(isFresh(p, T0 + p.growS)).toBe(true);
    const r = harvest(s, content, key(0, 0), T0 + p.growS);
    expect(r.ok && r.kind === 'harvested' && r.tip).toBe(Math.round(75 * 0.2 * 1.5));
  });
});

describe('daily gift calendar', () => {
  it('gives one gift a day and never resets after a missed day', () => {
    const s = afterCh4();
    expect(canClaim(s, 100)).toBe(true);
    const first = claimGift(s, content, 100);
    expect(first).toEqual(calendarRewards(content)[0]);
    expect(claimGift(s, content, 100)).toBeNull();
    // skip three days: the next gift is still day 2
    expect(nextGift(s, content)).toBe(1);
    expect(claimGift(s, content, 104)).toEqual(calendarRewards(content)[1]);
    // day 7 gives a decoration, then the cycle starts again
    for (let d = 105; d < 110; d++) claimGift(s, content, d);
    expect(stored(s).flowerbed).toBe(1);
    expect(nextGift(s, content)).toBe(0);
  });

  it('waits until the tutorial is over', () => {
    const s = newFarm(T0);
    expect(canClaim(s, 1)).toBe(false);
  });
});
