import type { Content } from './content';
import { hasFlag, hasItems, setFlag, takeItems, type FarmState } from './farm';
import { fnv1a } from './save';
import { rng } from './time';

/**
 * Late-game coin sinks. Improvements are one-time purchases for Bramblewick, each with a
 * permanent perk. The weekly town project asks for crops and coins every week and pays Ribbons
 * and a trophy, so a big bank balance always has somewhere to go.
 */

export interface ImprovementDef {
  id: string;
  name: string;
  by: string;
  level: number;
  coins: number;
  items?: Record<string, number>;
  perk: string;
  blurb: string;
}

interface TownProjectDef {
  unlock_level: number;
  ribbons: number;
  coins_per_level: number;
  crops: number;
  qty_per_level: number;
}

const econ = (content: Content) => content.economy as unknown as { improvements: ImprovementDef[]; town_project: TownProjectDef };

export const improvements = (content: Content) => econ(content).improvements;
export const hasImprovement = (state: FarmState, id: string) => hasFlag(state, `imp:${id}`);

export type ImproveResult = { ok: true } | { ok: false; reason: 'unknown' | 'owned' | 'locked' | 'no-coins' | 'missing' };

export function buildImprovement(state: FarmState, content: Content, id: string): ImproveResult {
  const d = improvements(content).find((x) => x.id === id);
  if (!d) return { ok: false, reason: 'unknown' };
  if (hasImprovement(state, id)) return { ok: false, reason: 'owned' };
  if (d.level > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < d.coins) return { ok: false, reason: 'no-coins' };
  if (!hasItems(state, d.items ?? {})) return { ok: false, reason: 'missing' };
  state.coins -= d.coins;
  takeItems(state, d.items ?? {});
  setFlag(state, `imp:${id}`);
  return { ok: true };
}

// ── Weekly town project ─────────────────────────────────────────

export interface TownProject {
  week: number;
  wants: Record<string, number>;
  coins: number;
  ribbons: number;
}

export const weekOf = (day: number) => Math.floor(day / 7);
export const townProjectOpen = (state: FarmState, content: Content) => state.level >= econ(content).town_project.unlock_level;

/** This week's project: crops you can grow at your level, scaled to it, plus coins. Same all week. */
export function townProject(state: FarmState, content: Content, day: number): TownProject {
  const t = econ(content).town_project;
  const week = weekOf(day);
  // fixed when first seen this week, so levelling up mid-week doesn't move the goalposts
  if (state.town?.week === week && state.town.project) return state.town.project;
  const r = rng(parseInt(fnv1a(`town:${week}`), 16));
  const pool = content.crops.filter((c) => c.unlock_level <= state.level && c.grow_s <= 86400);
  const top = pool.slice(Math.floor(pool.length / 3));
  const wants: Record<string, number> = {};
  while (Object.keys(wants).length < Math.min(t.crops, top.length)) {
    const c = top[Math.floor(r() * top.length)];
    wants[c.id] = Math.max(5, Math.round((t.qty_per_level * state.level) / Math.max(1, c.grow_s / 3600)));
  }
  return { week, wants, coins: t.coins_per_level * state.level, ribbons: t.ribbons };
}

export function syncTownProject(state: FarmState, content: Content, day: number): void {
  if (!townProjectOpen(state, content)) return;
  const week = weekOf(day);
  if (state.town?.week !== week) state.town = { week, done: false, trophies: state.town?.trophies ?? 0, project: undefined };
  if (!state.town.project) state.town.project = townProject(state, content, day);
}

export type TownResult = { ok: true; project: TownProject } | { ok: false; reason: 'locked' | 'done' | 'missing' | 'no-coins' };

export function deliverTownProject(state: FarmState, content: Content, day: number): TownResult {
  if (!townProjectOpen(state, content)) return { ok: false, reason: 'locked' };
  syncTownProject(state, content, day);
  const town = state.town!;
  const p = town.project!;
  if (town.done) return { ok: false, reason: 'done' };
  if (!hasItems(state, p.wants)) return { ok: false, reason: 'missing' };
  if (state.coins < p.coins) return { ok: false, reason: 'no-coins' };
  takeItems(state, p.wants);
  state.coins -= p.coins;
  state.ribbons += p.ribbons;
  town.done = true;
  town.trophies += 1;
  return { ok: true, project: p };
}

// ── Town level: an open-ended ladder for the late game ──────────

/** Each town level adds 2% to everything you sell, up to level 25 (+50%). */
export const TOWN_BONUS_PER_LEVEL = 0.02;
export const TOWN_BONUS_LEVELS = 25;

export const townLevel = (state: FarmState) => state.townLevel ?? 0;

/** What the next town level costs: coins that grow 55% a level, plus a batch of one crop. */
export function nextTownLevel(state: FarmState, content: Content): { level: number; coins: number; wants: Record<string, number> } {
  const n = townLevel(state);
  const pool = content.crops.filter((c) => c.unlock_level <= Math.max(state.level, 5) && c.grow_s <= 86400);
  const r = rng(parseInt(fnv1a(`townlevel:${n}`), 16));
  const crop = pool[Math.floor(pool.length / 2 + r() * Math.ceil(pool.length / 2)) % pool.length];
  return { level: n + 1, coins: Math.round((20000 * Math.pow(1.55, n)) / 1000) * 1000, wants: { [crop.id]: 20 + 5 * n } };
}

export function raiseTownLevel(state: FarmState, content: Content): ImproveResult {
  if (!townProjectOpen(state, content)) return { ok: false, reason: 'locked' };
  const next = nextTownLevel(state, content);
  if (state.coins < next.coins) return { ok: false, reason: 'no-coins' };
  if (!hasItems(state, next.wants)) return { ok: false, reason: 'missing' };
  state.coins -= next.coins;
  takeItems(state, next.wants);
  state.townLevel = next.level;
  return { ok: true };
}
