import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { setFlag, newFarm, type FarmState } from '../../src/core/farm';
import { biteCap, biteGap, catchFish, FISH, fishNow, localHour, nextBiteIn, rollFish, syncBites } from '../../src/core/fishing';
import { addFriendship, friends, taste } from '../../src/core/friendship';
import { advance, onEvent, readMail, refreshQuest, sendMail, talk } from '../../src/core/story';

const content = loadContent();
// 2027-01-04 00:00 UTC; with TZ 0 the local hour is the UTC hour
const MIDNIGHT = Date.UTC(2027, 0, 4) / 1000;
const at = (hour: number) => MIDNIGHT + hour * 3600;
const TZ = 0;

function afterCh5(level = 22): FarmState {
  const s = newFarm(at(9));
  s.obstacles = {};
  s.level = level;
  s.coins = 100_000;
  s.story.done = content.quests.filter((q) => q.chapter <= 5).map((q) => q.id);
  for (const f of ['met_goldie', 'met_bruno', 'met_rufus', 'met_pip', 'met_ziggy', 'met_hazel', 'met_juniper', 'mill_built', 'story_complete']) setFlag(s, f);
  return s;
}

function openCreek(now = at(9)): FarmState {
  const s = afterCh5();
  setFlag(s, 'creek_open');
  syncBites(s, content, now);
  return s;
}

describe('Creek Dock fishing', () => {
  it('starts with a full creek, then banks a bite every 4–8 minutes up to the cap', () => {
    for (let n = 0; n < 50; n++) {
      expect(biteGap(content, n)).toBeGreaterThanOrEqual(240);
      expect(biteGap(content, n)).toBeLessThanOrEqual(480);
    }
    const s = afterCh5();
    expect(syncBites(s, content, at(9))).toBe(0);
    expect(s.fishing).toBeUndefined();
    setFlag(s, 'creek_open');
    syncBites(s, content, at(9));
    expect(s.fishing!.bites).toBe(5);
    expect(nextBiteIn(s, content, at(9))).toBeNull();
    for (let i = 0; i < 5; i++) expect(catchFish(s, content, 'minnow', at(9)).ok).toBe(true);
    expect(catchFish(s, content, 'minnow', at(9))).toEqual({ ok: false, reason: 'no_bites' });
    // a day away refills it, but never past the cap
    syncBites(s, content, at(33));
    expect(s.fishing!.bites).toBe(5);
    // Nell's 5-heart perk raises the cap to 8
    setFlag(s, 'perk:nell');
    expect(biteCap(s, content)).toBe(8);
    syncBites(s, content, at(36));
    expect(s.fishing!.bites).toBe(8);
  });

  it('bites depend on the time of day, and legends wait for the journal', () => {
    const s = openCreek();
    expect(localHour(at(23), TZ)).toBe(23);
    expect(localHour(at(23), 60)).toBe(22);
    const ids = (h: number) => fishNow(s, at(h), TZ).map((f) => f.id);
    expect(ids(8)).toContain('dawn_char');
    expect(ids(8)).not.toContain('moonbass');
    expect(ids(19)).toContain('glimmer_dace');
    expect(ids(23)).toEqual(expect.arrayContaining(['moonbass', 'night_eel']));
    expect(ids(2)).toContain('moonbass');
    expect(ids(12)).not.toContain('old_whiskers');
    s.fishing!.seen = ['minnow', 'perch', 'brook_trout', 'crayfish', 'dawn_char'];
    expect(ids(12)).toContain('old_whiskers');
    expect(ids(6)).not.toContain('golden_carp');
    s.fishing!.seen = FISH.filter((f) => f.id !== 'golden_carp').map((f) => f.id);
    expect(ids(6)).toContain('golden_carp');
    expect(ids(12)).not.toContain('golden_carp');
    // rolls only ever pick something that's biting
    for (let i = 0; i < 20; i++) expect(ids(23)).toContain(rollFish(s, at(23), TZ, i / 20).id);
  });

  it('catches go to the barn and the journal; first catches befriend Nell; pages earn a Ribbon', () => {
    const s = openCreek();
    setFlag(s, 'met_nell');
    const ribbons = s.ribbons;
    const r = catchFish(s, content, 'perch', at(9));
    expect(r).toMatchObject({ ok: true, firstTime: true });
    expect(r.ok && r.friendship?.villager).toBe('nell');
    expect(s.inventory.perch).toBe(1);
    expect(catchFish(s, content, 'perch', at(9))).toMatchObject({ ok: true, firstTime: false });
    expect(s.fishing!.caught.perch).toBe(2);
    for (const id of ['minnow', 'brook_trout']) catchFish(s, content, id, at(9));
    const last = catchFish(s, content, 'crayfish', at(9));
    expect(last).toMatchObject({ ok: true, pageDone: 1 });
    expect(s.ribbons).toBe(ribbons + 1);
    expect(content.goods.get('perch')?.sell).toBeGreaterThan(0);
  });
});

describe('Chapter 6: Across the Creek', () => {
  it('plays from Tobias staying to the ferry, with Nell joining the valley', () => {
    const s = afterCh5(20);
    let now = at(9);
    advance(s, content, now, TZ);
    expect(s.story.active?.id).toBe('ch6_letter');
    sendMail(s, 'tobias_6', 'now', now, TZ);
    readMail(s, content, 'tobias_6', now, TZ);
    // Bruno rebuilds the dock
    expect(s.story.active?.id).toBe('ch6_dock');
    expect(talk(s, content, now, TZ).kind).toBe('intro');
    Object.assign(s.inventory, { wood: 40, stone: 15 });
    const coins = s.coins;
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.coins).toBeLessThan(coins);
    expect(s.flags).toEqual(expect.arrayContaining(['creek_open', 'met_nell']));
    expect(friends(s, content)).toContain('nell');
    // Nell's fishing lesson
    expect(s.story.active?.id).toBe('ch6_nell');
    talk(s, content, now, TZ);
    syncBites(s, content, now);
    for (const id of ['minnow', 'perch', 'brook_trout']) {
      const r = catchFish(s, content, id, now);
      expect(r.ok).toBe(true);
      onEvent(s, content, { type: 'fish', fish: id }, now, TZ);
    }
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // five different kinds
    expect(s.story.active?.id).toBe('ch6_species');
    talk(s, content, now, TZ);
    now = at(20);
    syncBites(s, content, now);
    for (const id of ['crayfish', 'glimmer_dace']) catchFish(s, content, id, now);
    refreshQuest(s, content);
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // Rufus's peace offering waits for level 21
    expect(s.story.active).toBeNull();
    s.level = 22;
    advance(s, content, now, TZ);
    expect(s.story.active?.id).toBe('ch6_rufus');
    talk(s, content, now, TZ);
    Object.assign(s.inventory, { brook_trout: 5, flour: 5 });
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    // the ferry, and Tobias's teaser for Chapter 7
    expect(s.story.active?.id).toBe('ch6_ferry');
    talk(s, content, now, TZ);
    Object.assign(s.inventory, { wood: 30, cotton: 10, honey: 5 });
    expect(talk(s, content, now, TZ).kind).toBe('outro');
    expect(s.flags).toContain('ferry_fixed');
    expect(s.story.done.length).toBe(content.quests.length);
    expect(s.mail.some((m) => m.id === 'tobias_7')).toBe(true);
  });

  it('Nell has a gift list, two heart events and a 5-heart perk', () => {
    const s = afterCh5();
    setFlag(s, 'met_nell');
    expect(taste(content, 'nell', 'coffee')).toBe('loved');
    expect(taste(content, 'rufus', 'brook_trout')).toBe('liked');
    expect(content.villagers.get('nell')!.events).toHaveLength(2);
    const r = addFriendship(s, content, 'nell', 500);
    expect(r.perk).toMatch(/8 bites/);
    expect(s.flags).toContain('perk:nell');
  });
});
