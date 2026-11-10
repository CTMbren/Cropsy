import cropsJson from '../../content/crops.json';
import lettersJson from '../../content/letters.json';
import questsJson from '../../content/quests.json';
import villagersJson from '../../content/villagers.json';

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
}

export interface VillagerDef {
  id: string;
  name: string;
  role: string;
  color: string;
  hair: string;
}

export interface LetterDef {
  id: string;
  from: string;
  subject: string;
  body: string;
  effects?: { expand?: boolean; coins?: number };
}

export interface OrderDef {
  id: string;
  villager: string;
  wants: Record<string, number>;
  coins: number;
  xp: number;
}

export type Objective =
  | { type: 'read_mail'; id: string }
  | { type: 'clear'; obstacle: 'weeds' | 'branch' | 'rock' | 'any'; n: number }
  | { type: 'harvest'; crop: string; n: number }
  | { type: 'sell'; n: number }
  | { type: 'deliver_order'; order: OrderDef }
  | { type: 'hand_in'; items: Record<string, number>; coins?: number };

export interface Rewards {
  coins?: number;
  xp?: number;
  flags?: string[];
  mail?: { id: string; delay: 'now' | 'next_day' }[];
}

export interface QuestDef {
  id: string;
  chapter: number;
  /** A villager id, or "mail" for quests that start straight from a letter. */
  giver: string;
  title: string;
  intro?: string[];
  outro?: string[];
  objectives: Objective[];
  rewards: Rewards;
}

export interface Content {
  crops: CropDef[];
  cropById: Map<string, CropDef>;
  villagers: Map<string, VillagerDef>;
  letters: Map<string, LetterDef>;
  quests: QuestDef[];
  questById: Map<string, QuestDef>;
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

const ITEM_IDS = new Set(['wood', 'stone']);

/** Cross-checks quests against crops, villagers and letters so a typo fails the build, not the game. */
export function validateStory(quests: QuestDef[], crops: Map<string, CropDef>, villagers: Map<string, VillagerDef>, letters: Map<string, LetterDef>): void {
  const ids = new Set<string>();
  const isItem = (id: string) => crops.has(id) || ITEM_IDS.has(id);
  for (const q of quests) {
    const where = `quests.json "${q.id}"`;
    if (ids.has(q.id)) throw new Error(`${where} is duplicated`);
    ids.add(q.id);
    if (q.giver !== 'mail' && !villagers.has(q.giver)) throw new Error(`${where}: unknown giver "${q.giver}"`);
    if (!q.objectives?.length) throw new Error(`${where}: needs at least one objective`);
    for (const o of q.objectives) {
      if (o.type === 'read_mail' && !letters.has(o.id)) throw new Error(`${where}: unknown letter "${o.id}"`);
      if (o.type === 'harvest' && o.crop !== 'any' && !crops.has(o.crop)) throw new Error(`${where}: unknown crop "${o.crop}"`);
      if (o.type === 'deliver_order') {
        if (!villagers.has(o.order.villager)) throw new Error(`${where}: unknown villager "${o.order.villager}"`);
        for (const k of Object.keys(o.order.wants)) if (!crops.has(k)) throw new Error(`${where}: unknown crop "${k}"`);
      }
      if (o.type === 'hand_in') for (const k of Object.keys(o.items)) if (!isItem(k)) throw new Error(`${where}: unknown item "${k}"`);
    }
    for (const m of q.rewards.mail ?? []) if (!letters.has(m.id)) throw new Error(`${where}: reward letter "${m.id}" does not exist`);
  }
  for (const l of letters.values()) if (!villagers.has(l.from)) throw new Error(`letters.json "${l.id}": unknown sender "${l.from}"`);
}

export function loadContent(rawCrops: unknown = cropsJson): Content {
  const crops = validateCrops(rawCrops);
  const cropById = new Map(crops.map((c) => [c.id, c]));
  const villagers = new Map((villagersJson as VillagerDef[]).map((v) => [v.id, v]));
  const letters = new Map((lettersJson as LetterDef[]).map((l) => [l.id, l]));
  const quests = questsJson as QuestDef[];
  validateStory(quests, cropById, villagers, letters);
  return { crops, cropById, villagers, letters, quests, questById: new Map(quests.map((q) => [q.id, q])) };
}

export const itemName = (content: Content, id: string): string =>
  content.cropById.get(id)?.name ?? (id === 'wood' ? 'Wood' : id === 'stone' ? 'Stone' : id);
