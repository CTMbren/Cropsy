import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { clearObstacle, newFarm } from '../../src/core/farm';
import { migrate } from '../../src/core/save';
import { advance, ensureQuestMaterials, readMail } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 420;
const weeds = (s: { obstacles: Record<string, string> }) => Object.values(s.obstacles).filter((k) => k === 'weeds').length;

describe('quests never ask for obstacles the farm does not have', () => {
  it('a Phase 0 farm (already cleared) gets weeds when Goldie asks for them', () => {
    const v1 = {
      version: 1, coins: 40, xp: 0, level: 1, width: 4, height: 4,
      plots: Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`${i % 4},${Math.floor(i / 4)}`, { crop: null, plantedAt: 0, growS: 0 }])),
      inventory: {}, time: { maxSeenTime: T0, debugOffset: 0 }, lastSeen: T0,
    };
    const s = migrate(v1 as never);
    expect(s.obstacles).toEqual({});
    advance(s, content, T0, TZ);
    readMail(s, content, 'tobias_1', T0, TZ);
    expect(s.story.active).toMatchObject({ id: 'ch1_weeds' });
    expect(weeds(s)).toBe(3);
  });

  it('repairs a save that is already stuck on the weeds quest', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    s.story = { done: ['ch1_letter'], active: { id: 'ch1_weeds', status: 'active', progress: [1] } };
    advance(s, content, T0, TZ);
    expect(weeds(s)).toBe(2); // one already pulled
    expect(ensureQuestMaterials(s, content)).toEqual([]); // nothing more once it's possible
  });

  it('places branches and rocks when Bruno needs wood and stone the farm can\'t provide', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    s.inventory = { wood: 1 };
    s.story = { done: content.quests.slice(0, 5).map((q) => q.id), active: { id: 'ch1_gate', status: 'active', progress: [0] } };
    ensureQuestMaterials(s, content);
    const kinds = Object.values(s.obstacles);
    expect(kinds.filter((k) => k === 'branch').length).toBe(3);
    expect(kinds.filter((k) => k === 'rock').length).toBe(3);
  });

  it('never covers growing crops, and waits until a plot is free', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    for (const k of Object.keys(s.plots)) s.plots[k] = { crop: 'radish', plantedAt: T0, growS: 30 };
    s.story = { done: ['ch1_letter'], active: { id: 'ch1_weeds', status: 'active', progress: [0] } };
    expect(ensureQuestMaterials(s, content)).toEqual([]);
    s.plots['0,0'] = { crop: null, plantedAt: 0, growS: 0 };
    expect(ensureQuestMaterials(s, content)).toEqual(['0,0']);
  });

  it('a normal new farm is left alone', () => {
    const s = newFarm(T0);
    advance(s, content, T0, TZ);
    readMail(s, content, 'tobias_1', T0, TZ);
    const before = { ...s.obstacles };
    ensureQuestMaterials(s, content);
    expect(s.obstacles).toEqual(before);
    clearObstacle(s, '0,0');
    expect(ensureQuestMaterials(s, content)).toEqual([]);
  });
});

describe('finished quests keep their unlocks', () => {
  it('re-grants a missing unlock flag (e.g. the Almanac) and leaves good saves alone', async () => {
    const { restoreQuestFlags } = await import('../../src/core/story');
    const s = newFarm(T0);
    s.story.done = content.quests.filter((q) => q.chapter <= 3 || q.id === 'ch4_letter').map((q) => q.id);
    expect(s.flags).not.toContain('almanac_open');
    expect(restoreQuestFlags(s, content)).toEqual(expect.arrayContaining(['almanac_open', 'met_hazel']));
    expect(s.flags).toContain('almanac_open');
    expect(restoreQuestFlags(s, content)).toEqual([]);
  });
});

describe('story letters', () => {
  it('reports on its way / waiting / read, and resends a letter an old save never got', async () => {
    const { ensureQuestMail, letterStatus, sendMail } = await import('../../src/core/story');
    const s = newFarm(T0);
    s.story.done = content.quests.filter((q) => q.chapter <= 3).map((q) => q.id);
    s.story.active = { id: 'ch4_letter', status: 'active', progress: [0] };
    expect(letterStatus(s, 'tobias_3', T0).state).toBe('missing');
    expect(ensureQuestMail(s, content, T0, TZ)).toEqual(['tobias_3']);
    expect(letterStatus(s, 'tobias_3', T0).state).toBe('waiting');
    expect(ensureQuestMail(s, content, T0, TZ)).toEqual([]);
    const s2 = newFarm(T0);
    sendMail(s2, 'tobias_3', 'next_day', T0, TZ);
    expect(letterStatus(s2, 'tobias_3', T0)).toMatchObject({ state: 'coming' });
    readMail(s, content, 'tobias_3', T0, TZ);
    expect(letterStatus(s, 'tobias_3', T0).state).toBe('read');
    expect(s.flags).toContain('almanac_open');
  });
});
