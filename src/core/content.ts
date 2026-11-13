import cropsJson from '../../content/crops.json';
import economyJson from '../../content/economy.json';
import lettersJson from '../../content/letters.json';
import projectsJson from '../../content/projects.json';
import questsJson from '../../content/quests.json';
import villagersJson from '../../content/villagers.json';
import chaptersJson from '../../content/chapters.json';
import fishJson from '../../content/fish.json';
import boardJson from '../../content/board.json';

export interface CropDef {
  id: string;
  name: string;
  /** Seconds from planting to ripe. */
  grow_s: number;
  seed_cost: number;
  sell: number;
  xp: number;
  unlock_level: number;
  /** Placeholder colours until real art lands. */
  color: string;
  leaf: string;
  /** Not in the seed tray, Almanac or mastery (the Mystery Sprout from Ziggy's cart). */
  hidden?: boolean;
}

export interface GoodDef {
  id: string;
  name: string;
  sell: number;
  color: string;
}

export interface RecipeDef {
  id: string;
  inputs: Record<string, number>;
  output: string;
  dur_s: number;
  xp: number;
}

export interface BuildingDef {
  id: string;
  name: string;
  /** "village" buildings come from the story (the mill); "farm" buildings are bought and stand beside the field. */
  where: 'village' | 'farm';
  unlock_level?: number;
  cost?: { coins?: number; items?: Record<string, number> };
  slots: number;
  recipes: RecipeDef[];
}

export interface ToolDef {
  id: string;
  name: string;
  unlock_level: number;
  coins: number;
  clears: string;
  description: string;
  /** Consumables (fertilizer) go to the barn instead of the tool shed. */
  consumable?: boolean;
}

export interface SoilDef {
  tier: number;
  name: string;
  level?: number;
  coins?: number;
  items?: Record<string, number>;
  /** Grow-time multiplier (0.9 = 10% faster). */
  speed: number;
  /** Chance of one extra crop per harvest. */
  bonus: number;
}

export interface BarnTier {
  capacity: number;
  coins?: number;
  items?: Record<string, number>;
}

export interface ExpansionDef {
  size: number;
  story?: boolean;
  level?: number;
  coins?: number;
  items?: Record<string, number>;
}

export interface Economy {
  goods: GoodDef[];
  materials: { id: string; name: string }[];
  buildings: BuildingDef[];
  tools: ToolDef[];
  expansions: ExpansionDef[];
  market: { min: number; max: number; featured_price: number; period_hours: number };
  slot_upgrade_ribbons: number[];
  soil: SoilDef[];
  barn: BarnTier[];
  /** Bruno sells wood and stone in bundles, so building never dead-ends on materials. */
  lumber_yard: { id: string; qty: number; coins: number }[];
  xp_curve: { base: number; mult: number; exp: number };
  improvements?: { id: string; name: string }[];
  /** Ziggy's traveling cart: visits every few days with rare seeds, materials and fertilizer. */
  merchant: {
    every_days: number;
    first_day_offset: number;
    seeds: { levels_ahead: [number, number]; price_mult: number };
    materials: { id: string; qty: number; coins: number }[];
    fertilizer: { qty: number; coins: number };
  };
  friendship: { per_heart: number; gift: { loved: number; liked: number; neutral: number; disliked: number }; order: number; quest: number; perk_hearts: number };
}

export interface ProjectDef {
  id: string;
  name: string;
  giver: string;
  stages: { label: string; items?: Record<string, number>; coins?: number }[];
}

export interface VillagerDef {
  id: string;
  name: string;
  /** What the HUD calls them (defaults to the first word of the name). */
  short?: string;
  role: string;
  color: string;
  hair: string;
  loves?: string[];
  likes?: string[];
  dislikes?: string[];
  /** What reaching 5 hearts gives you. */
  perk?: string;
  /** Idle chatter by heart band: 0–2, 3–5, 6–8, 9–10. */
  lines?: string[][];
  /** Short scenes that unlock at a heart level. */
  events?: { hearts: number; title: string; lines: string[] }[];
}

export interface LetterDef {
  id: string;
  from: string;
  subject: string;
  body: string;
  effects?: { expand?: boolean; coins?: number; flags?: string[]; decor?: string };
}

export interface OrderDef {
  id: string;
  villager: string;
  wants: Record<string, number>;
  coins: number;
  xp: number;
  ribbons?: number;
}

export type ObstacleKind = 'weeds' | 'branch' | 'rock' | 'stump' | 'boulder';

export type Objective =
  | { type: 'read_mail'; id: string }
  | { type: 'clear'; obstacle: ObstacleKind | 'any'; n: number }
  | { type: 'harvest'; crop: string; n: number }
  | { type: 'sell'; n: number }
  | { type: 'deliver_order'; order: OrderDef }
  | { type: 'hand_in'; items: Record<string, number>; coins?: number }
  | { type: 'project'; id: string; n: number }
  | { type: 'merchant_buy'; n: number }
  /** Grow n different crops (counts crops already discovered). */
  | { type: 'discover'; n: number }
  /** Harvest any one crop n times (counts the best crop's total). */
  | { type: 'mastery'; n: number }
  /** Catch fish (one species, or any). */
  | { type: 'fish'; fish: string; n: number }
  /** Different species in the Creek Journal. */
  | { type: 'fish_species'; n: number };

export interface ChapterDef {
  n: number;
  title: string;
  blurb: string;
}

export interface Rewards {
  coins?: number;
  xp?: number;
  ribbons?: number;
  flags?: string[];
  mail?: { id: string; delay: 'now' | 'next_day' }[];
  /** Places new obstacles on empty plots (e.g. the stumps Rufus mentions). */
  spawn?: Partial<Record<ObstacleKind, number>>;
}

export interface QuestDef {
  id: string;
  chapter: number;
  /** A villager id, or "mail" for quests that start straight from a letter. */
  giver: string;
  title: string;
  min_level?: number;
  requires_flag?: string;
  intro?: string[];
  outro?: string[];
  objectives: Objective[];
  rewards: Rewards;
}

export type OrderTier = 'easy' | 'medium' | 'special';

/** Request board tuning and writing (content/board.json). */
export interface BoardDef {
  tick_hours: number;
  slots: number;
  first_posts: number;
  special_level: number;
  tiers: {
    easy: { weight: number; mult: number; share: number };
    medium: { weight: number; mult: number; share: number; max_grow_s: number };
    special: { mult: number; share: number; max_grow_s: number; ribbons: number; friendship_mult: number };
  };
  /** Chance a poster asks for something they love or like (when they can). */
  poster_pick: number;
  /** How often Tobias's letters take a Special's turn, relative to one villager. */
  tobias_weight: number;
  posters: Record<string, { notes: string[]; titles: string[] }>;
  specials: { id: string; villager: string; title: string; note: string; items: string[]; keepsake: { name: string; text: string } }[];
}

export interface Content {
  board: BoardDef;
  crops: CropDef[];
  cropById: Map<string, CropDef>;
  goods: Map<string, GoodDef>;
  economy: Economy;
  buildings: Map<string, BuildingDef>;
  tools: Map<string, ToolDef>;
  projects: Map<string, ProjectDef>;
  villagers: Map<string, VillagerDef>;
  letters: Map<string, LetterDef>;
  quests: QuestDef[];
  questById: Map<string, QuestDef>;
  chapters: ChapterDef[];
}

/** Throws with a readable message if the crop data is malformed. */
export function validateCrops(raw: unknown): CropDef[] {
  if (!Array.isArray(raw)) throw new Error('crops.json must be an array');
  const seen = new Set<string>();
  return raw.map((c, i) => {
    const where = `crops.json[${i}]`;
    if (typeof c !== 'object' || c === null) throw new Error(`${where} is not an object`);
    const o = c as Record<string, unknown>;
    for (const k of ['id', 'name', 'color', 'leaf']) {
      if (typeof o[k] !== 'string' || !o[k]) throw new Error(`${where}.${k} must be a non-empty string`);
    }
    for (const k of ['grow_s', 'seed_cost', 'sell', 'xp', 'unlock_level']) {
      if (typeof o[k] !== 'number' || !Number.isFinite(o[k] as number) || (o[k] as number) < 0) {
        throw new Error(`${where}.${k} must be a non-negative number`);
      }
    }
    if ((o.grow_s as number) <= 0) throw new Error(`${where}.grow_s must be > 0`);
    if (seen.has(o.id as string)) throw new Error(`${where}.id "${o.id}" is duplicated`);
    seen.add(o.id as string);
    return o as unknown as CropDef;
  });
}

const OBSTACLE_KINDS = new Set(['weeds', 'branch', 'rock', 'stump', 'boulder', 'any']);

/** Cross-checks story and economy data so a typo fails the build, not the game. */
export function validateStory(c: Omit<Content, 'questById'>): void {
  const isItem = (id: string) => c.cropById.has(id) || c.goods.has(id) || c.economy.materials.some((m) => m.id === id);
  const ids = new Set<string>();
  for (const b of c.buildings.values()) {
    for (const r of b.recipes) {
      if (!c.goods.has(r.output)) throw new Error(`economy.json building "${b.id}": unknown output "${r.output}"`);
      for (const k of Object.keys(r.inputs)) if (!isItem(k)) throw new Error(`economy.json building "${b.id}": unknown input "${k}"`);
    }
  }
  for (const p of c.projects.values()) {
    for (const st of p.stages) for (const k of Object.keys(st.items ?? {})) if (!isItem(k)) throw new Error(`projects.json "${p.id}": unknown item "${k}"`);
  }
  for (const q of c.quests) {
    const where = `quests.json "${q.id}"`;
    if (ids.has(q.id)) throw new Error(`${where} is duplicated`);
    ids.add(q.id);
    if (q.giver !== 'mail' && !c.villagers.has(q.giver)) throw new Error(`${where}: unknown giver "${q.giver}"`);
    if (!q.objectives?.length) throw new Error(`${where}: needs at least one objective`);
    for (const o of q.objectives) {
      if (o.type === 'read_mail' && !c.letters.has(o.id)) throw new Error(`${where}: unknown letter "${o.id}"`);
      if (o.type === 'harvest' && o.crop !== 'any' && !c.cropById.has(o.crop)) throw new Error(`${where}: unknown crop "${o.crop}"`);
      if (o.type === 'clear' && !OBSTACLE_KINDS.has(o.obstacle)) throw new Error(`${where}: unknown obstacle "${o.obstacle}"`);
      if (o.type === 'project' && !c.projects.has(o.id)) throw new Error(`${where}: unknown project "${o.id}"`);
      if (o.type === 'deliver_order') {
        if (!c.villagers.has(o.order.villager)) throw new Error(`${where}: unknown villager "${o.order.villager}"`);
        for (const k of Object.keys(o.order.wants)) if (!isItem(k)) throw new Error(`${where}: unknown item "${k}"`);
      }
      if (o.type === 'hand_in') for (const k of Object.keys(o.items)) if (!isItem(k)) throw new Error(`${where}: unknown item "${k}"`);
    }
    for (const m of q.rewards.mail ?? []) if (!c.letters.has(m.id)) throw new Error(`${where}: reward letter "${m.id}" does not exist`);
    for (const k of Object.keys(q.rewards.spawn ?? {})) if (!OBSTACLE_KINDS.has(k)) throw new Error(`${where}: cannot spawn "${k}"`);
  }
  const seenSp = new Set<string>();
  for (const [id, p] of Object.entries(c.board.posters)) {
    if (!c.villagers.has(id)) throw new Error(`board.json poster "${id}": unknown villager`);
    if (!p.notes.length || !p.titles.length) throw new Error(`board.json poster "${id}": needs notes and titles`);
  }
  for (const sp of c.board.specials) {
    const where = `board.json special "${sp.id}"`;
    if (seenSp.has(sp.id)) throw new Error(`${where} is duplicated`);
    seenSp.add(sp.id);
    if (!c.board.posters[sp.villager]) throw new Error(`${where}: "${sp.villager}" is not a poster`);
    if (sp.items.length !== 3) throw new Error(`${where}: needs exactly 3 items`);
    for (const k of sp.items) {
      if (!isItem(k)) throw new Error(`${where}: unknown item "${k}"`);
      const crop = c.cropById.get(k);
      if (crop && crop.grow_s > c.board.tiers.special.max_grow_s) throw new Error(`${where}: ${k} grows too slowly for a Special`);
    }
  }
  for (const q of c.quests) if (!c.chapters.some((ch) => ch.n === q.chapter)) throw new Error(`quests.json "${q.id}": chapter ${q.chapter} has no entry in chapters.json`);
  for (const l of c.letters.values()) if (!c.villagers.has(l.from)) throw new Error(`letters.json "${l.id}": unknown sender "${l.from}"`);
  for (const v of c.villagers.values()) {
    for (const id of [...(v.loves ?? []), ...(v.likes ?? []), ...(v.dislikes ?? [])]) if (!isItem(id)) throw new Error(`villagers.json "${v.id}": unknown gift item "${id}"`);
    for (const e of v.events ?? []) if (!e.lines?.length || e.hearts < 1 || e.hearts > 10) throw new Error(`villagers.json "${v.id}": bad heart event "${e.title}"`);
    if (v.lines && v.lines.length !== 4) throw new Error(`villagers.json "${v.id}": lines needs 4 heart bands`);
  }
}

export function loadContent(rawCrops: unknown = cropsJson): Content {
  const crops = validateCrops(rawCrops);
  const economy = economyJson as unknown as Economy;
  const quests = questsJson as unknown as QuestDef[];
  const blooms = ((economy as unknown as { mystery?: { blooms: GoodDef[] } }).mystery?.blooms ?? []).map(({ id, name, sell, color }) => ({ id, name, sell, color }));
  const c = {
    board: boardJson as BoardDef,
    // hidden crops (the Mystery Sprout) can grow on a plot but never show in lists
    crops: crops.filter((x) => !x.hidden),
    cropById: new Map(crops.map((x) => [x.id, x])),
    // fish and mystery blooms are goods too: they sell at the crate and can be gifted or handed in
    goods: new Map([...economy.goods, ...(fishJson as GoodDef[]).map(({ id, name, sell, color }) => ({ id, name, sell, color })), ...blooms].map((g) => [g.id, g])),
    economy,
    buildings: new Map(economy.buildings.map((b) => [b.id, b as BuildingDef])),
    tools: new Map(economy.tools.map((t) => [t.id, t])),
    projects: new Map((projectsJson as unknown as ProjectDef[]).map((p) => [p.id, p])),
    villagers: new Map((villagersJson as VillagerDef[]).map((v) => [v.id, v])),
    letters: new Map((lettersJson as LetterDef[]).map((l) => [l.id, l])),
    quests,
    chapters: chaptersJson as ChapterDef[],
  };
  validateStory(c);
  return { ...c, questById: new Map(quests.map((q) => [q.id, q])) };
}

export const shortName = (v: VillagerDef | undefined) => v?.short ?? v?.name.split(' ')[0] ?? '';

export function itemName(content: Content, id: string): string {
  return content.cropById.get(id)?.name ?? content.goods.get(id)?.name ?? content.economy.materials.find((m) => m.id === id)?.name ?? id;
}

/** Base value of any sellable item (crops and goods); materials are not sellable. */
export function itemValue(content: Content, id: string): number | null {
  return content.cropById.get(id)?.sell ?? content.goods.get(id)?.sell ?? null;
}
