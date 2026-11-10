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
import { barnCapacity, barnUsed, clearObstacle, harvest, newFarm, OBSTACLES, plant, sell, stageOf, unlockedCrops, type FarmState } from '../src/core/farm';
import { buyBuilding, collect, startRecipe } from '../src/core/processing';
import { buyBarn, buyExpansion, buyMaterial, buyTool, deliverStage, nextBarn, nextExpansion } from '../src/core/shop';
import { activeQuest, advance, inbox, onEvent, readMail, talk } from '../src/core/story';

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
    for (const r of c.buildings.get(id)!.recipes) while (startRecipe(s, c, id, r.id, now).ok);
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
  // buy wood and stone the story, projects and next expansion still need
  const mats = reserve(s, c);
  const exp = nextExpansion(s, c);
  if (exp && !exp.story && (exp.level ?? 1) <= s.level) for (const [id, n] of Object.entries(exp.items ?? {})) mats[id] = Math.max(mats[id] ?? 0, n);
  for (const id of ['wood', 'stone']) while ((s.inventory[id] ?? 0) < (mats[id] ?? 0) && s.coins > 400 && buyMaterial(s, c, id).ok);
  for (const p of c.projects.values()) {
    const d = deliverStage(s, c, p.id);
    if (d.ok) {
      ev({ type: 'project', id: p.id, stage: d.stage });
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
  // tools, buildings, land, barn (keep a cushion for seeds)
  for (const t of c.tools.values()) if (!t.consumable && !s.tools.includes(t.id) && s.coins > t.coins + 100 && buyTool(s, c, t.id).ok) log(`bought ${t.id}`);
  for (const b of c.buildings.values()) if (b.where === 'farm' && s.coins > (b.cost?.coins ?? 0) + 150 && buyBuilding(s, c, b.id)) log(`built ${b.id}`);
  const e = nextExpansion(s, c);
  if (e && !e.story && s.coins > (e.coins ?? 0) + 150 && buyExpansion(s, c).ok) log(`expanded to ${s.width}x${s.height}`);
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
