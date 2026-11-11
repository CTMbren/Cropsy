/// <reference types="node" />
/**
 * Packs the generated sprites listed in `art/manifest.json` into WebP atlas pages for the game.
 *
 *   npm run art:pack
 *
 * For each asset: downscale from masterScale to shipScale, trim transparent edges, then shelf-pack
 * into pages of at most 2048² grouped by `pageGroup` (core, crops by tier, buildings, …). Writes
 * `public/art/<page>.<hash>.json` (Phaser multiatlas) with `<page>-<n>.<hash>.webp` images, plus
 * `public/art/index.json`, which the game reads at boot. Every failed check stops the pack with a
 * list of problems, so nothing half-valid ships.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { checkKey, packShelves, pageGroup, type ArtContent, type Manifest, type ManifestAsset } from './lib.ts';

export const PAGE_MAX = 2048;
const PADDING = 4;

/** What the game reads at boot (`public/art/index.json`). */
export interface ArtIndex {
  version: 1;
  shipScale: number;
  pages: { name: string; group: string; variant: string | null; json: string; bytes: number }[];
  frames: Record<string, { page: string; pivot: [number, number] }>;
}

export function loadContent(root: string): ArtContent {
  const read = (f: string) => JSON.parse(readFileSync(join(root, 'content', f), 'utf8'));
  const crops = read('crops.json') as { id: string; unlock_level: number }[];
  const critters = (read('critters.json') as { id: string }[]).map((x) => x.id);
  const decor = ((read('economy.json') as { decorations?: { id: string }[] }).decorations ?? []).map((d) => d.id);
  return { crops, critters, decor };
}

/** Returns every problem with the manifest (empty when it's fine to pack). */
export function validate(m: Manifest, artDir: string, c: ArtContent): string[] {
  const errs: string[] = [];
  if (m.version !== 1) errs.push(`manifest version ${m.version} isn't supported`);
  if (!(m.masterScale > 0) || !(m.shipScale > 0) || m.shipScale > m.masterScale) errs.push('need masterScale ≥ shipScale > 0');
  const seen = new Set<string>();
  for (const a of m.assets ?? []) {
    const where = a.key ?? a.file ?? '(unnamed asset)';
    if (seen.has(a.key)) errs.push(`${where}: listed twice`);
    seen.add(a.key);
    const bad = checkKey(a.key ?? '', c);
    if (bad) errs.push(`${where}: ${bad}`);
    if (!a.file || !existsSync(join(artDir, a.file))) errs.push(`${where}: file "${a.file}" not found in art/`);
    const [px, py] = a.pivot ?? [];
    if (!(px >= 0 && px <= 1 && py >= 0 && py <= 1)) errs.push(`${where}: pivot must be [x, y] with both in 0–1`);
  }
  return errs;
}

interface Sprite {
  asset: ManifestAsset;
  png: Buffer;
  /** Size before trimming, in shipped pixels. */
  srcW: number;
  srcH: number;
  /** Trimmed box inside the source. */
  tx: number;
  ty: number;
  w: number;
  h: number;
}

async function prepare(a: ManifestAsset, artDir: string, ratio: number): Promise<Sprite> {
  const img = sharp(join(artDir, a.file)).ensureAlpha();
  const meta = await img.metadata();
  const srcW = Math.max(1, Math.round((meta.width ?? 1) * ratio));
  const srcH = Math.max(1, Math.round((meta.height ?? 1) * ratio));
  const { data, info } = await img.resize(srcW, srcH, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  // trim to the visible pixels
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) throw new Error(`${a.key}: image is fully transparent`);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: x0, top: y0, width: w, height: h })
    .png()
    .toBuffer();
  return { asset: a, png, srcW, srcH, tx: x0, ty: y0, w, h };
}

const hash8 = (b: Buffer | string) => createHash('sha1').update(b).digest('hex').slice(0, 8);

/** Packs everything and writes `outDir`. Returns the index, or throws with every problem found. */
export async function packArt(root: string, outDir = join(root, 'public', 'art')): Promise<ArtIndex> {
  const artDir = join(root, 'art');
  const manifest = JSON.parse(readFileSync(join(artDir, 'manifest.json'), 'utf8')) as Manifest;
  const content = loadContent(root);
  const errs = validate(manifest, artDir, content);
  if (errs.length) throw new Error(`art manifest has ${errs.length} problem(s):\n  - ${errs.join('\n  - ')}`);

  const ratio = manifest.shipScale / manifest.masterScale;
  const sprites = await Promise.all(manifest.assets.map((a) => prepare(a, artDir, ratio)));

  const groups = new Map<string, Sprite[]>();
  for (const s of sprites) {
    const g = pageGroup(s.asset.key, content);
    groups.set(g, [...(groups.get(g) ?? []), s]);
  }

  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) rmSync(join(outDir, f));

  const index: ArtIndex = { version: 1, shipScale: manifest.shipScale, pages: [], frames: {} };
  for (const [group, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const byKey = new Map(list.map((s) => [s.asset.key, s]));
    const { placed, bins } = packShelves(
      list.map((s) => ({ id: s.asset.key, w: s.w, h: s.h })),
      PAGE_MAX,
      PADDING,
    );
    const textures = [];
    let bytes = 0;
    for (let b = 0; b < bins.length; b++) {
      const here = placed.filter((p) => p.bin === b);
      const webp = await sharp({ create: { width: bins[b].w, height: bins[b].h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite(here.map((p) => ({ input: byKey.get(p.id)!.png, left: p.x, top: p.y })))
        .webp({ quality: 90, alphaQuality: 100, effort: 6 })
        .toBuffer();
      const image = `${group}-${b}.${hash8(webp)}.webp`;
      writeFileSync(join(outDir, image), webp);
      bytes += webp.length;
      textures.push({
        image,
        format: 'RGBA8888',
        size: { w: bins[b].w, h: bins[b].h },
        scale: 1,
        frames: here.map((p) => {
          const s = byKey.get(p.id)!;
          return {
            filename: p.id,
            rotated: false,
            trimmed: s.w !== s.srcW || s.h !== s.srcH,
            frame: { x: p.x, y: p.y, w: p.w, h: p.h },
            spriteSourceSize: { x: s.tx, y: s.ty, w: s.w, h: s.h },
            sourceSize: { w: s.srcW, h: s.srcH },
            pivot: { x: s.asset.pivot[0], y: s.asset.pivot[1] },
          };
        }),
      });
    }
    const jsonText = JSON.stringify({ textures, meta: { app: 'cropsy tools/art/pack.ts', group } });
    const json = `${group}.${hash8(jsonText)}.json`;
    writeFileSync(join(outDir, json), jsonText);
    const [base, variant = null] = group.split('@');
    index.pages.push({ name: group, group: base, variant, json, bytes });
    for (const s of list) index.frames[s.asset.key] = { page: group, pivot: s.asset.pivot };
  }
  writeFileSync(join(outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

// CLI: `node --experimental-strip-types tools/art/pack.ts`
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  packArt(root)
    .then((idx) => {
      const n = Object.keys(idx.frames).length;
      const kb = Math.round(idx.pages.reduce((a, p) => a + p.bytes, 0) / 1024);
      console.log(n ? `Packed ${n} sprites into ${idx.pages.length} page(s), ${kb} KB.` : 'No art in the manifest yet; wrote an empty index.');
      for (const p of idx.pages) console.log(`  ${p.name.padEnd(14)} ${Math.round(p.bytes / 1024)} KB`);
    })
    .catch((e: Error) => {
      console.error(e.message);
      process.exit(1);
    });
}
