/**
 * Economy simulator: plays a casual player through the real game logic (src/core) and reports how
 * long each level, chapter and purchase takes. Run with `npm run sim`.
 *
 * The player: one 30-minute first session (a look every 2 minutes), then checks in 4 times a day (8:00, 12:30, 18:00, 22:00).
 * At each check-in they read mail, talk to visitors, harvest, collect buildings, fill orders, sell
 * what they don't need, clear what they can afford, buy upgrades, and plant the most profitable
 * crop that will be ready by their next check-in.
 */
import { fulfilOrder, refreshBoard } from '../src/core/board';
import { loadContent, type Content } from '../src/core/content';
import { barnCapacity, barnUsed, upgradeSoil, clearObstacle, harvest, newFarm, OBSTACLES, plant, sell, stageOf, unlockedCrops, type FarmState } from '../src/core/farm';
import { buyBuilding, collect, startRecipe } from '../src/core/processing';
import { buyBarn, buyMaterial, buyTool, deliverStage, nextBarn } from '../src/core/shop';
import { clearCost, landOpen, plotCap, plotCount, startClearing, syncLand, touchesField, wildCells } from '../src/core/land';
import { buyFromMerchant, merchantStock } from '../src/core/merchant';
import { buildImprovement, deliverTownProject, hasImprovement, improvements, nextTownLevel, raiseTownLevel, syncTownProject, townProjectOpen } from '../src/core/town';
import { buyDecor, decorDefs } from '../src/core/decor';
import { activeQuest, advance, inbox, onEvent, readMail, talk } from '../src/core/story';
import { dayIndex } from '../src/core/time';

const TZ = 0;
const T0 = Date.UTC(2027, 0, 4, 9, 0, 0) / 1000; // a Monday, 9:00

export interface SimResult {
  levelAt: Record<number, number>; // level → hours since start
  events: { h: number; e: string }[];
  final: FarmState;
}

function reserve(s: FarmState, c: Content): Record<string, number> {
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
  for (const o of s.board.orders) want(o.wants);
  if (townProjectOpen(s, c)) want(nextTownLevel(s, c).wants);
  if (s.town?.project && !s.town.done) want(s.town.project.wants);
  // recipe inputs for buildings we own
  for (const id of Object.keys(s.buildings)) for (const r of c.buildings.get(id)?.recipes ?? []) want(Object.fromEntries(Object.entries(r.inputs).map(([k, n]) => [k, n * 2])));
  return keep;
}

function checkIn(s: FarmState, c: Content, now: number, nextAt: number, log: (e: string) => void): void {
  const ev = (e: Parameters<typeof onEvent>[2]) => onEvent(s, c, e, now, TZ);
  advance(s, c, now, TZ);
  for (const m of inbox(s, now).filter((x) => !x.read)) readMail(s, c, m.id, now, TZ);
  refreshBoard(s, c, now, TZ);
  // collect and restart buildings
  for (const id of Object.keys(s.buildings)) {
    collect(s, c, id, now);
    for (const r of c.buildings.get(id)!.recipes) {
      // don't bake away what the current quest asks for (e.g. Pip's flour)
      const handIn: Record<string, number> = {};
      for (const o of activeQuest(s, c)?.objectives ?? []) if (o.type === 'hand_in') Object.assign(handIn, o.items);
      for (const p of c.projects.values()) {
        const st = p.stages[s.projects[p.id] ?? 0];
        if (st && s.flags.includes(`${p.id}_project`)) for (const [k, n] of Object.entries(st.items ?? {})) handIn[k] = Math.max(handIn[k] ?? 0, n);
      }
      const spare = () => Object.entries(r.inputs).every(([k, n]) => (s.inventory[k] ?? 0) - n >= (handIn[k] ?? 0));
      while (spare() && startRecipe(s, c, id, r.id, now).ok);
    }
  }
  // harvest
  for (const k of Object.keys(s.plots)) {
    const p = s.plots[k];
    if (p.crop && stageOf(p, now) === 'ripe') {
      const r = harvest(s, c, k, now);
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
  for (const o of [...s.board.orders]) {
    if (fulfilOrder(s, c, o.id).ok) ev({ type: 'order_done', id: o.id });
  }
  talk(s, c, now, TZ);
  // sell surplus
  const keep = reserve(s, c);
  let sold = 0;
  for (const id of Object.keys(s.inventory)) {
    if (!c.cropById.has(id) && !c.goods.has(id)) continue;
    const extra = (s.inventory[id] ?? 0) - (keep[id] ?? 0);
    if (extra > 0) {
      sell(s, c, id, extra);
      sold += extra;
    }
  }
  if (sold) ev({ type: 'sell', n: sold });
  talk(s, c, now, TZ);
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
    if (s.coins > next.coins * 2 && raiseTownLevel(s, c).ok) log(`town level ${next.level}`);
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
  const b = nextBarn(s, c);
  if (b && barnUsed(s, c) > barnCapacity(s, c) * 0.7 && s.coins > (b.coins ?? 0) + 300 && buyBarn(s, c).ok) log(`barn ${barnCapacity(s, c)}`);
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
  const fits = crops.filter((x) => x.grow_s <= gap);
  const pick = (fits.length ? fits : crops.slice(0, 1)).reduce((a, x) => (x.sell - x.seed_cost > a.sell - a.seed_cost ? x : a));
  const growing: Record<string, number> = {};
  for (const p of Object.values(s.plots)) if (p.crop) growing[p.crop] = (growing[p.crop] ?? 0) + 1;
  const need = Object.entries(reserve(s, c))
    .filter(([id]) => crops.some((x) => x.id === id))
    .map(([id, n]) => [id, Math.max(0, n - (s.inventory[id] ?? 0) - (growing[id] ?? 0))] as const)
    .filter(([, n]) => n > 0);
  // quests that ask for a harvest of one crop (Hazel's golden melon)
  const aq = s.story.active;
  activeQuest(s, c)?.objectives.forEach((o, i) => {
    if (o.type === 'harvest' && o.crop !== 'any' && !growing[o.crop]) need.push([o.crop, Math.max(0, o.n - (aq?.progress[i] ?? 0))]);
  });
  // Hazel wants new species: plant one of each crop not yet discovered
  if (activeQuest(s, c)?.objectives.some((o) => o.type === 'discover')) for (const x of crops) if (!s.seen.includes(x.id) && !growing[x.id]) need.push([x.id, 1]);
  for (const k of Object.keys(s.plots)) {
    if (s.plots[k].crop || s.obstacles[k]) continue;
    const want = need.find(([, n]) => n > 0);
    if (want) {
      if (plant(s, c, k, want[0], now).ok) need.splice(need.indexOf(want), 1, [want[0], want[1] - 1]);
      continue;
    }
    plant(s, c, k, pick.id, now);
  }
  advance(s, c, now, TZ);
}

export function simulate(days = 42): SimResult {
  const c = loadContent();
  const s = newFarm(T0);
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
  return { levelAt, events, final: s };
}

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h.toFixed(1)} h`;
  return `day ${Math.floor(h / 24) + 1}`;
}
