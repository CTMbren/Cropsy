import type { Content, CropDef, ObstacleKind, OrderDef, OrderTier } from './content';
import { addXp } from './progression';
import type { TimeState } from './time';

export const SAVE_VERSION = 4;

export type { ObstacleKind };

export interface PlotState {
  crop: string | null;
  plantedAt: number;
  /** Snapshotted at planting so a later rebalance never changes crops already in the ground. */
  growS: number;
  /** Soil tier 0–3 (permanent upgrade). */
  soil?: number;
  /** Fertilizer doubles this harvest. */
  fertilized?: boolean;
}

export interface FriendState {
  points: number;
  /** Local day of the last gift (one gift per villager per day). */
  giftDay: number;
}

export type QuestStatus = 'offered' | 'active' | 'ready';

export interface StoryState {
  done: string[];
  active: { id: string; status: QuestStatus; progress: number[] } | null;
}

export interface MailState {
  id: string;
  arrivesAt: number;
  read: boolean;
}

export interface OrderState extends OrderDef {
  /** Set for orders pinned by a story quest; they sit above the regular slots. */
  story?: string;
  /** Generated orders: easy, medium, or the Daily Special. Older saves' orders have none (shown as medium). */
  tier?: OrderTier;
  /** The poster's note, in their voice. */
  note?: string;
  /** A Special's title. */
  title?: string;
  /** Special lines already handed in (they leave `wants`). */
  done?: Record<string, number>;
  /** The written Special this is (it gives a keepsake the first time). */
  special?: string;
}

export interface BoardState {
  /** Local day of the last refresh (kept for older saves). */
  day: number;
  orders: OrderState[];
  /** The last 2-hour tick that posted. Only moves forward, so a clock rollback posts nothing. */
  tick?: number;
  /** Local day the last Daily Special was posted. */
  specialDay?: number;
  /** Who posted the last Special (the next one goes to someone else). */
  lastSpecialBy?: string;
  /** Written Specials finished (each gives a keepsake once). */
  keepsakes?: string[];
}

export interface QueueItem {
  recipe: string;
  /** When this item starts processing; items run one after another per building. */
  startsAt: number;
  durS: number;
}

export interface BuildingState {
  slots: number;
  queue: QueueItem[];
}

export interface FarmState {
  version: number;
  coins: number;
  /** Earned-only special currency (never sold for money). */
  ribbons: number;
  xp: number;
  level: number;
  width: number;
  height: number;
  /** Keyed "x,y". Every usable cell has a plot; obstacles sit on top of plots until cleared. */
  plots: Record<string, PlotState>;
  obstacles: Record<string, ObstacleKind>;
  /** Crops and materials (wood, stone). */
  inventory: Record<string, number>;
  /** Last crop planted per plot, for Replant All. */
  lastCrop: Record<string, string>;
  expansions: number;
  tools: string[];
  buildings: Record<string, BuildingState>;
  /** Stages delivered per restoration project. */
  projects: Record<string, number>;
  /** Crops harvested at least once (first harvest of each earns a Ribbon). */
  seen: string[];
  flags: string[];
  story: StoryState;
  mail: MailState[];
  board: BoardState;
  settings: {
    muted: boolean;
    music: boolean;
    /** Text size multiplier: 1, 1.15 or 1.3. */
    textScale?: number;
    /** 0–1, default 1 (sound effects) and 0.5 (music). */
    sfxVolume?: number;
    musicVolume?: number;
    /** 'system' follows the iPhone's Reduce Motion setting. */
    motion?: 'system' | 'reduced' | 'full';
    /** 30 fps and no idle animation on the farm. */
    batterySaver?: boolean;
    /** Dragging across plots plants/harvests each one (on by default). */
    dragActions?: boolean;
  };
  villagers: Record<string, FriendState>;
  /** Barn upgrade tier (index into economy.barn). */
  barnLevel: number;
  /** Ziggy's cart: the visit (local day) and which of its slots you've bought from. */
  /** Placed decorations by spot, and ones waiting in storage. */
  decor?: Record<string, string>;
  decorStore?: Record<string, number>;
  /** Daily gift calendar: gifts claimed so far and the local day of the last one. */
  calendar?: { claimed: number; lastDay: number };
  /** When the player last copied a backup code, and when we last reminded them. */
  backup?: { lastAt?: number; nudgedAt?: number };
  /** Bramblewick's town level (late-game ladder; each level raises sell prices). */
  townLevel?: number;
  /** This week's town project and trophies earned so far. */
  town?: { week: number; done: boolean; trophies: number; project?: import('./town').TownProject };
  /** Meadow Visitors: critters on the farm, the arrival clock, species sketched, pollen toward honey. */
  critters?: import('./critters').CritterState;
  /** Creek Dock fishing (Chapter 6); created when the creek opens. */
  fishing?: import('./fishing').FishingState;
  /** Land being cleared by Bruno's crew: one plot at a time. */
  clearing?: { cell: string; kind: 'stump' | 'boulder'; endsAt: number };
  /** Moss's digs today. */
  moss?: { day: number; digs: number };
  /** Harvests per crop, for Crop Mastery. */
  harvests?: Record<string, number>;
  /** Bonus chosen at each mastery level, per crop. */
  masteryPicks?: Record<string, MasteryPick[]>;
  merchant?: { day: number; bought: number[]; stock?: import('./merchant').MerchantSlot[] };
  /** Local-only event log for playtests (capped). */
  log: { t: number; e: string }[];
  time: TimeState;
  lastSeen: number;
}

export type Stage = 'empty' | 'seed' | 'sprout' | 'growing' | 'ripe';

export const key = (x: number, y: number) => `${x},${y}`;
export const parseKey = (k: string): [number, number] => k.split(',').map(Number) as [number, number];

/** Tobias's overgrown farm: most of the 4×4 field starts under weeds, branches and rocks. */
const START_OBSTACLES: Record<string, ObstacleKind> = {
  '0,0': 'weeds',
  '2,0': 'branch',
  '3,0': 'weeds',
  '2,1': 'weeds',
  '3,1': 'rock',
  '0,2': 'branch',
  '1,2': 'weeds',
  '3,2': 'branch',
  '0,3': 'rock',
  '1,3': 'weeds',
  '2,3': 'rock',
  '3,3': 'branch',
};
const EXPANSION_PATTERN: ObstacleKind[] = ['weeds', 'rock', 'branch', 'weeds', 'rock', 'weeds', 'branch', 'rock', 'weeds', 'weeds', 'branch'];
/** Bigger fields hide tougher obstacles: stumps from 6×6, boulders from 7×7. */
function patternFor(size: number): ObstacleKind[] {
  const p = [...EXPANSION_PATTERN];
  if (size >= 6) p.splice(2, 0, 'stump', 'stump');
  if (size >= 7) p.splice(5, 0, 'boulder', 'stump', 'boulder');
  return p;
}

export const emptyPlot = (soil = 0): PlotState => ({ crop: null, plantedAt: 0, growS: 0, soil });

export function newFarm(now: number): FarmState {
  const width = 4;
  const height = 4;
  const plots: Record<string, PlotState> = {};
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) plots[key(x, y)] = emptyPlot();
  return {
    version: SAVE_VERSION,
    coins: 30,
    ribbons: 0,
    xp: 0,
    level: 1,
    width,
    height,
    plots,
    obstacles: { ...START_OBSTACLES },
    inventory: {},
    lastCrop: {},
    expansions: 0,
    tools: [],
    buildings: {},
    projects: {},
    seen: [],
    flags: [],
    story: { done: [], active: null },
    mail: [],
    board: { day: -1, orders: [] },
    settings: { muted: false, music: true },
    villagers: {},
    barnLevel: 0,
    log: [],
    time: { maxSeenTime: now, debugOffset: 0 },
    lastSeen: now,
  };
}

export const hasFlag = (s: FarmState, f: string) => s.flags.includes(f);
export function setFlag(s: FarmState, f: string): void {
  if (!s.flags.includes(f)) s.flags.push(f);
}

export function log(s: FarmState, now: number, e: string): void {
  s.log.push({ t: now, e });
  if (s.log.length > 200) s.log.splice(0, s.log.length - 200);
}

export function addItem(s: FarmState, id: string, n: number): void {
  s.inventory[id] = (s.inventory[id] ?? 0) + n;
  if (s.inventory[id] <= 0) delete s.inventory[id];
}

export function hasItems(s: FarmState, items: Record<string, number>): boolean {
  return Object.entries(items).every(([id, n]) => (s.inventory[id] ?? 0) >= n);
}

export function takeItems(s: FarmState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(s, id, -n);
}

/** Adds XP and returns how many levels were gained. */
export function grantXp(s: FarmState, xp: number): number {
  const r = addXp(s.level, s.xp, xp);
  s.level = r.level;
  s.xp = r.xp;
  s.ribbons += r.levelsGained; // one Ribbon per level-up
  return r.levelsGained;
}

/** Fraction 0..1 of growth; 1 means ripe. */
export function progress(p: PlotState, now: number): number {
  if (!p.crop) return 0;
  return Math.min(1, Math.max(0, (now - p.plantedAt) / p.growS));
}

export function stageOf(p: PlotState, now: number): Stage {
  if (!p.crop) return 'empty';
  const f = progress(p, now);
  if (f >= 1) return 'ripe';
  if (f >= 0.6) return 'growing';
  if (f >= 0.25) return 'sprout';
  return 'seed';
}

export function remaining(p: PlotState, now: number): number {
  return p.crop ? Math.max(0, p.plantedAt + p.growS - now) : 0;
}

/** Digs up a crop that hasn't ripened yet. The crop and its seed cost are lost; the soil stays. */
export function digUp(state: FarmState, k: string, now: number): { ok: true; crop: string } | { ok: false; reason: 'none' | 'not-growing' } {
  const p = state.plots[k];
  if (!p?.crop) return { ok: false, reason: 'none' };
  if (stageOf(p, now) === 'ripe') return { ok: false, reason: 'not-growing' };
  const crop = p.crop;
  state.plots[k] = { crop: null, plantedAt: 0, growS: 0, soil: p.soil };
  return { ok: true, crop };
}

/** Seconds after planting during which a tap undoes it with a full refund. */
export const OOPS_S = 3;

/** Undo a just-planted seed: the plot is emptied and the seed cost refunded. */
export function unplant(state: FarmState, content: Content, k: string, now: number): { ok: true; crop: string; refund: number } | { ok: false } {
  const p = state.plots[k];
  if (!p?.crop || now - p.plantedAt > OOPS_S || now < p.plantedAt) return { ok: false };
  const crop = content.cropById.get(p.crop);
  const refund = crop ? seedCost(state, crop) : 0;
  state.coins += refund;
  state.plots[k] = { crop: null, plantedAt: 0, growS: 0, soil: p.soil };
  return { ok: true, crop: p.crop, refund };
}

/** Fresh Pick: harvesting within a window equal to the grow time (min 30 min, max 8 h) after ripening. */
export function freshWindow(growS: number): number {
  return Math.min(8 * 3600, Math.max(30 * 60, growS));
}

export function isFresh(p: PlotState, now: number): boolean {
  if (!p.crop) return false;
  const ripeAt = p.plantedAt + p.growS;
  return now >= ripeAt && now <= ripeAt + freshWindow(p.growS);
}

/** Crops at or below your level, plus any Ziggy sold you early. */
export function unlockedCrops(state: FarmState, content: Content): CropDef[] {
  return content.crops.filter((c) => isUnlocked(state, c));
}

/** Farm Beauty's Fresh Pick bonus (decorations): +1% per point, capped. Kept here to avoid an import cycle. */
function beautyBonus(state: FarmState, content: Content): number {
  const e = content.economy as unknown as { decorations?: { id: string; beauty: number }[]; beauty?: { tip_bonus_per_point: number; max_bonus: number } };
  if (!state.decor || !e.beauty) return 0;
  const total = Object.values(state.decor).reduce((a, id) => a + (e.decorations?.find((d) => d.id === id)?.beauty ?? 0), 0);
  return Math.min(e.beauty.max_bonus, total * e.beauty.tip_bonus_per_point);
}

// ── Crop Mastery ────────────────────────────────────────────────
/**
 * Mastery levels never end. Level n needs 75·n^1.75 harvests of that crop (rounded to 25):
 * 75, 250, 525, 850, 1250, 1725, 2250… Each level the player picks +5% coins or +5% XP for that crop.
 */
export const MASTERY_STEP = 0.05;
export type MasteryPick = 'coin' | 'xp';

export function masteryThreshold(level: number): number {
  return Math.max(25, Math.round((75 * Math.pow(level, 1.75)) / 25) * 25);
}

export function masteryLevel(state: FarmState, cropId: string): number {
  const n = state.harvests?.[cropId] ?? 0;
  let lv = 0;
  while (n >= masteryThreshold(lv + 1)) lv++;
  return lv;
}

/** Bonus choices already made for a crop. */
export const masteryPicks = (state: FarmState, cropId: string): MasteryPick[] => state.masteryPicks?.[cropId] ?? [];

/** Levels reached but not yet spent on a bonus. */
export const masteryPending = (state: FarmState, cropId: string) => Math.max(0, masteryLevel(state, cropId) - masteryPicks(state, cropId).length);

/** Crops with an unspent mastery choice. */
export const masteryToChoose = (state: FarmState) => Object.keys(state.harvests ?? {}).filter((id) => masteryPending(state, id) > 0);

export function chooseMastery(state: FarmState, cropId: string, pick: MasteryPick): boolean {
  if (masteryPending(state, cropId) <= 0) return false;
  state.masteryPicks ??= {};
  state.masteryPicks[cropId] = [...masteryPicks(state, cropId), pick];
  return true;
}

/** Multiplier on coins (crate, market, auto-ship, Fresh tip) or harvest XP for one crop. */
export function masteryMult(state: FarmState, cropId: string, kind: MasteryPick): number {
  return 1 + MASTERY_STEP * masteryPicks(state, cropId).filter((p) => p === kind).length;
}

/** Every crop harvested, all time. */
export const lifetimeHarvests = (state: FarmState) => Object.values(state.harvests ?? {}).reduce((a, n) => a + n, 0);

export function seedCost(_state: FarmState, crop: CropDef): number {
  return crop.seed_cost;
}

export const isUnlocked = (state: FarmState, crop: CropDef) => crop.unlock_level <= state.level || state.flags.includes(`early:${crop.id}`);

/** The golden scarecrow (+10%), Bramblewick's town level (+2% a level, up to +50%) and the crop's coin mastery. */
export const sellBonus = (state: FarmState, itemId?: string) => (itemId ? masteryMult(state, itemId, 'coin') : 1) * (state.flags.includes('imp:scarecrow') ? 1.1 : 1) * (1 + 0.02 * Math.min(state.townLevel ?? 0, 25));

/** Shipping crate pays 70% of an item's value (never less than 1 coin). */
export const cratePrice = (item: { sell: number }) => Math.max(1, Math.round(item.sell * 0.7));

export type Fail = { ok: false; reason: 'no-plot' | 'occupied' | 'not-ripe' | 'locked' | 'no-coins' | 'unknown-crop' | 'blocked' | 'none' | 'need-tool' };
export type ActionResult =
  | { ok: true; kind: 'planted'; crop: CropDef }
  | { ok: true; kind: 'harvested'; crop: CropDef; qty: number; shipped: number; tip: number; xp: number; fresh: boolean; levelsGained: number; firstTime: boolean; star?: number; bloom?: string; bloomNew?: boolean }
  | { ok: true; kind: 'cleared'; obstacle: ObstacleKind; item: string | null; qty: number; gold: boolean; cost: number; levelsGained: number }
  | Fail;

export const OBSTACLES: Record<ObstacleKind, { cost: number; item: string | null; qty: number; xp: number; label: string; tool?: string }> = {
  weeds: { cost: 0, item: null, qty: 0, xp: 1, label: 'Weeds' },
  branch: { cost: 0, item: 'wood', qty: 1, xp: 1, label: 'Branches' },
  rock: { cost: 5, item: 'stone', qty: 1, xp: 2, label: 'Rock' },
  stump: { cost: 0, item: 'wood', qty: 2, xp: 4, label: 'Stump', tool: 'saw' },
  boulder: { cost: 25, item: 'stone', qty: 3, xp: 8, label: 'Boulder', tool: 'pickaxe' },
};

/** Boulders sometimes hide a gold nugget (1 in 10, fixed per cell so reloading can't reroll it). */
export function boulderHasGold(k: string, expansions: number): boolean {
  let h = 2166136261;
  for (const ch of `${k}:${expansions}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % 10 === 0;
}

export function clearObstacle(state: FarmState, k: string): ActionResult {
  const kind = state.obstacles[k];
  if (!kind) return { ok: false, reason: 'none' };
  const o = OBSTACLES[kind];
  if (o.tool && !state.tools.includes(o.tool)) return { ok: false, reason: 'need-tool' };
  if (state.coins < o.cost) return { ok: false, reason: 'no-coins' };
  state.coins -= o.cost;
  delete state.obstacles[k];
  if (o.item) addItem(state, o.item, o.qty);
  const gold = kind === 'boulder' && boulderHasGold(k, state.expansions);
  if (gold) addItem(state, 'gold', 1);
  const levelsGained = grantXp(state, o.xp);
  return { ok: true, kind: 'cleared', obstacle: kind, item: o.item, qty: o.qty, gold, cost: o.cost, levelsGained };
}

/** Places obstacles on empty, unplanted plots (used by story quests). Returns the cells used. */
export function spawnObstacles(state: FarmState, kind: ObstacleKind, n: number): string[] {
  const free = Object.keys(state.plots)
    .filter((k) => !state.plots[k].crop && !state.obstacles[k])
    .sort((a, b) => {
      const [ax, ay] = parseKey(a);
      const [bx, by] = parseKey(b);
      return bx + by - (ax + ay); // nearest the front edge first
    })
    .slice(0, n);
  for (const k of free) state.obstacles[k] = kind;
  return free;
}

// ── Mystery seeds (Ziggy's cart) ───────────────────────────────
export const MYSTERY = 'mystery';
export const MYSTERY_SEED = 'mystery_seed';

export interface MysteryConfig {
  grow_s: [number, number];
  coins_base: number;
  coins_per_level: number;
  xp_base: number;
  xp_per_level: number;
  blooms: { id: string; name: string; weight: number; sell: number; beauty: number; color: string; note: string }[];
}
export const mysteryCfg = (content: Content) => (content.economy as unknown as { mystery: MysteryConfig }).mystery;
export const mysteryPrice = (content: Content, level: number) => mysteryCfg(content).coins_base + mysteryCfg(content).coins_per_level * level;
export const mysteryXp = (content: Content, level: number) => mysteryCfg(content).xp_base + mysteryCfg(content).xp_per_level * level;

/** Which bloom a planted mystery seed becomes: fixed when planted, so it can't be re-rolled by reloading. */
export function mysteryBloom(content: Content, k: string, plantedAt: number) {
  const blooms = mysteryCfg(content).blooms;
  let x = luck(`bloom:${k}:${plantedAt}`) * blooms.reduce((a, b) => a + b.weight, 0);
  for (const b of blooms) {
    x -= b.weight;
    if (x < 0) return b;
  }
  return blooms[blooms.length - 1];
}

/** Plants a mystery seed from the barn: 12–16 hours, no soil or greenhouse speed-up. */
function plantMystery(state: FarmState, content: Content, k: string, now: number): ActionResult {
  const crop = content.cropById.get(MYSTERY)!;
  if ((state.inventory[MYSTERY_SEED] ?? 0) < 1) return { ok: false, reason: 'none' };
  addItem(state, MYSTERY_SEED, -1);
  const [lo, hi] = mysteryCfg(content).grow_s;
  const soil = state.plots[k].soil ?? 0;
  state.plots[k] = { crop: MYSTERY, plantedAt: now, growS: Math.round(lo + luck(`grow:${k}:${now}`) * (hi - lo)), soil };
  return { ok: true, kind: 'planted', crop };
}

export function plant(state: FarmState, content: Content, k: string, cropId: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (state.obstacles[k]) return { ok: false, reason: 'blocked' };
  if (plot.crop) return { ok: false, reason: 'occupied' };
  if (cropId === MYSTERY) return plantMystery(state, content, k, now);
  const crop = content.cropById.get(cropId);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  if (!isUnlocked(state, crop)) return { ok: false, reason: 'locked' };
  const cost = seedCost(state, crop);
  if (state.coins < cost) return { ok: false, reason: 'no-coins' };
  state.coins -= cost;
  const soil = plot.soil ?? 0;
  const speed = content.economy.soil[soil]?.speed ?? 1;
  const greenhouse = state.flags.includes('imp:greenhouse') ? 0.9 : 1;
  state.plots[k] = { crop: crop.id, plantedAt: now, growS: Math.max(1, Math.round(crop.grow_s * speed * greenhouse)), soil };
  state.lastCrop[k] = crop.id;
  return { ok: true, kind: 'planted', crop };
}

/** Harvested crops go to the barn. A Fresh Pick adds a small coin tip and bonus XP. */
export function harvest(state: FarmState, content: Content, k: string, now: number): ActionResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (!plot.crop || stageOf(plot, now) !== 'ripe') return { ok: false, reason: 'not-ripe' };
  const crop = content.cropById.get(plot.crop);
  if (!crop) return { ok: false, reason: 'unknown-crop' };
  if (crop.id === MYSTERY) {
    // a mystery seed blooms into one rare flower and a big helping of XP; no tips, mastery or doubling
    const bloom = mysteryBloom(content, k, plot.plantedAt);
    const xp = mysteryXp(content, state.level);
    const stored = storeInBarn(state, content, bloom.id, 1);
    const firstTime = !state.seen.includes(bloom.id);
    if (firstTime) state.seen.push(bloom.id);
    const levelsGained = grantXp(state, xp);
    state.plots[k] = emptyPlot(plot.soil ?? 0);
    return { ok: true, kind: 'harvested', crop, qty: 1, shipped: stored.shipped, tip: stored.coins, xp, fresh: false, levelsGained, firstTime: false, bloom: bloom.id, bloomNew: firstTime };
  }
  const fresh = isFresh(plot, now);
  const coinMult = masteryMult(state, crop.id, 'coin');
  const tip = fresh ? Math.max(1, Math.round(crop.sell * 0.2 * (1 + beautyBonus(state, content)) * coinMult)) : 0;
  const level = masteryLevel(state, crop.id);
  // Hazel's 5-heart perk: +10% harvest XP
  const xp = Math.round(crop.xp * (fresh ? 1.5 : 1) * (state.flags.includes('perk:hazel') ? 1.1 : 1) * masteryMult(state, crop.id, 'xp'));
  state.coins += tip;
  const soil = plot.soil ?? 0;
  const bonusChance = content.economy.soil[soil]?.bonus ?? 0;
  const qty = 1 + (plot.fertilized ? 1 : 0) + (bonusChance > 0 && luck(`${k}:${plot.plantedAt}`) < bonusChance ? 1 : 0);
  state.harvests ??= {};
  state.harvests[crop.id] = (state.harvests[crop.id] ?? 0) + 1;
  const star = masteryLevel(state, crop.id) > level ? level + 1 : undefined;
  if (star) state.ribbons += 1;
  const stored = storeInBarn(state, content, crop.id, qty);
  const firstTime = !state.seen.includes(crop.id);
  if (firstTime) {
    state.seen.push(crop.id);
    state.ribbons += 1;
  }
  const levelsGained = grantXp(state, xp);
  state.plots[k] = emptyPlot(soil);
  return { ok: true, kind: 'harvested', crop, qty, shipped: stored.shipped, tip: tip + stored.coins, xp, fresh, levelsGained, firstTime, star };
}

/** Plants each empty plot with the crop it last grew, as far as coins allow. Returns plots planted. */
export function replantAll(state: FarmState, content: Content, now: number): string[] {
  const planted: string[] = [];
  for (const [k, cropId] of Object.entries(state.lastCrop)) {
    const r = plant(state, content, k, cropId, now);
    if (r.ok) planted.push(k);
  }
  return planted;
}

/** Sells crops at the shipping crate. Returns coins earned (0 if nothing sold). */
export function sell(state: FarmState, content: Content, itemId: string, n: number): number {
  const item = content.cropById.get(itemId) ?? content.goods.get(itemId);
  const have = state.inventory[itemId] ?? 0;
  const qty = Math.min(n, have);
  if (!item || qty <= 0) return 0;
  const coins = Math.round(cratePrice(item) * qty * sellBonus(state, itemId));
  addItem(state, itemId, -qty);
  state.coins += coins;
  return coins;
}

/** Bruno's work: grows the field by one row and column, with fresh obstacles on the new cells. */
export function expand(state: FarmState): string[] {
  const w = state.width + 1;
  const h = state.height + 1;
  const added: string[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = key(x, y);
      if (state.plots[k]) continue;
      state.plots[k] = emptyPlot();
      added.push(k);
    }
  }
  const pattern = patternFor(w);
  added.forEach((k, i) => {
    if (i % 4 !== 3) state.obstacles[k] = pattern[(i + state.expansions * 3) % pattern.length];
  });
  state.width = w;
  state.height = h;
  state.expansions += 1;
  return added;
}

export interface AwaySummary {
  awaySeconds: number;
  ripe: { crop: string; count: number }[];
  newMail: number;
  /** New requests posted on the board while you were away. */
  newOrders: number;
  /** Meadow visitors that arrived while you were away, and pollen the jar banked. */
  visitors?: number;
  jar?: number;
}

/** What changed while the player was away — shown on return instead of push notifications. */
export function awaySummary(state: FarmState, content: Content, now: number, newOrders = 0, meadow: { visitors: number; jar: number } = { visitors: 0, jar: 0 }): AwaySummary {
  const counts = new Map<string, number>();
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const ripeAt = p.plantedAt + p.growS;
    if (ripeAt > state.lastSeen && ripeAt <= now) counts.set(p.crop, (counts.get(p.crop) ?? 0) + 1);
  }
  const newMail = state.mail.filter((m) => !m.read && m.arrivesAt > state.lastSeen && m.arrivesAt <= now).length;
  return {
    awaySeconds: Math.max(0, now - state.lastSeen),
    ripe: [...counts].map(([id, count]) => ({ crop: content.cropById.get(id)?.name ?? id, count })),
    newMail,
    newOrders,
    visitors: meadow.visitors,
    jar: meadow.jar,
  };
}

export function nextReady(state: FarmState, now: number): number | null {
  let best: number | null = null;
  for (const p of Object.values(state.plots)) {
    if (!p.crop) continue;
    const r = remaining(p, now);
    if (r > 0 && (best === null || r < best)) best = r;
  }
  return best;
}

/** Deterministic 0..1 roll from a string, so bonus crops can't be re-rolled by reloading. */
export function luck(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// ── Barn capacity ──────────────────────────────────────────────

/** Crops and goods count against the barn; materials and fertilizer don't. */
export function barnUsed(state: FarmState, content: Content): number {
  let n = 0;
  for (const [id, q] of Object.entries(state.inventory)) if (content.cropById.has(id) || content.goods.has(id)) n += q;
  return n;
}

export function barnCapacity(state: FarmState, content: Content): number {
  return content.economy.barn[state.barnLevel]?.capacity ?? content.economy.barn[content.economy.barn.length - 1].capacity;
}

/**
 * Puts crops or goods in the barn. A full barn never blocks a harvest: anything that doesn't fit
 * goes straight to the shipping crate at the crate price.
 */
export function storeInBarn(state: FarmState, content: Content, id: string, n: number): { stored: number; shipped: number; coins: number } {
  const space = Math.max(0, barnCapacity(state, content) - barnUsed(state, content));
  const stored = Math.min(space, n);
  const shipped = n - stored;
  if (stored) addItem(state, id, stored);
  const item = content.cropById.get(id) ?? content.goods.get(id);
  const coins = shipped && item ? Math.round(cratePrice(item) * shipped * sellBonus(state, id)) : 0;
  state.coins += coins;
  return { stored, shipped, coins };
}

// ── Soil and fertilizer ─────────────────────────────────────────

export type SoilResult = { ok: true; tier: number } | { ok: false; reason: 'max' | 'locked' | 'no-coins' | 'missing' | 'blocked' | 'no-plot' };

export function upgradeSoil(state: FarmState, content: Content, k: string): SoilResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (state.obstacles[k]) return { ok: false, reason: 'blocked' };
  const next = content.economy.soil[(plot.soil ?? 0) + 1];
  if (!next) return { ok: false, reason: 'max' };
  if ((next.level ?? 1) > state.level) return { ok: false, reason: 'locked' };
  if (state.coins < (next.coins ?? 0)) return { ok: false, reason: 'no-coins' };
  if (!hasItems(state, next.items ?? {})) return { ok: false, reason: 'missing' };
  state.coins -= next.coins ?? 0;
  takeItems(state, next.items ?? {});
  plot.soil = next.tier;
  return { ok: true, tier: next.tier };
}

export type FertilizeResult = { ok: true } | { ok: false; reason: 'none' | 'empty' | 'ripe' | 'already' | 'no-plot' | 'mystery' };

/** Uses one fertilizer on a growing crop: that harvest gives an extra crop. */
export function fertilize(state: FarmState, k: string, now: number): FertilizeResult {
  const plot = state.plots[k];
  if (!plot) return { ok: false, reason: 'no-plot' };
  if (!plot.crop) return { ok: false, reason: 'empty' };
  if (plot.crop === MYSTERY) return { ok: false, reason: 'mystery' };
  if (plot.fertilized) return { ok: false, reason: 'already' };
  if (stageOf(plot, now) === 'ripe') return { ok: false, reason: 'ripe' };
  if ((state.inventory.fertilizer ?? 0) < 1) return { ok: false, reason: 'none' };
  addItem(state, 'fertilizer', -1);
  plot.fertilized = true;
  return { ok: true };
}
