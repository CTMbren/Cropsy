import { describe, expect, it } from 'vitest';
import { generateOrders, giveItems } from '../../src/core/board';
import { loadContent } from '../../src/core/content';
import { clearObstacle, expand, key, newFarm, setFlag, spawnObstacles } from '../../src/core/farm';
import { buyBuilding, collect, grantBuilding, queueView, startRecipe, upgradeSlots } from '../../src/core/processing';
import { buyExpansion, buyTool, deliverStage, featuredCrop, marketPrice, marketSell, nextExpansion, priceFactor } from '../../src/core/shop';

const content = loadContent();
const T0 = 1_800_000_000;

describe('crops and levels', () => {
  it('has 15 crops reaching level 27, grow times rising with unlock level', () => {
    expect(content.crops).toHaveLength(15);
    expect(content.crops.at(-1)!.unlock_level).toBe(27);
    for (let i = 1; i < content.crops.length; i++) expect(content.crops[i].grow_s).toBeGreaterThanOrEqual(content.crops[i - 1].grow_s);
  });

  it('long crops earn less per plot-hour but never fall below a floor', () => {
    for (const c of content.crops.filter((x) => x.grow_s >= 14400)) {
      const perHour = (c.sell - c.seed_cost) / (c.grow_s / 3600);
      expect(perHour).toBeGreaterThanOrEqual(20);
    }
  });
});

describe('processing buildings', () => {
  it('queues recipes back to back and keeps working while closed', () => {
    const s = newFarm(T0);
    grantBuilding(s, content, 'mill');
    giveItems(s, { wheat: 7 });
    expect(startRecipe(s, content, 'mill', 'flour', T0)).toMatchObject({ ok: true });
    expect(startRecipe(s, content, 'mill', 'flour', T0)).toMatchObject({ ok: true, item: { startsAt: T0 + 300 } });
    expect(startRecipe(s, content, 'mill', 'flour', T0)).toMatchObject({ ok: false, reason: 'full' });
    expect(s.inventory.wheat).toBe(1);
    expect(queueView(s.buildings.mill, T0 + 100).map((q) => q.status)).toEqual(['working', 'waiting']);
    expect(collect(s, content, 'mill', T0 + 400).items).toEqual({ flour: 1 });
    expect(collect(s, content, 'mill', T0 + 86400).items).toEqual({ flour: 1 });
    expect(s.inventory.flour).toBe(2);
  });

  it('refuses without inputs and upgrades slots with Ribbons', () => {
    const s = newFarm(T0);
    grantBuilding(s, content, 'mill');
    expect(startRecipe(s, content, 'mill', 'flour', T0)).toMatchObject({ ok: false, reason: 'missing' });
    expect(upgradeSlots(s, content, 'mill')).toBe(false);
    s.ribbons = 2;
    expect(upgradeSlots(s, content, 'mill')).toBe(true);
    expect(s.buildings.mill.slots).toBe(3);
    expect(s.ribbons).toBe(0);
  });

  it('farm buildings are bought at their level with coins and materials', () => {
    const s = newFarm(T0);
    s.coins = 5000;
    expect(buyBuilding(s, content, 'jam_maker')).toBe(false); // level 6 needed
    s.level = 6;
    expect(buyBuilding(s, content, 'jam_maker')).toBe(true);
    expect(s.coins).toBe(4400);
    s.level = 10;
    expect(buyBuilding(s, content, 'bakery')).toBe(false); // needs wood and stone
    giveItems(s, { wood: 20, stone: 10 });
    expect(buyBuilding(s, content, 'bakery')).toBe(true);
    expect(buyBuilding(s, content, 'mill')).toBe(false); // the mill only comes from the story
  });
});

describe('tools, obstacles and land', () => {
  it('stumps need a saw; boulders need a pickaxe and sometimes give gold', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    const [k] = spawnObstacles(s, 'stump', 1);
    expect(clearObstacle(s, k)).toMatchObject({ ok: false, reason: 'need-tool' });
    s.coins = 1000;
    s.level = 5;
    expect(buyTool(s, content, 'saw')).toMatchObject({ ok: true });
    expect(clearObstacle(s, k)).toMatchObject({ ok: true, item: 'wood', qty: 2 });
    expect(buyTool(s, content, 'pickaxe')).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('bigger fields bring stumps and boulders', () => {
    const s = newFarm(T0);
    expand(s);
    expand(s);
    expect(Object.values(s.obstacles)).toContain('stump');
    expand(s);
    expect(Object.values(s.obstacles)).toContain('boulder');
  });

  it('Bruno sells expansions after the story one, gated by level, coins and materials', () => {
    const s = newFarm(T0);
    expect(nextExpansion(s, content)?.story).toBe(true);
    expect(buyExpansion(s, content)).toMatchObject({ ok: false });
    expand(s); // the gate (story)
    expect(nextExpansion(s, content)?.size).toBe(6);
    s.level = 6;
    s.coins = 400;
    expect(buyExpansion(s, content)).toMatchObject({ ok: false, reason: 'missing' });
    giveItems(s, { wood: 6, stone: 4 });
    expect(buyExpansion(s, content)).toMatchObject({ ok: true });
    expect(s.width).toBe(6);
    expect(s.coins).toBe(0);
  });

  it('spawned obstacles never land on growing crops', () => {
    const s = newFarm(T0);
    s.obstacles = {};
    for (const k of Object.keys(s.plots)) s.plots[k] = { crop: 'radish', plantedAt: T0, growS: 30 };
    s.plots[key(0, 0)] = { crop: null, plantedAt: 0, growS: 0 };
    expect(spawnObstacles(s, 'stump', 3)).toEqual([key(0, 0)]);
  });
});

describe('market stall', () => {
  it('prices sit between 0.8× and 1.4× (featured crop ×1.5) and stay fixed all day', () => {
    const s = newFarm(T0);
    s.level = 10;
    for (let day = 100; day < 130; day++) {
      for (const c of content.crops.slice(0, 7)) {
        const f = priceFactor(s, content, c.id, day);
        const featured = featuredCrop(s, content, day) === c.id;
        expect(f).toBeGreaterThanOrEqual(featured ? 1.2 : 0.8);
        expect(f).toBeLessThanOrEqual(featured ? 2.1 : 1.4);
        expect(priceFactor(s, content, c.id, day)).toBe(f);
      }
    }
  });

  it('opens at level 5 and sells crops and goods', () => {
    const s = newFarm(T0);
    giveItems(s, { carrot: 2, flour: 1 });
    expect(marketSell(s, content, 'carrot', 2, 100)).toBe(0);
    s.level = 5;
    const p = marketPrice(s, content, 'carrot', 100);
    expect(marketSell(s, content, 'carrot', 2, 100)).toBe(p * 2);
    expect(marketSell(s, content, 'flour', 1, 100)).toBeGreaterThan(100);
  });
});

describe('restoration projects', () => {
  it('stages are delivered in order and only once the project is open', () => {
    const s = newFarm(T0);
    giveItems(s, { wood: 18, stone: 8, wheat: 15 });
    s.coins = 300;
    expect(deliverStage(s, content, 'mill')).toMatchObject({ ok: false, reason: 'locked' });
    setFlag(s, 'mill_project');
    expect(deliverStage(s, content, 'mill')).toMatchObject({ ok: true, stage: 1, finished: false });
    expect(deliverStage(s, content, 'mill')).toMatchObject({ ok: true, stage: 2 });
    expect(deliverStage(s, content, 'mill')).toMatchObject({ ok: true, stage: 3, finished: true });
    expect(deliverStage(s, content, 'mill')).toMatchObject({ ok: false, reason: 'finished' });
    expect(s.coins).toBe(0);
  });
});

describe('orders with goods', () => {
  it('ask for goods only once you can make them, and only from villagers you have met', () => {
    const s = newFarm(T0);
    s.level = 10;
    const before = Array.from({ length: 40 }, (_, d) => generateOrders(s, content, d)).flat();
    expect(before.every((o) => Object.keys(o.wants).every((id) => content.cropById.has(id)))).toBe(true);
    expect(before.every((o) => o.villager === 'goldie')).toBe(true);
    grantBuilding(s, content, 'mill');
    setFlag(s, 'mill_built');
    setFlag(s, 'met_bruno');
    const after = Array.from({ length: 40 }, (_, d) => generateOrders(s, content, d)).flat();
    expect(after.some((o) => o.wants.flour)).toBe(true);
    expect(after.some((o) => o.villager === 'bruno')).toBe(true);
  });
});
