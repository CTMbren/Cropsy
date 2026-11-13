/**
 * Economy simulator: plays a casual player through the real game logic (src/core) and reports how
 * long each level, chapter and purchase takes. Run with `npm run sim`.
 *
 * The player: one 30-minute first session (a look every 2 minutes), then checks in 4 times a day (8:00, 12:30, 18:00, 22:00).
 * At each check-in they read mail, talk to visitors, tap critters, fish every waiting bite, harvest, collect buildings, fill orders, sell
 * what they don't need, clear what they can afford, buy upgrades, and plant the most profitable
 * crop that will be ready by their next check-in.
 */
import { fulfilOrder, handInLine, isSketch, isSpecial, lineReady, refreshBoard, type FulfilResult } from '../src/core/board';
import { loadContent, type Content } from '../src/core/content';
import { barnCapacity, barnUsed, chooseMastery, clearObstacle, coinStep, cratePrice, growTimeFor, harvest, masteryOptions, masteryPending, masteryPicks, masteryToChoose, newFarm, OBSTACLES, plant, redoMastery, redoReady, seedCost, sell, stageOf, unlockedCrops, upgradeSoil, type FarmState, type MasteryPick } from '../src/core/farm';
import { syncAlmanac } from '../src/core/almanac';
import { dayIndex as day0 } from '../src/core/time';
import { pendingEvents, watchEvent } from '../src/core/friendship';
import { sideQuestOrderDone, syncLoomLetter, syncRecipeCards, syncSideQuest } from '../src/core/crafting';
import { buyBuilding, buyUpgrade, collect, recipeOpen, startRecipe } from '../src/core/processing';
import { marketOpen, marketSell, priceFactor } from '../src/core/shop';
import { marketPeriod } from '../src/core/time';
import { buyBarn, buyMaterial, buyTool, deliverStage, nextBarn } from '../src/core/shop';
import { clearCost, landOpen, plotCap, plotCount, startClearing, syncLand, touchesField, wildCells } from '../src/core/land';
import { buyFromMerchant, merchantStock } from '../src/core/merchant';
import { buildImprovement, deliverTownProject, hasImprovement, improvements, nextTownLevel, raiseTownLevel, syncTownProject, townProjectOpen } from '../src/core/town';
import { buyDecor, decorDefs } from '../src/core/decor';
import { activeQuest, advance, inbox, onEvent, readMail, talk } from '../src/core/story';
import { dayIndex, rng } from '../src/core/time';
import { syncCritters, tapCritter } from '../src/core/critters';
import { catchFish, rollFish, syncBites } from '../src/core/fishing';

const TZ = 0;
const T0 = Date.UTC(2027, 0, 4, 9, 0, 0) / 1000; // a Monday, 9:00

export interface BoardStats {
  filled: Record<string, number>;
  orderCoins: number;
  crateCoins: number;
  ribbons: number;
  /** Specials posted, and how many were finished within 24 h of going up. */
  specials: number;
  specialsIn24h: number;
  /** Most plots the board's crops ever asked for at once, as a share of the field. */
  peakPlotShare: number;
  /** Mastery picks made, by track. */
  picks: Record<string, number>;
  /** Crops auto-shipped because the barn was full. */
  overflow: number;
  /** Coins from selling at Pip's market. */
  marketCoins: number;
}

export interface SimResult {
  levelAt: Record<number, number>; // level → hours since start
  events: { h: number; e: string }[];
  final: FarmState;
  board: BoardStats;
}

const newStats = (): BoardStats => ({ filled: {}, orderCoins: 0, crateCoins: 0, ribbons: 0, specials: 0, specialsIn24h: 0, peakPlotShare: 0, picks: {}, overflow: 0, marketCoins: 0 });
let stats = newStats();
const specialSeen = new Map<string, number>();

function paid(r: FulfilResult, now: number): void {
  if (!r.ok) return;
  const tier = r.order.story ? 'story' : (r.order.tier ?? 'medium');
  stats.filled[tier] = (stats.filled[tier] ?? 0) + 1;
  stats.orderCoins += r.coins;
  stats.ribbons += r.order.ribbons ?? 0;
  const at = specialSeen.get(r.order.id);
  if (at !== undefined && now - at <= 24 * 3600) stats.specialsIn24h++;
  if (at !== undefined && process.env.SIM_DEBUG) console.log(`  filled after ${((now - at) / 3600).toFixed(0)} h`);
}

/** What to keep: the story always; by default also the town, recipe inputs and board orders. */
function reserve(s: FarmState, c: Content, withOrders = true, extras = true): Record<string, number> {
  const keep: Record<string, number> = {};
  const want = (items: Record<string, number>) => {
    for (const [id, n] of Object.entries(items)) keep[id] = Math.max(keep[id] ?? 0, n);
  };
  const q = activeQuest(s, c);
  for (const o of q?.objectives ?? []) {
    if (o.type === 'hand_in') want(o.items);
    if (o.type === 'deliver_order') want(o.order.wants);
  }
  for (const p of c.projects.values()) {
    const st = p.stages[s.projects[p.id] ?? 0];
    if (st && s.flags.includes(`${p.id}_project`)) want(st.items ?? {});
  }
  // the next story quest's hand-in (e.g. Rufus's wheat) before it's offered
  const next = c.quests.find((x) => !s.story.done.includes(x.id) && x.id !== q?.id);
  for (const o of next?.objectives ?? []) if (o.type === 'hand_in') want(o.items);
  if (extras && townProjectOpen(s, c)) want(nextTownLevel(s, c).wants);
  if (extras && s.town?.project && !s.town.done) want(s.town.project.wants);
  // recipe inputs for buildings we own
  // (each building's first recipe, the everyday one: a player doesn't stock up for every recipe at
  // once; goods the story or board want pull in their own inputs below)
  if (extras)
    for (const id of Object.keys(s.buildings)) {
      const first = (c.buildings.get(id)?.recipes ?? []).filter((r) => recipeOpen(s, r)).sort((a, b) => (c.goods.get(b.output)?.sell ?? 0) - (c.goods.get(a.output)?.sell ?? 0))[0];
      if (first) want(Object.fromEntries(Object.entries(first.inputs).map(([k, n]) => [k, n * 2])));
    }
  // goods the story asks for need their inputs grown too (Rufus's flour → wheat)
  for (const [id, n] of Object.entries({ ...keep })) {
    const src = c.goods.has(id) ? [...c.buildings.values()].flatMap((b) => b.recipes).find((r) => r.output === id) : undefined;
    for (const [k, m] of Object.entries(src?.inputs ?? {})) keep[k] = Math.max(keep[k] ?? 0, m * Math.max(1, n - (s.inventory[id] ?? 0)));
  }
  // board orders come on top of everything else (so planting grows enough for both), and goods
  // the board wants that we're short of need their inputs too (pastry → flour and jam → wheat)
  if (withOrders) {
    const add: Record<string, number> = {};
    for (const o of s.board.orders) for (const [id, n] of Object.entries(o.wants)) add[id] = (add[id] ?? 0) + n;
    for (let depth = 0; depth < 2; depth++) {
      for (const [id, n] of Object.entries({ ...add })) {
        if (!c.goods.has(id)) continue;
        const queued = Object.values(s.buildings).reduce((a, b) => a + b.queue.filter((q) => q.recipe === id).length, 0);
        const short = Math.min(n, (keep[id] ?? 0) + n - (s.inventory[id] ?? 0) - queued);
        if (short <= 0) continue;
        for (const b of c.buildings.values()) {
          const r = s.buildings[b.id] && b.recipes.find((x) => x.output === id);
          if (r) for (const [k, q] of Object.entries(r.inputs)) add[k] = (add[k] ?? 0) + q * short;
        }
        add[id] = 0; // expanded once
        keep[id] = (keep[id] ?? 0) + n;
      }
    }
    for (const [id, n] of Object.entries(add)) keep[id] = (keep[id] ?? 0) + n;
  }
  return keep;
}

/**
 * How the simulated player spends mastery stars. 'none' leaves them unspent (the pre-Nov-13 sim);
 * 'value' takes the pick worth the most coins per harvest; 'speed', 'bounty' or 'thrift' take that
 * track first until it caps (speed is the pacing worst case, bounty the barn's), then 'value'. Both use the weekly re-do once, when the Almanac opens.
 */
export type MasteryStrategy = 'none' | 'value' | 'speed' | 'bounty' | 'thrift';
let strategy: MasteryStrategy = 'value';

/**
 * Where the simulated player sells spare crops. 'crate' ships everything (the old sim); 'market'
 * sells at Pip's market once it's open, holding a crop for a better price while the barn has room.
 */
export type Seller = 'crate' | 'market';
let seller: Seller = 'crate';

function sellSpare(s: FarmState, c: Content, id: string, n: number, now: number, mustSell: boolean): number {
  if (seller === 'market' && marketOpen(s, c)) {
    const period = marketPeriod(now, TZ);
    if (!mustSell && priceFactor(s, c, id, period) < 1 && barnUsed(s, c) < barnCapacity(s, c) * 0.5) return -1;
    const coins = marketSell(s, c, id, n, period);
    stats.marketCoins += coins;
    return coins;
  }
  const coins = sell(s, c, id, n);
  stats.crateCoins += coins;
  return coins;
}

function pickValue(s: FarmState, c: Content, id: string, kind: MasteryPick): number {
  const crop = c.cropById.get(id)!;
  const crate = cratePrice(crop);
  if (strategy === kind) return Infinity;
  switch (kind) {
    case 'coin':
      return coinStep(crop.sell) * crate;
    case 'xp':
      return 0;
    case 'speed':
      return 0.05 * Math.max(0, crate - seedCost(s, crop));
    case 'bounty':
      return 0.04 * crate;
    case 'thrift':
      return 0.1 * crop.seed_cost;
  }
}

function spendStars(s: FarmState, c: Content, now: number): void {
  if (strategy === 'none') return;
  syncAlmanac(s, now, TZ);
  const day = day0(now, TZ);
  // when the Almanac opens, re-do the crop with the most early picks
  if (redoReady(s, day) && s.masteryRedo === undefined) {
    const most = Object.keys(s.masteryPicks ?? {}).sort((a, b) => masteryPicks(s, b).length - masteryPicks(s, a).length)[0];
    if (most) redoMastery(s, most, day);
  }
  for (const id of masteryToChoose(s))
    while (masteryPending(s, id) > 0) {
      const best = masteryOptions(s, id, c)
        .filter((o) => o.open)
        .sort((a, b) => pickValue(s, c, id, b.kind) - pickValue(s, c, id, a.kind))[0];
      if (!best || !chooseMastery(s, id, best.kind, c)) break;
      stats.picks[best.kind] = (stats.picks[best.kind] ?? 0) + 1;
    }
}

function checkIn(s: FarmState, c: Content, now: number, nextAt: number, log: (e: string) => void): void {
  const ev = (e: Parameters<typeof onEvent>[2]) => onEvent(s, c, e, now, TZ);
  advance(s, c, now, TZ);
  spendStars(s, c, now);
  for (const m of inbox(s, now).filter((x) => !x.read)) readMail(s, c, m.id, now, TZ);
  refreshBoard(s, c, now, TZ);
  for (const o of s.board.orders) if (isSpecial(o) && !specialSeen.has(o.id)) {
    specialSeen.set(o.id, now);
    stats.specials++;
    if (process.env.SIM_DEBUG) console.log(`SPECIAL ${((now - T0) / 86400).toFixed(1)} L${s.level} ${o.villager} ${JSON.stringify(o.wants)}`);
  }
  {
    const fieldPlots = Object.keys(s.plots).filter((k) => !s.obstacles[k]).length || 1;
    const cropAsk = s.board.orders.filter((o) => !o.story).reduce((a, o) => a + Object.entries(o.wants).reduce((m, [id, n]) => m + (c.cropById.has(id) ? n : 0), 0), 0);
    stats.peakPlotShare = Math.max(stats.peakPlotShare, cropAsk / fieldPlots);
  }
  // meadow visitors and the creek: tap every critter, land every bite (never misses, never fishes extra)
  syncCritters(s, c, now);
  for (const v of [...(s.critters?.out ?? [])]) tapCritter(s, c, v.id);
  syncBites(s, c, now);
  const roll = rng(now);
  while ((s.fishing?.bites ?? 0) > 0) {
    const r = catchFish(s, c, rollFish(s, now, TZ, roll()).id, now);
    if (!r.ok) break;
    ev({ type: 'fish', fish: r.fish.id });
  }
  // collect and restart buildings
  // what the story and the board need, including the inputs of goods we're short of (pastry → flour, jam)
  const storyNeeds = reserve(s, c, true, false);
  for (let depth = 0; depth < 2; depth++)
    for (const [k, n] of Object.entries({ ...storyNeeds })) {
      const short = n - (s.inventory[k] ?? 0);
      if (short <= 0 || !c.goods.has(k)) continue;
      const src = [...c.buildings.values()].flatMap((b) => b.recipes).find((x) => x.output === k);
      for (const [i, m] of Object.entries(src?.inputs ?? {})) storyNeeds[i] = (storyNeeds[i] ?? 0) + m * short;
    }
  // goods the story or the board is waiting for (minus what we have or are making) come first
  const goodWant: Record<string, number> = {};
  for (const [k, n] of Object.entries(storyNeeds)) if (c.goods.has(k)) goodWant[k] = n - (s.inventory[k] ?? 0);
  for (const b of Object.values(s.buildings)) for (const q of b.queue) if (goodWant[q.recipe] !== undefined) goodWant[q.recipe] -= 1;
  for (const id of Object.keys(s.buildings)) {
    collect(s, c, id, now);
    const recipes = [...c.buildings.get(id)!.recipes].filter((r) => recipeOpen(s, r)).sort((a, b) => ((goodWant[b.output] ?? 0) > 0 ? 1 : 0) - ((goodWant[a.output] ?? 0) > 0 ? 1 : 0));
    for (const r of recipes) {
      // don't bake away what the current quest asks for (e.g. Pip's flour)
      const handIn: Record<string, number> = {};
      for (const o of activeQuest(s, c)?.objectives ?? []) if (o.type === 'hand_in') Object.assign(handIn, o.items);
      for (const p of c.projects.values()) {
        const st = p.stages[s.projects[p.id] ?? 0];
        if (st && s.flags.includes(`${p.id}_project`)) for (const [k, n] of Object.entries(st.items ?? {})) handIn[k] = Math.max(handIn[k] ?? 0, n);
      }
      // and a recipe nobody's asked for never uses up a good an order is waiting for (flour for flour orders)
      if ((goodWant[r.output] ?? 0) <= 0) for (const [k, n] of Object.entries(storyNeeds)) handIn[k] = Math.max(handIn[k] ?? 0, n);
      const spare = () => Object.entries(r.inputs).every(([k, n]) => (s.inventory[k] ?? 0) - n >= (handIn[k] ?? 0));
      while (spare() && startRecipe(s, c, id, r.id, now).ok);
    }
  }
  // harvest
  for (const k of Object.keys(s.plots)) {
    const p = s.plots[k];
    if (p.crop && stageOf(p, now) === 'ripe') {
      const r = harvest(s, c, k, now);
      if (r.ok && r.kind === 'harvested') stats.overflow += r.shipped;
      if (r.ok && r.kind === 'harvested') ev({ type: 'harvest', crop: r.crop.id });
    }
  }
  // story
  for (let i = 0; i < 4; i++) {
    const r = talk(s, c, now, TZ);
    if (r.kind === 'outro') log(`quest done: ${r.quest.id}`);
    if (r.kind === 'none' || r.kind === 'reminder') break;
  }
  // buy wood and stone the story and projects still need
  const mats = reserve(s, c);
  // materials for the next farm building we can unlock
  for (const bd of c.buildings.values()) if (bd.where === 'farm' && !s.buildings[bd.id] && (bd.unlock_level ?? 1) <= s.level) for (const [id, n] of Object.entries(bd.cost?.items ?? {})) mats[id] = Math.max(mats[id] ?? 0, n);
  for (const id of ['wood', 'stone']) while ((s.inventory[id] ?? 0) < (mats[id] ?? 0) && s.coins > 400 && buyMaterial(s, c, id).ok);
  for (const p of c.projects.values()) {
    const d = deliverStage(s, c, p.id);
    if (d.ok) {
      ev({ type: 'project', id: p.id, stage: d.stage });
      talk(s, c, now, TZ);
    }
  }
  // Ziggy's cart: buy the cheapest thing when the story asks
  if (activeQuest(s, c)?.objectives.some((o) => o.type === 'merchant_buy')) {
    const day = dayIndex(now, TZ);
    const stock = merchantStock(s, c, day);
    const i = stock.map((x, j) => [x.coins, j]).sort((a, b) => a[0] - b[0])[0]?.[1];
    if (i !== undefined && buyFromMerchant(s, c, i, day).ok) {
      ev({ type: 'merchant_buy' });
      log('bought from Ziggy');
      talk(s, c, now, TZ);
    }
  }
  // orders
  // (but never with what the story or a project is waiting for, e.g. the festival's pastries)
  const story = reserve(s, c, false, false);
  const spare = (id: string, n: number) => (s.inventory[id] ?? 0) - n >= (story[id] ?? 0);
  for (const o of [...s.board.orders]) {
    if (isSpecial(o)) {
      // the Special: hand in each line as soon as it can be spared
      for (const [id, n] of Object.entries(o.wants)) {
        if (isSketch(id) ? !lineReady(s, id, n) : !spare(id, n)) continue;
        const r = handInLine(s, c, o.id, id);
        if (r.ok && r.paid) {
          paid(r.paid, now);
          ev({ type: 'order_done', id: o.id });
        }
      }
      continue;
    }
    if (Object.entries(o.wants).some(([id, n]) => !spare(id, n))) continue;
    const r = fulfilOrder(s, c, o.id);
    if (r.ok) {
      paid(r, now);
      if (sideQuestOrderDone(s, c, o.id, now, TZ)) log('side quest: pickling station');
      ev({ type: 'order_done', id: o.id });
    }
  }
  talk(s, c, now, TZ);
  // heart moments (and the recipe cards that come with them), the side quest, the loom letter
  for (const e of pendingEvents(s, c)) watchEvent(s, c, e.villager, e.hearts);
  for (const id of syncRecipeCards(s, c, now, TZ)) log(`recipe card ${id}`);
  syncSideQuest(s, now, TZ);
  syncLoomLetter(s, c, now, TZ);
  // sell surplus
  const keep = reserve(s, c);
  let sold = 0;
  for (const id of Object.keys(s.inventory)) {
    if (!c.cropById.has(id) && !c.goods.has(id)) continue;
    const extra = (s.inventory[id] ?? 0) - (keep[id] ?? 0);
    if (extra > 0 && sellSpare(s, c, id, extra, now, false) >= 0) sold += extra;
  }
  // a barn that's nearly full sells everything the story isn't waiting for (orders included),
  // the way a player clears space so the field can be harvested
  const barnWasFull = barnUsed(s, c) > barnCapacity(s, c) * 0.9;
  if (barnWasFull) {
    const story = reserve(s, c, false, false);
    // (but not what the Daily Special is waiting for)
    for (const o of s.board.orders) if (isSpecial(o)) for (const [id, n] of Object.entries(o.wants)) story[id] = (story[id] ?? 0) + n;
    for (const id of Object.keys(s.inventory)) {
      if (!c.cropById.has(id) && !c.goods.has(id)) continue;
      const extra = (s.inventory[id] ?? 0) - (story[id] ?? 0);
      if (extra > 0) {
        sellSpare(s, c, id, extra, now, true);
        sold += extra;
      }
    }
  }
  if (sold) ev({ type: 'sell', n: sold });
  talk(s, c, now, TZ);
  // a bigger barn comes before anything grand: a full barn sells what the story needs
  const b = nextBarn(s, c);
  if (b && (barnWasFull || barnUsed(s, c) > barnCapacity(s, c) * 0.7) && s.coins > (b.coins ?? 0) + 300) {
    for (const [id, n] of Object.entries(b.items ?? {})) while ((s.inventory[id] ?? 0) < n && s.coins > (b.coins ?? 0) + 300 && buyMaterial(s, c, id).ok);
    if (buyBarn(s, c).ok) log(`barn ${barnCapacity(s, c)}`);
  }
  // a second line for buildings, once comfortably affordable
  for (const id of Object.keys(s.buildings)) {
    const u = c.buildings.get(id)?.upgrade;
    if (!u || (s.buildings[id].lines ?? 1) >= 2 || s.level < u.level || s.coins < u.coins * 1.5) continue;
    for (const [k, n] of Object.entries(u.items ?? {})) while ((s.inventory[k] ?? 0) < n && s.coins > u.coins * 1.2 && buyMaterial(s, c, k).ok);
    if (buyUpgrade(s, c, id).ok) log(`upgrade ${id}`);
  }
  // the weekly town project, Bramblewick improvements and the odd decoration
  const day = dayIndex(now, TZ);
  if (townProjectOpen(s, c)) {
    syncTownProject(s, c, day);
    if (deliverTownProject(s, c, day).ok) log('town project');
  }
  for (const d of improvements(c)) {
    if (hasImprovement(s, d.id) || d.level > s.level || s.coins < d.coins * 1.2) continue;
    for (const [id, n] of Object.entries(d.items ?? {})) if (id !== 'gold') while ((s.inventory[id] ?? 0) < n && buyMaterial(s, c, id).ok);
    if (buildImprovement(s, c, d.id).ok) log(`improved: ${d.id}`);
  }
  // grow the town when there's plenty in the bank (keeps a cushion for everything else)
  if (townProjectOpen(s, c)) {
    const next = nextTownLevel(s, c);
    // (only with crops to spare: never with what the story or the board is waiting for)
    const busy = reserve(s, c, true, false);
    const spareForTown = Object.entries(next.wants).every(([id, n]) => (s.inventory[id] ?? 0) - n >= (busy[id] ?? 0));
    if (spareForTown && s.coins > next.coins * 2 && raiseTownLevel(s, c).ok) log(`town level ${next.level}`);
  }
  for (const d of decorDefs(c)) if (!d.story && d.level <= s.level && s.coins > d.coins * 4 && (s.decorStore?.[d.id] ?? 0) + Object.values(s.decor ?? {}).filter((x) => x === d.id).length < 2) buyDecor(s, c, d.id);
  // soil upgrades once there's money to spare
  for (const k of Object.keys(s.plots)) if (s.coins > 15000) for (const id of ['stone']) { while ((s.inventory[id] ?? 0) < 2 && buyMaterial(s, c, id).ok); upgradeSoil(s, c, k); }
  // tools, buildings, land, barn (keep a cushion for seeds)
  for (const t of c.tools.values()) if (!t.consumable && !s.tools.includes(t.id) && s.coins > t.coins + 100 && buyTool(s, c, t.id).ok) log(`bought ${t.id}`);
  for (const b of c.buildings.values()) if (b.where === 'farm' && s.coins > (b.cost?.coins ?? 0) + 150 && buyBuilding(s, c, b.id)) log(`built ${b.id}`);
  // land: finish the crew's job, then hire them for the next plot touching the field
  const cleared = syncLand(s, c, now);
  if (cleared) log(`cleared ${cleared.cell} (${plotCount(s)} plots)`);
  if (landOpen(s) && !s.clearing && plotCount(s) < plotCap(s, c) && s.coins > clearCost(s, c) + 150) {
    const next = wildCells(s, c).filter((k) => touchesField(s, k)).sort((a, b) => a.split(',').reduce((m, v) => m + +v, 0) - b.split(',').reduce((m, v) => m + +v, 0))[0];
    if (next && startClearing(s, c, next, now).ok) log(`clearing ${next}`);
  }

  // clear obstacles we can afford
  for (const [k, kind] of Object.entries(s.obstacles)) {
    if (s.coins < OBSTACLES[kind].cost + 30) continue;
    const r = clearObstacle(s, k);
    if (r.ok && r.kind === 'cleared') ev({ type: 'clear', obstacle: r.obstacle });
  }
  // plant: first whatever quests and orders still need, then the best profit per plot that's
  // ready by the next check-in
  const gap = nextAt - now;
  const crops = unlockedCrops(s, c);
  // grow time and seed cost after soil, greenhouse and mastery (plain soil as the yardstick)
  const fits = crops.filter((x) => growTimeFor(s, c, x, 0) <= gap);
  const profit = (x: (typeof crops)[number]) => x.sell - seedCost(s, x);
  const pick = (fits.length ? fits : crops.slice(0, 1)).reduce((a, x) => (profit(x) > profit(a) ? x : a));
  const growing: Record<string, number> = {};
  for (const p of Object.values(s.plots)) if (p.crop) growing[p.crop] = (growing[p.crop] ?? 0) + 1;
  const isCrop = (id: string) => crops.some((x) => x.id === id);
  const short = (keep: Record<string, number>, id: string) => Math.max(0, (keep[id] ?? 0) - (s.inventory[id] ?? 0) - (growing[id] ?? 0));
  const need: [string, number][] = [];
  // 1. quests that ask for a harvest of one crop (Hazel's golden melon), or new species
  const aq = s.story.active;
  activeQuest(s, c)?.objectives.forEach((o, i) => {
    if (o.type === 'harvest' && o.crop !== 'any' && !growing[o.crop]) need.push([o.crop, Math.max(0, o.n - (aq?.progress[i] ?? 0))]);
  });
  if (activeQuest(s, c)?.objectives.some((o) => o.type === 'discover')) for (const x of crops) if (!s.seen.includes(x.id) && !growing[x.id]) need.push([x.id, 1]);
  // 2. what the story, projects and our buildings need
  const storyKeep = reserve(s, c, false);
  for (const id of Object.keys(storyKeep)) if (isCrop(id) && short(storyKeep, id) > 0) need.push([id, short(storyKeep, id)]);
  // 3. the board, with at most 40% of the field
  const all = reserve(s, c);
  let budget = Math.floor(Object.keys(s.plots).filter((k) => !s.obstacles[k]).length * 0.4);
  for (const id of Object.keys(all)) {
    if (!isCrop(id) || budget <= 0) continue;
    const n = Math.min(budget, short(all, id) - short(storyKeep, id));
    if (n > 0) {
      need.push([id, n]);
      budget -= n;
    }
  }
  for (const k of Object.keys(s.plots)) {
    if (s.plots[k].crop || s.obstacles[k]) continue;
    const want = need.find(([, n]) => n > 0);
    if (want) {
      if (plant(s, c, k, want[0], now).ok) want[1]--;
      continue;
    }
    plant(s, c, k, pick.id, now);
  }
  advance(s, c, now, TZ);
}

export function simulate(days = 42, mastery: MasteryStrategy = 'value', sells: Seller = 'crate'): SimResult {
  strategy = mastery;
  seller = sells;
  const c = loadContent();
  const s = newFarm(T0);
  stats = newStats();
  specialSeen.clear();
  const events: { h: number; e: string }[] = [];
  const levelAt: Record<number, number> = { 1: 0 };
  // first session: 30 minutes, checking in every 2 minutes
  const times: number[] = [];
  for (let t = 0; t <= 1800; t += 120) times.push(T0 + t);
  const daily = [8, 12.5, 18, 22];
  for (let d = 0; d < days; d++) for (const h of daily) {
    const t = T0 - 9 * 3600 + d * 86400 + h * 3600;
    if (t > T0 + 1800) times.push(t);
  }
  times.push(times[times.length - 1] + 10 * 3600);
  for (let i = 0; i < times.length - 1; i++) {
    const now = times[i];
    const before = s.level;
    const chBefore = new Set(s.story.done);
    checkIn(s, c, now, times[i + 1], (e) => events.push({ h: (now - T0) / 3600, e }));
    for (let l = before + 1; l <= s.level; l++) levelAt[l] = (now - T0) / 3600;
    for (const q of s.story.done) if (!chBefore.has(q)) events.push({ h: (now - T0) / 3600, e: `quest ${q}` });
  }
  return { levelAt, events, final: s, board: stats };
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `day ${Math.floor(h / 24) + 1}`;
}
