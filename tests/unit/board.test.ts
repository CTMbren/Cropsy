import { describe, expect, it } from 'vitest';
import {
  boardTick,
  fillableCount,
  fulfilOrder,
  generateOrder,
  generateSpecial,
  giveItems,
  handInLine,
  isSpecial,
  passOrder,
  pinOrder,
  refreshBoard,
} from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { emptyPlot, key, newFarm, setFlag, unlockedCrops, type FarmState } from '../../src/core/farm';
import { grantBuilding } from '../../src/core/processing';
import { merchantHere } from '../../src/core/merchant';

const content = loadContent();
const TZ = 0;
const T0 = Date.UTC(2027, 0, 4, 9, 0, 0) / 1000; // a Monday, 9:00 (a 2-hour tick boundary + 1 h)
const H = 3600;
const b = content.board;

const regular = (s: FarmState) => s.board.orders.filter((o) => !o.story && !isSpecial(o));

function farmAt(level: number, plots: number, flags: string[] = []): FarmState {
  const s = newFarm(T0);
  s.level = level;
  s.obstacles = {};
  s.plots = {};
  const side = Math.ceil(Math.sqrt(plots));
  for (let i = 0; i < plots; i++) s.plots[key(i % side, Math.floor(i / side))] = emptyPlot();
  setFlag(s, 'board_open');
  for (const f of flags) setFlag(s, f);
  return s;
}

describe('request board: posting', () => {
  it('stays closed until the story opens it', () => {
    const s = newFarm(T0);
    expect(refreshBoard(s, content, T0, TZ)).toBe(0);
    expect(s.board.orders).toHaveLength(0);
  });

  it('posts a few on the first look, then one every 2 hours up to the slots', () => {
    const s = farmAt(3, 16);
    expect(refreshBoard(s, content, T0, TZ)).toBe(b.first_posts);
    expect(refreshBoard(s, content, T0 + 60, TZ)).toBe(0);
    // the next tick boundary is at 10:00
    expect(refreshBoard(s, content, T0 + H, TZ)).toBe(1);
    expect(regular(s)).toHaveLength(b.first_posts + 1);
    // a long time away fills only the free slots
    refreshBoard(s, content, T0 + 30 * H, TZ);
    expect(regular(s)).toHaveLength(b.slots);
    expect(refreshBoard(s, content, T0 + 40 * H, TZ)).toBe(0);
  });

  it('time away counts, and orders never expire', () => {
    const s = farmAt(3, 16);
    refreshBoard(s, content, T0, TZ);
    const first = s.board.orders.map((o) => o.id);
    s.board.orders.splice(0, 2); // fill two
    expect(refreshBoard(s, content, T0 + 3 * 24 * H, TZ)).toBe(2 + (b.slots - b.first_posts));
    // the one we never filled is still there days later
    expect(s.board.orders.some((o) => o.id === first[2])).toBe(true);
  });

  it('is deterministic per tick, and a clock rollback posts nothing', () => {
    const a = farmAt(8, 25);
    const c = farmAt(8, 25);
    refreshBoard(a, content, T0 + 5 * H, TZ);
    refreshBoard(c, content, T0 + 5 * H, TZ);
    expect(a.board.orders).toEqual(c.board.orders);
    a.board.orders = [];
    expect(refreshBoard(a, content, T0 - 10 * H, TZ)).toBe(0);
    expect(a.board.tick).toBe(boardTick(content, T0 + 5 * H, TZ));
  });

  it('keeps story orders on top and out of the slot count', () => {
    const s = farmAt(3, 16);
    pinOrder(s, { id: 'story_x', villager: 'goldie', wants: { carrot: 4 }, coins: 10, xp: 1, story: 'ch1_order' });
    refreshBoard(s, content, T0, TZ);
    refreshBoard(s, content, T0 + 30 * H, TZ);
    expect(regular(s)).toHaveLength(b.slots);
    expect(s.board.orders.some((o) => o.id === 'story_x')).toBe(true);
  });

  it('migrates a save from before ticks: old orders stay and fill the free slots', () => {
    const s = farmAt(5, 25);
    s.board = { day: 5, orders: [{ id: 'day5_0', villager: 'goldie', wants: { carrot: 3 }, coins: 54, xp: 5 }] };
    refreshBoard(s, content, T0, TZ);
    expect(s.board.orders[0].id).toBe('day5_0');
    expect(regular(s)).toHaveLength(1 + b.first_posts);
  });

  it('pass is free, and the slot fills on the next tick (no instant reroll)', () => {
    const s = farmAt(3, 16);
    refreshBoard(s, content, T0, TZ);
    refreshBoard(s, content, T0 + 30 * H, TZ);
    const coins = s.coins;
    const id = regular(s)[0].id;
    expect(passOrder(s, id)).toBe(true);
    expect(s.coins).toBe(coins);
    expect(refreshBoard(s, content, T0 + 30 * H + 60, TZ)).toBe(0);
    expect(refreshBoard(s, content, T0 + 32 * H, TZ)).toBe(1);
    expect(passOrder(s, 'nope')).toBe(false);
  });
});

describe('request board: tiers and posters', () => {
  it('mixes easy and medium about 60/40, with no ribbons on either', () => {
    const s = farmAt(12, 49);
    const os = Array.from({ length: 400 }, (_, t) => generateOrder(s, content, t, 0)!);
    const easy = os.filter((o) => o.tier === 'easy').length / os.length;
    expect(easy).toBeGreaterThan(0.5);
    expect(easy).toBeLessThan(0.7);
    expect(os.every((o) => !o.ribbons)).toBe(true);
  });

  it('easy orders are fast crops; medium crops grow 6 hours or less', () => {
    const s = farmAt(20, 64);
    const crops = unlockedCrops(s, content).sort((x, y) => x.grow_s - y.grow_s);
    const fast = new Set(crops.filter((c, i) => i < Math.ceil(crops.length / 3) || c.grow_s <= 900).map((c) => c.id));
    for (let t = 0; t < 300; t++) {
      const o = generateOrder(s, content, t, 0)!;
      for (const id of Object.keys(o.wants)) {
        const c = content.cropById.get(id);
        if (o.tier === 'easy') expect(fast.has(id)).toBe(true);
        else if (c) expect(c.grow_s).toBeLessThanOrEqual(b.tiers.medium.max_grow_s);
      }
    }
  });

  it('orders pay more than the shipping crate', () => {
    const s = farmAt(12, 49);
    for (let t = 0; t < 100; t++) {
      const o = generateOrder(s, content, t, 0)!;
      const crate = Object.entries(o.wants).reduce((a, [id, n]) => a + Math.round((content.cropById.get(id)?.sell ?? content.goods.get(id)!.sell) * 0.7) * n, 0);
      expect(o.coins).toBeGreaterThan(crate);
    }
  });

  it('every met villager posts, with a note in their voice; Ziggy only while in town', () => {
    const s = farmAt(15, 49, ['met_goldie', 'met_bruno', 'met_pip', 'met_hazel', 'met_ziggy']);
    const os = Array.from({ length: 300 }, (_, t) => generateOrder(s, content, t, 0)!);
    const who = new Set(os.map((o) => o.villager));
    for (const v of ['goldie', 'bruno', 'pip', 'hazel']) expect(who.has(v)).toBe(true);
    expect(who.has('rufus')).toBe(false);
    expect(os.every((o) => !!o.note && !o.note.includes('{item}'))).toBe(true);
    for (let d = 0; d < 14; d++) {
      const day = Array.from({ length: 60 }, (_, t) => generateOrder(s, content, t, d)!);
      if (!merchantHere(content, d, s)) expect(day.some((o) => o.villager === 'ziggy')).toBe(false);
    }
  });

  it('posters mostly ask for what they love or like', () => {
    const s = farmAt(15, 49, ['met_hazel']);
    // only Goldie and Hazel post
    const os = Array.from({ length: 400 }, (_, t) => generateOrder(s, content, t, 0)!).filter((o) => o.villager === 'hazel');
    const v = content.villagers.get('hazel')!;
    const fav = os.filter((o) => Object.keys(o.wants).some((id) => v.loves?.includes(id) || v.likes?.includes(id))).length;
    expect(fav / os.length).toBeGreaterThan(0.5);
  });
});

describe('request board: the Daily Special', () => {
  it('starts at level 6, one a day, and waits (only one pending) if you skip days', () => {
    const s = farmAt(5, 25);
    refreshBoard(s, content, T0, TZ);
    expect(s.board.orders.some(isSpecial)).toBe(false);
    s.level = 6;
    refreshBoard(s, content, T0 + 60, TZ);
    expect(s.board.orders.filter(isSpecial)).toHaveLength(1);
    refreshBoard(s, content, T0 + 3 * 24 * H, TZ);
    expect(s.board.orders.filter(isSpecial)).toHaveLength(1);
    // finish it: the next one comes the next local day, not straight away
    const sp = s.board.orders.find(isSpecial)!;
    giveItems(s, sp.wants);
    expect(fulfilOrder(s, content, sp.id)).toMatchObject({ ok: true });
    refreshBoard(s, content, T0 + 3 * 24 * H + 60, TZ);
    expect(s.board.orders.some(isSpecial)).toBe(false);
    refreshBoard(s, content, T0 + 4 * 24 * H, TZ);
    expect(s.board.orders.filter(isSpecial)).toHaveLength(1);
  });

  it('lines go in one at a time and pay only when all are in', () => {
    const s = farmAt(12, 49);
    refreshBoard(s, content, T0, TZ);
    const sp = s.board.orders.find(isSpecial)!;
    const lines = Object.entries(sp.wants);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const coins = s.coins;
    const ribbons = s.ribbons;
    expect(handInLine(s, content, sp.id, lines[0][0])).toMatchObject({ ok: false, reason: 'missing' });
    giveItems(s, Object.fromEntries(lines));
    expect(fillableCount(s)).toBeGreaterThanOrEqual(1);
    for (const [id] of lines.slice(0, -1)) expect(handInLine(s, content, sp.id, id)).toEqual({ ok: true, paid: null });
    expect(s.coins).toBe(coins);
    expect(sp.done).toMatchObject(Object.fromEntries(lines.slice(0, -1)));
    const last = handInLine(s, content, sp.id, lines.at(-1)![0]);
    expect(last.ok && last.paid?.ok).toBe(true);
    expect(s.coins).toBe(coins + sp.coins);
    expect(s.ribbons).toBe(ribbons + b.tiers.special.ribbons);
    expect(s.board.orders.some(isSpecial)).toBe(false);
  });

  it('gives double friendship', () => {
    const s = farmAt(12, 49);
    refreshBoard(s, content, T0, TZ);
    const sp = s.board.orders.find(isSpecial)!;
    giveItems(s, sp.wants);
    const r = fulfilOrder(s, content, sp.id);
    expect(r.ok && r.friendship.points).toBe(content.economy.friendship.order * b.tiers.special.friendship_mult);
  });

  it('rotates posters and gives a keepsake the first time a written Special is done', () => {
    const s = farmAt(20, 64, ['met_bruno', 'met_rufus', 'met_pip', 'met_hazel', 'met_juniper', 'creek_open']);
    s.critters = { out: [], nextAt: 0, n: 0, seen: [], pollen: 0 };
    for (const id of ['mill', 'jam_maker', 'bakery']) grantBuilding(s, content, id);
    setFlag(s, 'mill_built');
    let last = '';
    const keepsakes: string[] = [];
    for (let d = 0; d < 30; d++) {
      refreshBoard(s, content, T0 + d * 24 * H, TZ);
      const sp = s.board.orders.find(isSpecial)!;
      expect(sp.villager).not.toBe(last);
      last = sp.villager;
      for (const id of Object.keys(sp.wants)) if (id.startsWith('sketch:')) s.critters!.seen.push(id.slice(7));
      giveItems(s, Object.fromEntries(Object.entries(sp.wants).filter(([id]) => !id.startsWith('sketch:'))));
      const r = fulfilOrder(s, content, sp.id);
      if (r.ok && r.keepsake) keepsakes.push(r.keepsake.name);
    }
    expect(keepsakes.length).toBeGreaterThanOrEqual(5);
    expect(new Set(keepsakes).size).toBe(keepsakes.length);
    expect(s.board.keepsakes!.length).toBe(keepsakes.length);
  });

  it("Hazel's generated Specials ask you to sketch a critter you haven't seen", () => {
    const s = farmAt(15, 49, ['met_hazel']);
    s.critters = { out: [], nextAt: 0, n: 0, seen: ['ladybug'], pollen: 0 };
    s.board.keepsakes = content.board.specials.filter((x) => x.villager === 'hazel').map((x) => x.id);
    let sp;
    for (let d = 0; d < 40 && !sp; d++) {
      s.board.lastSpecialBy = 'goldie';
      const o = generateSpecial(s, content, d)!;
      if (o.villager === 'hazel') sp = o;
    }
    const line = Object.keys(sp!.wants).find((id) => id.startsWith('sketch:'))!;
    expect(line).toBeTruthy();
    expect(line).not.toBe('sketch:ladybug');
    s.board.orders = [sp!];
    giveItems(s, Object.fromEntries(Object.entries(sp!.wants).filter(([id]) => id !== line)));
    expect(handInLine(s, content, sp!.id, line)).toMatchObject({ ok: false, reason: 'missing' });
    s.critters.seen.push(line.slice(7));
    for (const id of Object.keys(sp!.wants)) handInLine(s, content, sp!.id, id);
    expect(s.board.orders).toHaveLength(0);
  });

  it('honey is only asked for once you have some', () => {
    const s = farmAt(12, 49);
    const asks = () => Array.from({ length: 300 }, (_, t) => generateOrder(s, content, t, 0)!).filter((o) => o.wants.honey).length;
    expect(asks()).toBe(0);
    s.inventory.honey = 1;
    const n = asks();
    expect(n).toBeGreaterThan(0);
    expect(n / 300).toBeLessThan(0.06);
  });

  it('sizing and availability hold across levels 6–30', () => {
    for (let level = 6; level <= 30; level += 2) {
      const plots = level < 10 ? 25 : level < 15 ? 36 : level < 20 ? 49 : 64;
      const flags = level >= 19 ? ['creek_open', 'met_nell'] : [];
      const s = farmAt(level, plots, flags);
      if (level >= 7) grantBuilding(s, content, 'jam_maker');
      const crops = new Set(unlockedCrops(s, content).map((c) => c.id));
      for (let d = 0; d < 60; d++) {
        const sp = generateSpecial(s, content, d)!;
        let cropPlots = 0;
        for (const [id, n] of Object.entries(sp.wants)) {
          const c = content.cropById.get(id);
          if (c) {
            expect(crops.has(id)).toBe(true);
            expect(c.grow_s).toBeLessThanOrEqual(b.tiers.special.max_grow_s);
            cropPlots += n;
          } else if (content.goods.get(id) && !['honey', 'minnow', 'perch', 'brook_trout', 'crayfish'].includes(id)) {
            expect(['jam', 'honey_jam']).toContain(id);
          }
          if (['minnow', 'perch', 'brook_trout', 'crayfish'].includes(id)) expect(level).toBeGreaterThanOrEqual(19);
        }
        // the crop lines fit in about 30% of the field (every line asks for at least 2)
        expect(cropPlots).toBeLessThanOrEqual(Math.max(6, Math.ceil(plots * b.tiers.special.share) + 1));
        expect(sp.title).toBeTruthy();
      }
      // a Special is worth a lot more than a regular order
      const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / xs.length;
      const spV = avg(Array.from({ length: 30 }, (_, d) => generateSpecial(s, content, d)!.coins));
      const regV = avg(Array.from({ length: 60 }, (_, t) => generateOrder(s, content, t, 0)!.coins));
      expect(spV).toBeGreaterThan(regV * 2.5);
    }
  });
});
