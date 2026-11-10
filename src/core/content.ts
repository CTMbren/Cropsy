import cropsJson from '../../content/crops.json';

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

export interface Content {
  crops: CropDef[];
  cropById: Map<string, CropDef>;
}

/** Throws with a readable message if the content data is malformed. */
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

export function loadContent(rawCrops: unknown = cropsJson): Content {
  const crops = validateCrops(rawCrops);
  return { crops, cropById: new Map(crops.map((c) => [c.id, c])) };
}
