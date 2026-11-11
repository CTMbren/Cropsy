/**
 * Pure helpers for the art pipeline: key rules, atlas page grouping and the shelf packer.
 * Used by `tools/art/pack.ts` and the unit tests; no file or image I/O here.
 */

/** One generated sprite, as recorded in `art/manifest.json`. */
export interface ManifestAsset {
  /** ArtRegistry key, e.g. `crop/radish/ripe` or `tile/grass@night`. */
  key: string;
  /** Source PNG, relative to `art/`. */
  file: string;
  /** Anchor (footprint base at the tile centre) as fractions of the source image, [x, y]. */
  pivot: [number, number];
  /** Provenance: free-form, never read by the game. */
  model?: string;
  lora?: string;
  prompt?: string;
  seed?: number;
  edits?: string[];
  checks?: Record<string, unknown>;
}

export interface Manifest {
  version: 1;
  /** Source PNGs are painted at this many pixels per logical pixel. */
  masterScale: number;
  /** Atlases ship at this many pixels per logical pixel. */
  shipScale: number;
  assets: ManifestAsset[];
}

/** What the pipeline needs to know about game content to check keys and group pages. */
export interface ArtContent {
  crops: { id: string; unlock_level: number }[];
  decor: string[];
  critters: string[];
}

export const CROP_STAGES = ['seed', 'sprout', 'growing', 'ripe'] as const;
export const OBSTACLE_KINDS = ['weeds', 'branch', 'rock', 'stump', 'boulder'];
/** Prefixes that have a fixed set of names in code rather than in content files. */
const FIXED: Record<string, RegExp> = {
  tile: /^tile\/(grass|overgrown|edge|tuft|soil\/[0-9])$/,
  fence: /^fence\/[a-z0-9_]+(\/[a-z0-9_]+)?$/,
  marker: /^marker\/(bubble(-fresh)?\/[a-z0-9_]+|fertilizer|ready|sparkle)$/,
  building: /^building\/(mill\/([0-3]|wheel)|jam_maker|bakery|smoke)$/,
  moss: /^moss\/(body|tail|bone|sleep|alert)$/,
  fx: /^fx\/[a-z0-9_]+$/,
  portrait: /^portrait\/[a-z0-9_]+\/(neutral|happy|surprised|sad)$/,
};

const SHAPE = /^[a-z][a-z0-9_-]*(\/[a-z0-9_-]+)*(@[a-z0-9_-]+)?$/;

export function splitVariant(key: string): { base: string; variant: string | null } {
  const at = key.indexOf('@');
  return at < 0 ? { base: key, variant: null } : { base: key.slice(0, at), variant: key.slice(at + 1) };
}

/** Returns a reason the key is wrong, or null when the game would actually use it. */
export function checkKey(key: string, c: ArtContent): string | null {
  if (!SHAPE.test(key)) return 'keys are lowercase words joined by "/", with an optional @variant';
  const { base } = splitVariant(key);
  const [prefix, ...rest] = base.split('/');
  switch (prefix) {
    case 'crop': {
      const [id, stage] = rest;
      if (rest.length !== 2 || !c.crops.some((x) => x.id === id)) return `unknown crop "${id}"`;
      if (!(CROP_STAGES as readonly string[]).includes(stage)) return `crop stage must be one of ${CROP_STAGES.join(', ')}`;
      return null;
    }
    case 'obstacle':
      return rest.length >= 1 && rest.length <= 2 && OBSTACLE_KINDS.includes(rest[0]) && (rest.length === 1 || rest[1] === 'b')
        ? null
        : `obstacle keys are obstacle/<${OBSTACLE_KINDS.join('|')}>[/b]`;
    case 'decor':
      if (rest[0] === 'part') return rest.length === 2 ? null : 'decor parts are decor/part/<name>';
      return rest.length === 1 && c.decor.includes(rest[0]) ? null : `unknown decoration "${rest[0]}"`;
    case 'critter':
      return rest.length === 1 && c.critters.includes(rest[0]) ? null : `unknown critter "${rest[0]}"`;
    default: {
      const re = FIXED[prefix];
      if (!re) return `unknown prefix "${prefix}"`;
      return re.test(base) ? null : `"${base}" doesn't match ${re}`;
    }
  }
}

/**
 * Which atlas page a key ships in. Pages are the unit of loading, so they follow what a player
 * needs at once: core farm art, crops by unlock tier, owned buildings, decor, critters, portraits.
 * Variants (seasons, night) get their own page so only the current one needs to be in memory.
 */
export function pageGroup(key: string, c: ArtContent): string {
  const { base, variant } = splitVariant(key);
  const [prefix, id] = base.split('/');
  let group: string;
  if (prefix === 'crop') {
    const lv = c.crops.find((x) => x.id === id)?.unlock_level ?? 1;
    group = lv <= 5 ? 'crops-1' : lv <= 10 ? 'crops-6' : 'crops-11';
  } else if (prefix === 'building') group = 'buildings';
  else if (prefix === 'decor') group = 'decor';
  else if (prefix === 'critter') group = 'critters';
  else if (prefix === 'portrait') group = 'portraits';
  else group = 'core';
  return variant ? `${group}@${variant}` : group;
}

export interface Rect {
  id: string;
  w: number;
  h: number;
}
export interface Placed extends Rect {
  x: number;
  y: number;
  bin: number;
}
export interface Bin {
  w: number;
  h: number;
}

const pow2 = (n: number) => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

/**
 * Shelf packer: tallest first, left to right, new shelf when a row is full, new bin when the page
 * is full. Bins are shrunk to the smallest power-of-two size that fits (mipmap friendly).
 */
export function packShelves(rects: Rect[], max: number, padding: number): { placed: Placed[]; bins: Bin[] } {
  const sorted = [...rects].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
  const placed: Placed[] = [];
  const bins: Bin[] = [];
  let bin = -1;
  let x = 0;
  let y = 0;
  let shelfH = 0;
  let usedW = 0;
  const newBin = () => {
    bin++;
    bins.push({ w: 0, h: 0 });
    x = padding;
    y = padding;
    shelfH = 0;
    usedW = 0;
  };
  newBin();
  for (const r of sorted) {
    const w = r.w + padding;
    const h = r.h + padding;
    if (r.w + padding * 2 > max || r.h + padding * 2 > max) throw new Error(`${r.id} is ${r.w}×${r.h}, bigger than a ${max}px page`);
    if (x + w > max) {
      x = padding;
      y += shelfH;
      shelfH = 0;
    }
    if (y + h > max) newBin();
    placed.push({ ...r, x, y, bin });
    x += w;
    shelfH = Math.max(shelfH, h);
    usedW = Math.max(usedW, x);
    bins[bin] = { w: pow2(usedW), h: pow2(y + shelfH) };
  }
  if (!placed.length) return { placed, bins: [] };
  return { placed, bins };
}
