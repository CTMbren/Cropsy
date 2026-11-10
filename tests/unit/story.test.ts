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
