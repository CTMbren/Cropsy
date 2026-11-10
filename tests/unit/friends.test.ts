import { describe, expect, it } from 'vitest';
import { fulfilOrder, giveItems } from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { barnCapacity, fertilize, harvest, key, newFarm, plant, setFlag, storeInBarn, upgradeSoil } from '../../src/core/farm';
import { addFriendship, chatter, giveGift, hearts } from '../../src/core/friendship';
import { grantBuilding } from '../../src/core/processing';
import { buyBarn, buyMaterial, buyTool, toolPrice } from '../../src/core/shop';

const content = loadContent();
const T0 = 1_800_000_000;
const met = () => {
  const s = newFarm(T0);
  s.obstacles = {};
  setFlag(s, 'met_goldie');
  setFlag(s, 'met_bruno');
  setFlag(s, 'met_rufus');
  return s;
};

describe('friendship', () => {
  it('one gift per villager per day; loved gifts count most', () => {
    const s = met();
    giveItems(s, { strawberry: 3, radish: 2 });
    expect(giveGift(s, content, 'goldie', 'strawberry', 10)).toMatchObject({ ok: true, taste: 'loved', points: 30 });
    expect(giveGift(s, content, 'goldie', 'strawberry', 10)).toMatchObject({ ok: false, reason: 'already' });
    expect(giveGift(s, content, 'goldie', 'radish', 11)).toMatchObject({ ok: true, taste: 'disliked', points: 2 });
    expect(giveGift(s, content, 'tobias', 'radish', 11)).toMatchObject({ ok: false });
    expect(s.inventory.strawberry).toBe(2);
  });

  it('strangers can\'t receive gifts', () => {
    const s = newFarm(T0);
    giveItems(s, { wheat: 1 });
    expect(giveGift(s, content, 'rufus', 'wheat', 1)).toMatchObject({ ok: false, reason: 'stranger' });
  });

  it('orders and quests build friendship too', () => {
    const s = met();
    s.board.orders = [{ id: 'o1', villager: 'bruno', wants: { carrot: 1 }, coins: 10, xp: 1 }];
    giveItems(s, { carrot: 1 });
    expect(fulfilOrder(s, content, 'o1')).toMatchObject({ ok: true, friendship: { villager: 'bruno', points: 20 } });
  });

  it('five hearts unlocks each villager\'s perk once', () => {
    const s = met();
    grantBuilding(s, content, 'mill');
    expect(addFriendship(s, content, 'rufus', 499).perk).toBeUndefined();
    const r = addFriendship(s, content, 'rufus', 1);
    expect(r.heartsAfter).toBe(5);
    expect(r.perk).toMatch(/mill/);
    expect(s.buildings.mill.slots).toBe(3);
    addFriendship(s, content, 'rufus', 100);
    expect(s.buildings.mill.slots).toBe(3);
    addFriendship(s, content, 'goldie', 500);
    expect(toolPrice(s, content.tools.get('saw')!)).toBe(135);
  });

  it('hearts cap at 10 and chatter changes with friendship', () => {
    const s = met();
    const shy = chatter(s, content, 'rufus', 0);
    addFriendship(s, content, 'rufus', 5000);
    expect(hearts(s, content, 'rufus')).toBe(10);
    expect(chatter(s, content, 'rufus', 0)).not.toBe(shy);
  });
});

describe('soil and fertilizer', () => {
  it('soil upgrades in order, gated by level, coins and materials', () => {
    const s = met();
    s.coins = 10000;
    expect(upgradeSoil(s, content, key(0, 0))).toMatchObject({ ok: false, reason: 'locked' });
    s.level = 15;
    expect(upgradeSoil(s, content, key(0, 0))).toMatchObject({ ok: true, tier: 1 });
    expect(upgradeSoil(s, content, key(0, 0))).toMatchObject({ ok: false, reason: 'missing' });
    giveItems(s, { stone: 2 });
    expect(upgradeSoil(s, content, key(0, 0))).toMatchObject({ ok: true, tier: 2 });
    expect(s.coins).toBe(8700);
  });

  it('better soil grows faster and survives harvests', () => {
    const s = met();
    s.level = 10;
    s.coins = 1000;
    upgradeSoil(s, content, key(0, 0));
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(s.plots[key(0, 0)].growS).toBe(108);
    harvest(s, content, key(0, 0), T0 + 108);
    expect(s.plots[key(0, 0)].soil).toBe(1);
  });

  it('fertilizer gives an extra crop from that harvest', () => {
    const s = met();
    s.level = 8;
    s.coins = 100;
    expect(buyTool(s, content, 'fertilizer', 2)).toMatchObject({ ok: true });
    expect(s.inventory.fertilizer).toBe(2);
    plant(s, content, key(0, 0), 'carrot', T0);
    expect(fertilize(s, key(0, 0), T0)).toMatchObject({ ok: true });
    expect(fertilize(s, key(0, 0), T0)).toMatchObject({ ok: false, reason: 'already' });
    expect(harvest(s, content, key(0, 0), T0 + 200)).toMatchObject({ ok: true, qty: 2 });
    expect(s.inventory.carrot).toBe(2);
  });
});

describe('barn', () => {
  it('a full barn never blocks a harvest: overflow ships at the crate price', () => {
    const s = met();
    giveItems(s, { radish: barnCapacity(s, content) - 1 });
    const coins = s.coins;
    expect(storeInBarn(s, content, 'carrot', 3)).toEqual({ stored: 1, shipped: 2, coins: 14 });
    expect(s.coins).toBe(coins + 14);
  });

  it('materials don\'t count, and Bruno builds bigger barns', () => {
    const s = met();
    giveItems(s, { wood: 500 });
    expect(storeInBarn(s, content, 'carrot', 1).stored).toBe(1);
    s.coins = 250;
    expect(buyBarn(s, content)).toMatchObject({ ok: true });
    expect(barnCapacity(s, content)).toBe(75);
  });

  it('Bruno\'s lumber yard sells wood and stone', () => {
    const s = met();
    s.coins = 150;
    expect(buyMaterial(s, content, 'wood')).toMatchObject({ ok: true });
    expect(buyMaterial(s, content, 'stone')).toMatchObject({ ok: true });
    expect(s.inventory).toMatchObject({ wood: 5, stone: 5 });
    expect(s.coins).toBe(0);
  });
});
