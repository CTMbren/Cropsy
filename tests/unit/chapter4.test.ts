import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { chooseMastery, harvest, key, lifetimeHarvests, masteryLevel, masteryMult, masteryPending, masteryThreshold, masteryToChoose, newFarm, plant, setFlag, unplant, type FarmState } from '../../src/core/farm';
import { addFriendship, mossDigsLeft, patMoss, pendingEvents, seenEvents, watchEvent } from '../../src/core/friendship';
import { advance, onEvent, readMail, refreshQuest, sendMail, talk } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;

function afterCh3(level = 15): FarmState {
  const s = newFarm(T0);
  s.obstacles = {};
  s.level = level;
  s.coins = 50_000;
  s.story.done = content.quests.filter((q) => q.chapter <= 3).map((q) => q.id);
  for (const f of ['met_goldie', 'met_bruno', 'met_rufus', 'met_pip', 'met_ziggy', 'mill_built', 'merchant_open']) setFlag(s, f);
  return s;
}

describe('Crop Mastery', () => {
  it('levels forever on a formula, with a coin or XP choice each level', () => {
    const s = afterCh3();
    expect([1, 2, 3, 4, 5].map(masteryThreshold)).toEqual([75, 250, 525, 850, 1250]);
    expect(masteryThreshold(10)).toBeGreaterThan(masteryThreshold(9));
    s.harvests = { radish: 74 };
    s.seen = ['radish', 'carrot'];
    expect(masteryLevel(s, 'radish')).toBe(0);
    plant(s, content, key(0, 0), 'radish', T0);
    const ribbons = s.ribbons;
    const r = harvest(s, content, key(0, 0), T0 + 30);
    expect(r).toMatchObject({ ok: true, star: 1 });
    expect(s.ribbons).toBe(ribbons + 1);
    expect(masteryPending(s, 'radish')).toBe(1);
    expect(masteryToChoose(s)).toEqual(['radish']);
    // coin pick: +5% crate value for radish only
    expect(chooseMastery(s, 'radish', 'coin')).toBe(true);
    expect(chooseMastery(s, 'radish', 'xp')).toBe(false);
    expect(masteryMult(s, 'radish', 'coin')).toBeCloseTo(1.05);
    expect(masteryMult(s, 'carrot', 'coin')).toBe(1);
    // xp pick raises harvest XP
    s.harvests.carrot = 75;
    chooseMastery(s, 'carrot', 'xp');
    const carrot = content.cropById.get('carrot')!;
    s.harvests.carrot = 76;
    s.flags = s.flags.filter((f) => f !== 'perk:hazel');
    plant(s, content, key(1, 0), 'carrot', T0);
    const h = harvest(s, content, key(1, 0), T0 + carrot.grow_s);
    expect(h.ok && h.kind === 'harvested' && h.xp).toBe(Math.round(carrot.xp * 1.5 * 1.05));
    expect(lifetimeHarvests(s)).toBe(75 + 77);
  });

  it('undoes a planting tapped again within a few seconds, with a refund', () => {
    const s = afterCh3();
    const coins = s.coins;
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(unplant(s, content, key(0, 0), T0 + 5)).toMatchObject({ ok: false });
    expect(unplant(s, content, key(0, 0), T0 + 2)).toMatchObject({ ok: true });
    expect(s.coins).toBe(coins);
    expect(s.plots[key(0, 0)].crop).toBeNull();
  });

  it("Ziggy's early seeds can be planted", () => {
    const s = afterCh3(5);
    expect(plant(s, content, key(0, 0), 'grapes', T0)).toMatchObject({ ok: false, reason: 'locked' });
    setFlag(s, 'early:grapes');
    expect(plant(s, content, key(0, 0), 'grapes', T0)).toMatchObject({ ok: true });
  });
});

describe('Chapter 4: The Almanac', () => {
  it('plays from Tobias\'s letter to the heirloom, with quests measured from the farm', () => {
    const s = afterCh3();
    let now = T0;
    sendMail(s, 'tobias_3', 'now', now, TZ);
    advance(s, content, now, TZ);
    readMail(s, content, 'tobias_3', now, TZ);
    expect(s.flags).toContain('almanac_open');
    // Hazel: 10 different crops, counting ones already grown
    expect(s.story.active?.id).toBe('ch4_hazel');
    s.seen = content.crops.slice(0, 9).map((c) => c.id);
    talk(s, content, now, TZ);
    expect(s.story.active).toMatchObject({ status: 'active', progress: [9] });
    s.seen.push('pumpkin');
    refreshQuest(s, content);
    expect(s.story.active?.status).toBe('ready');
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // Juniper and Moss
    expect(s.story.active?.id).toBe('ch4_juniper');
    talk(s, content, now, TZ);
    Object.assign(s.inventory, { carrot: 30, wood: 10 });
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.flags).toContain('moss_visits');
    // mastery: already-earned harvests count straight away
    s.harvests = { potato: 50 };
    expect(talk(s, content, now, TZ).kind).toBe('intro');
    expect(s.story.active?.status).toBe('ready');
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // the heirloom hand-in sends Tobias's homecoming letter tomorrow
    talk(s, content, now, TZ);
    Object.assign(s.inventory, { sunflower: 10, pumpkin: 10 });
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.mail.find((m) => m.id === 'tobias_4')?.arrivesAt).toBeGreaterThan(now);
    now += 86400;
    expect(onEvent(s, content, { type: 'sell', n: 1 }, now, TZ).levelsGained).toBe(0);
  });
});

describe('heart events', () => {
  it('unlock at 3 and 6 hearts, pay Ribbons once and can be re-read', () => {
    const s = afterCh3();
    expect(pendingEvents(s, content).filter((e) => e.villager === 'pip')).toEqual([]);
    addFriendship(s, content, 'pip', 300);
    const [e] = pendingEvents(s, content).filter((x) => x.villager === 'pip');
    expect(e).toMatchObject({ hearts: 3, title: 'The burnt batch' });
    const ribbons = s.ribbons;
    expect(watchEvent(s, content, 'pip', 3)).toMatchObject({ ribbons: 2 });
    expect(s.ribbons).toBe(ribbons + 2);
    expect(watchEvent(s, content, 'pip', 3)).toBeNull();
    expect(seenEvents(s, content, 'pip').map((x) => x.hearts)).toEqual([3]);
    // strangers have no events
    addFriendship(s, content, 'hazel', 600);
    expect(pendingEvents(s, content).some((x) => x.villager === 'hazel')).toBe(false);
  });

  it('every villager you can befriend has two events', () => {
    for (const v of content.villagers.values()) if (v.id !== 'tobias') expect(v.events?.map((e) => e.hearts)).toEqual([3, 6]);
  });
});

describe('Moss', () => {
  it('digs up one find a day, two with Juniper\'s perk', () => {
    const s = afterCh3();
    expect(patMoss(s, 10)).toBeNull();
    setFlag(s, 'moss_visits');
    const before = JSON.stringify([s.inventory, s.coins]);
    expect(patMoss(s, 10)).not.toBeNull();
    expect(JSON.stringify([s.inventory, s.coins])).not.toBe(before);
    expect(patMoss(s, 10)).toBeNull();
    expect(mossDigsLeft(s, 11)).toBe(1);
    setFlag(s, 'perk:juniper');
    expect(mossDigsLeft(s, 10)).toBe(1);
    expect(mossDigsLeft(s, 11)).toBe(2);
  });
});
