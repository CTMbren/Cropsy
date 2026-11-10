import { describe, expect, it } from 'vitest';
import { fulfilOrder, generateOrders, giveItems, refreshBoard } from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { clearObstacle, harvest, key, newFarm, plant, sell, setFlag, type FarmState } from '../../src/core/farm';
import { advance, inbox, onEvent, readMail, talk, type GameEvent } from '../../src/core/story';

const content = loadContent();
const TZ = 420; // UTC-7, like Cambridge Bay
const T0 = 1_800_000_000;
let now = T0;
const ev = (s: FarmState, e: GameEvent) => onEvent(s, content, e, now, TZ);

describe('Chapter 1', () => {
  it('plays from Tobias\'s letter to Bruno\'s gate', () => {
    const s = newFarm(T0);
    now = T0;
    advance(s, content, now, TZ);
    // 1. Tobias's letter arrives and the quest is active immediately
    expect(s.story.active).toMatchObject({ id: 'ch1_letter', status: 'active' });
    expect(inbox(s, now).map((m) => m.id)).toEqual(['tobias_1']);
    readMail(s, content, 'tobias_1', now, TZ);
    expect(s.story.done).toContain('ch1_letter');

    // 2. Goldie visits: clear 3 weeds
    expect(s.story.active).toMatchObject({ id: 'ch1_weeds', status: 'offered' });
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'intro' });
    for (const k of ['0,0', '3,0', '2,1']) {
      clearObstacle(s, k);
      ev(s, { type: 'clear', obstacle: 'weeds' });
    }
    expect(s.story.active?.status).toBe('ready');
    const coins = s.coins;
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'outro' });
    expect(s.coins).toBe(coins + 20);

    // 3. First harvest: 5 crops
    talk(s, content, now, TZ);
    for (let i = 0; i < 5; i++) {
      plant(s, content, key(1, 1), 'radish', now);
      now += 30;
      harvest(s, content, key(1, 1), now);
      ev(s, { type: 'harvest', crop: 'radish' });
    }
    talk(s, content, now, TZ);
    expect(s.story.done).toContain('ch1_harvest');

    // 4. Ship 5 crops at the crate, which opens the board
    talk(s, content, now, TZ);
    sell(s, content, 'radish', 5);
    ev(s, { type: 'sell', n: 5 });
    talk(s, content, now, TZ);
    expect(s.flags).toContain('board_open');

    // 5. Goldie's carrot order is pinned on the board and survives the daily refresh
    talk(s, content, now, TZ);
    refreshBoard(s, content, now, TZ);
    expect(s.board.orders[0]).toMatchObject({ id: 'story_goldie_carrots', story: 'ch1_order' });
    expect(fulfilOrder(s, 'story_goldie_carrots')).toMatchObject({ ok: false, reason: 'missing' });
    giveItems(s, { carrot: 4 });
    expect(fulfilOrder(s, 'story_goldie_carrots')).toMatchObject({ ok: true });
    ev(s, { type: 'order_done', id: 'story_goldie_carrots' });
    talk(s, content, now, TZ);
    expect(inbox(s, now).some((m) => m.id === 'bruno_quote')).toBe(true);

    // 6. Bruno: hand in wood, stone and coins; his letter arrives at the next local midnight
    expect(s.story.active).toMatchObject({ id: 'ch1_gate', status: 'offered' });
    talk(s, content, now, TZ);
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'reminder' });
    giveItems(s, { wood: 4, stone: 3 });
    s.coins = 100;
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'outro' });
    expect(s.coins).toBe(40);
    expect(inbox(s, now).some((m) => m.id === 'bruno_gate_done')).toBe(false);
    now += 86400;
    expect(inbox(s, now).some((m) => m.id === 'bruno_gate_done')).toBe(true);
    expect(s.width).toBe(4);
    readMail(s, content, 'bruno_gate_done', now, TZ);
    expect(s.width).toBe(5);
    readMail(s, content, 'bruno_gate_done', now, TZ);
    expect(s.width).toBe(5); // effects apply once
  });
});

describe('request board', () => {
  it('generates the same orders for the same day and only for unlocked crops', () => {
    const s = newFarm(T0);
    const a = generateOrders(s, content, 20000);
    const b = generateOrders(s, content, 20000);
    expect(a).toEqual(b);
    expect(a).toHaveLength(3);
    for (const o of a) for (const id of Object.keys(o.wants)) expect(content.cropById.get(id)!.unlock_level).toBeLessThanOrEqual(1);
    expect(generateOrders(s, content, 20001)).not.toEqual(a);
  });

  it('stays closed until the story opens it, then refreshes once per local day', () => {
    const s = newFarm(T0);
    expect(refreshBoard(s, content, T0, TZ)).toBe(false);
    setFlag(s, 'board_open');
    expect(refreshBoard(s, content, T0, TZ)).toBe(true);
    expect(refreshBoard(s, content, T0 + 60, TZ)).toBe(false);
    expect(refreshBoard(s, content, T0 + 86400, TZ)).toBe(true);
  });

  it('orders pay more than the shipping crate', () => {
    const s = newFarm(T0);
    for (const o of generateOrders(s, content, 123)) {
      const crate = Object.entries(o.wants).reduce((a, [id, n]) => a + Math.round(content.cropById.get(id)!.sell * 0.7) * n, 0);
      expect(o.coins).toBeGreaterThan(crate);
    }
  });
});

describe('Chapter 2', () => {
  it('waits for level 6, then plays from Goldie\'s letter to the first flour', async () => {
    const { deliverStage } = await import('../../src/core/shop');
    const { startRecipe, collect } = await import('../../src/core/processing');
    const s = newFarm(T0);
    now = T0;
    s.story.done = content.quests.filter((q) => q.chapter === 1).map((q) => q.id);
    expect(advance(s, content, now, TZ).started).toBeUndefined(); // level 1: Chapter 2 waits
    s.level = 6;
    advance(s, content, now, TZ);
    expect(s.story.active?.id).toBe('ch2_letter');
    readMail(s, content, 'goldie_rufus', now, TZ);

    // Rufus wants wheat, then stumps appear on the farm
    expect(s.story.active).toMatchObject({ id: 'ch2_rufus', status: 'offered' });
    talk(s, content, now, TZ);
    giveItems(s, { wheat: 10 });
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'outro' });
    const stumps = Object.entries(s.obstacles).filter(([, k]) => k === 'stump').map(([k]) => k);
    expect(stumps.length).toBe(2);

    // Bruno: buy a saw, cut the stumps
    talk(s, content, now, TZ);
    s.tools.push('saw');
    for (const k of stumps) {
      clearObstacle(s, k);
      ev(s, { type: 'clear', obstacle: 'stump' });
    }
    talk(s, content, now, TZ);
    expect(s.flags).toContain('mill_project');

    // Restore the mill in three stages
    talk(s, content, now, TZ);
    giveItems(s, { wood: 18, stone: 8, wheat: 15 });
    s.coins = 300;
    for (let i = 1; i <= 3; i++) {
      deliverStage(s, content, 'mill');
      ev(s, { type: 'project', id: 'mill', stage: i });
    }
    expect(talk(s, content, now, TZ)).toMatchObject({ kind: 'outro' });
    expect(s.buildings.mill).toBeUndefined();
    expect(s.story.active).toBeNull(); // waiting for the wheel

    // Next morning: the wheel turns, the mill is ours, and the flour quest starts
    now += 86400;
    readMail(s, content, 'rufus_wheel', now, TZ);
    expect(s.buildings.mill).toBeDefined();
    expect(s.story.active).toMatchObject({ id: 'ch2_flour', status: 'offered' });
    talk(s, content, now, TZ);
    giveItems(s, { wheat: 9 });
    startRecipe(s, content, 'mill', 'flour', now);
    startRecipe(s, content, 'mill', 'flour', now);
    collect(s, content, 'mill', now + 600);
    startRecipe(s, content, 'mill', 'flour', now + 600);
    collect(s, content, 'mill', now + 900);
    const ribbons = s.ribbons;
    expect(talk(s, content, now + 900, TZ)).toMatchObject({ kind: 'outro' });
    expect(s.ribbons).toBe(ribbons + 3);
    expect(inbox(s, now + 900).some((m) => m.id === 'tobias_2')).toBe(true);
  });
});
