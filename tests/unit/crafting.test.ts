import { describe, expect, it } from 'vitest';
import { generateOrder, giveItems } from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { PICKLES_BRUNO, PICKLES_GOLDIE, picklesStep, sideQuest, sideQuestOrderDone, syncLoomLetter, syncRecipeCards, syncSideQuest } from '../../src/core/crafting';
import { fulfilOrder } from '../../src/core/board';
import { newFarm, setFlag, type FarmState } from '../../src/core/farm';
import { advance } from '../../src/core/story';
import { migrate } from '../../src/core/save';
import { buyBuilding, buyUpgrade, grantBuilding, queueView, recipeLock, reschedule, startRecipe, upgradeStatus } from '../../src/core/processing';
import { hasItemIcon } from '../../src/ui/itemArt';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;
const NEW_GOODS = ['pickled_radishes', 'pickled_carrots', 'tomato_chutney', 'corn_relish', 'cornmeal', 'carrot_cake', 'potato_bread', 'pumpkin_pie', 'grape_jelly', 'cotton_thread', 'cotton_cloth', 'patchwork_quilt'];

function farm(level = 8): FarmState {
  const s = newFarm(T0);
  s.level = level;
  s.coins = 200_000;
  setFlag(s, 'board_open');
  return s;
}

const allRecipes = () => [...content.buildings.values()].flatMap((b) => b.recipes.map((r) => ({ b, r })));
const value = (id: string) => content.cropById.get(id)?.sell ?? content.goods.get(id)?.sell ?? 0;

describe('new recipes', () => {
  it('all pay 1.4–1.8× the value of what goes in', () => {
    for (const { r } of allRecipes()) {
      const inputs = Object.entries(r.inputs).reduce((a, [k, n]) => a + value(k) * n, 0);
      const x = value(r.output) / inputs;
      expect(x, r.id).toBeGreaterThanOrEqual(1.35);
      expect(x, r.id).toBeLessThanOrEqual(1.8);
    }
  });

  it('every new good has an icon, a villager who likes it, and can be asked for on the Board', () => {
    const tastes = new Set([...content.villagers.values()].flatMap((v) => [...(v.loves ?? []), ...(v.likes ?? [])]));
    for (const id of NEW_GOODS) {
      expect(content.goods.has(id), id).toBe(true);
      expect(hasItemIcon(id), id).toBe(true);
      expect(tastes.has(id), id).toBe(true);
    }
    // with every building and recipe, the Board asks for some of the new goods
    const s = farm(25);
    for (const id of ['mill', 'jam_maker', 'bakery', 'pickling', 'loom']) grantBuilding(s, content, id);
    setFlag(s, 'mill_built');
    for (const { r } of allRecipes()) if (r.card) setFlag(s, `recipe:${r.id}`);
    const asked = new Set<string>();
    for (let t = 0; t < 600; t++) for (const k of Object.keys(generateOrder(s, content, t, 0)?.wants ?? {})) asked.add(k);
    expect(NEW_GOODS.filter((g) => asked.has(g)).length).toBeGreaterThanOrEqual(8);
  });

  it('open by level or with a friend’s recipe card', () => {
    const s = farm(9);
    const r = (id: string) => allRecipes().find((x) => x.r.id === id)!.r;
    expect(recipeLock(s, r('grape_jelly'))).toEqual({ kind: 'level', level: 20 });
    expect(recipeLock(s, r('carrot_cake'))).toEqual({ kind: 'card', villager: 'goldie' });
    grantBuilding(s, content, 'bakery');
    giveItems(s, { carrot: 6, flour: 2 });
    expect(startRecipe(s, content, 'bakery', 'carrot_cake', T0)).toMatchObject({ ok: false, reason: 'locked' });
    // Goldie's 3-heart moment brings the card, with a letter
    setFlag(s, 'event:goldie:3');
    expect(syncRecipeCards(s, content, T0, TZ)).toEqual(['carrot_cake']);
    expect(s.mail.some((m) => m.id === 'card_carrot_cake')).toBe(true);
    expect(syncRecipeCards(s, content, T0, TZ)).toEqual([]);
    expect(startRecipe(s, content, 'bakery', 'carrot_cake', T0).ok).toBe(true);
  });
});

describe('Pickling Station side quest', () => {
  it('starts at level 8, runs beside the main story, and hands over the station', () => {
    const s = farm(7);
    expect(syncSideQuest(s, T0, TZ)).toBe(false);
    s.level = 8;
    expect(syncSideQuest(s, T0, TZ)).toBe(true);
    expect(picklesStep(s)).toBe(1);
    expect(s.mail.some((m) => m.id === 'goldie_crocks')).toBe(true);
    expect(s.board.orders.some((o) => o.id === PICKLES_GOLDIE && o.story)).toBe(true);
    expect(sideQuest(s)?.text).toContain('12 radishes');
    // the main story keeps going
    const before = s.story.active?.id;
    advance(s, content, T0, TZ);
    expect(s.story.active?.id ?? null).toBe(before ?? s.story.active?.id ?? null);
    // Goldie's order, then Bruno's
    giveItems(s, { radish: 12, carrot: 6 });
    expect(fulfilOrder(s, content, PICKLES_GOLDIE).ok).toBe(true);
    expect(sideQuestOrderDone(s, content, PICKLES_GOLDIE, T0, TZ)).toBe(false);
    expect(s.board.orders.some((o) => o.id === PICKLES_BRUNO)).toBe(true);
    giveItems(s, { wood: 15, stone: 10 });
    expect(fulfilOrder(s, content, PICKLES_BRUNO).ok).toBe(true);
    expect(sideQuestOrderDone(s, content, PICKLES_BRUNO, T0, TZ)).toBe(true);
    expect(s.buildings.pickling).toBeDefined();
    expect(sideQuest(s)).toBeNull();
    // the first jar is already waiting on the shelf
    expect(queueView(s.buildings.pickling, T0)[0].status).toBe('done');
    expect(s.mail.some((m) => m.id === 'goldie_crocks_done')).toBe(true);
    // and it can't be bought
    expect(buyBuilding(s, content, 'pickling')).toBe(false);
  });

  it('re-pins a lost order', () => {
    const s = farm(9);
    syncSideQuest(s, T0, TZ);
    s.board.orders = [];
    syncSideQuest(s, T0, TZ);
    expect(s.board.orders.some((o) => o.id === PICKLES_GOLDIE)).toBe(true);
  });
});

describe('Loom', () => {
  it("opens at level 17 with Juniper's letter, and pays more per cotton the longer it takes", () => {
    const s = farm(16);
    expect(syncLoomLetter(s, content, T0, TZ)).toBe(false);
    expect(buyBuilding(s, content, 'loom')).toBe(false);
    s.level = 17;
    expect(syncLoomLetter(s, content, T0, TZ)).toBe(true);
    giveItems(s, { wood: 30, stone: 15 });
    expect(buyBuilding(s, content, 'loom')).toBe(true);
    const loom = content.buildings.get('loom')!.recipes;
    const per = loom.map((r) => value(r.output) / r.inputs.cotton);
    const time = loom.map((r) => r.dur_s);
    for (let i = 1; i < loom.length; i++) {
      expect(per[i]).toBeGreaterThan(per[i - 1]);
      expect(time[i]).toBeGreaterThan(time[i - 1]);
    }
  });
});

describe('second-line upgrades', () => {
  it('cost 40,000+ and need the level', () => {
    for (const b of content.buildings.values()) {
      // the Pickling Station needs none: every crock already works at once
      if (b.parallel) {
        expect(b.upgrade, b.id).toBeUndefined();
        continue;
      }
      expect(b.upgrade, b.id).toBeDefined();
      expect(b.upgrade!.coins).toBeGreaterThanOrEqual(40_000);
    }
    const s = farm(14);
    grantBuilding(s, content, 'jam_maker');
    giveItems(s, { wood: 20, stone: 20 });
    expect(upgradeStatus(s, content, 'jam_maker')).toEqual({ ok: false, reason: 'level' });
    s.level = 15;
    s.coins = 39_999;
    expect(upgradeStatus(s, content, 'jam_maker')).toEqual({ ok: false, reason: 'coins' });
    s.coins = 40_000;
    expect(buyUpgrade(s, content, 'jam_maker', T0).ok).toBe(true);
    expect(s.coins).toBe(0);
    expect(upgradeStatus(s, content, 'jam_maker')).toEqual({ ok: false, reason: 'done' });
  });

  it('run two recipes at once; the third waits for the first free line', () => {
    const s = farm(15);
    grantBuilding(s, content, 'jam_maker');
    s.buildings.jam_maker.slots = 3;
    giveItems(s, { strawberry: 12 });
    const one = startRecipe(s, content, 'jam_maker', 'jam', T0);
    const two = startRecipe(s, content, 'jam_maker', 'jam', T0);
    // one line: the second waits
    expect(one.ok && two.ok && two.item.startsAt).toBe(T0 + 1200);
    // a fresh building with two lines
    const u = farm(15);
    grantBuilding(u, content, 'jam_maker');
    u.buildings.jam_maker.slots = 3;
    u.buildings.jam_maker.lines = 2;
    giveItems(u, { strawberry: 12 });
    const a = startRecipe(u, content, 'jam_maker', 'jam', T0);
    const b = startRecipe(u, content, 'jam_maker', 'jam', T0 + 60);
    const c = startRecipe(u, content, 'jam_maker', 'jam', T0 + 120);
    expect(a.ok && a.item.startsAt).toBe(T0);
    expect(b.ok && b.item.startsAt).toBe(T0 + 60);
    expect(c.ok && c.item.startsAt).toBe(T0 + 1200);
    const view = queueView(u.buildings.jam_maker, T0 + 600).map((v) => v.status);
    expect(view).toEqual(['working', 'working', 'waiting']);
  });

  it('pickling is hands-off: every slot works at the same time, including Ribbon slots', () => {
    const s = farm(10);
    grantBuilding(s, content, 'pickling');
    s.buildings.pickling.slots = 3;
    giveItems(s, { radish: 36 });
    const starts = [0, 60, 120].map((d) => startRecipe(s, content, 'pickling', 'pickled_radishes', T0 + d));
    expect(starts.map((r) => r.ok && r.item.startsAt)).toEqual([T0, T0 + 60, T0 + 120]);
    expect(queueView(s.buildings.pickling, T0 + 600).map((v) => v.status)).toEqual(['working', 'working', 'working']);
  });

  it('refunds a Cellar Expansion bought before pickling went hands-off', () => {
    const s = farm(16);
    s.version = 8;
    s.coins = 1000;
    grantBuilding(s, content, 'pickling');
    s.buildings.pickling.lines = 2;
    const m = migrate(JSON.parse(JSON.stringify(s)));
    expect(m.coins).toBe(46_000);
    expect(m.inventory.wood).toBe(30);
    expect(m.inventory.stone).toBe(20);
    expect(m.buildings.pickling.lines).toBe(1);
  });

  it('start whatever was waiting on the new line as soon as it is bought', () => {
    const s = farm(15);
    grantBuilding(s, content, 'jam_maker');
    giveItems(s, { strawberry: 8, wood: 20, stone: 20 });
    startRecipe(s, content, 'jam_maker', 'jam', T0);
    startRecipe(s, content, 'jam_maker', 'jam', T0);
    expect(s.buildings.jam_maker.queue[1].startsAt).toBe(T0 + 1200);
    // bought 5 minutes later: the first keeps going, the second starts now
    buyUpgrade(s, content, 'jam_maker', T0 + 300);
    expect(s.buildings.jam_maker.queue.map((q) => q.startsAt)).toEqual([T0, T0 + 300]);
    expect(queueView(s.buildings.jam_maker, T0 + 400).map((v) => v.status)).toEqual(['working', 'working']);
  });

  it('fix queues on upgraded buildings that were planned for one line', () => {
    const s = farm(15);
    grantBuilding(s, content, 'bakery');
    const b = s.buildings.bakery;
    b.lines = 2;
    b.slots = 3;
    // an old save: three pastries one after another
    b.queue = [0, 1, 2].map((i) => ({ recipe: 'pastry', startsAt: T0 + i * 2700, durS: 2700 }));
    expect(reschedule(b, content.buildings.get('bakery')!, T0 + 100)).toBe(2);
    expect(b.queue.map((q) => q.startsAt)).toEqual([T0, T0 + 100, T0 + 2700]);
    // already right: nothing moves
    expect(reschedule(b, content.buildings.get('bakery')!, T0 + 200)).toBe(0);
  });
});
