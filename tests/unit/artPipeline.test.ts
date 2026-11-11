import { mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkKey, packShelves, pageGroup, type ArtContent } from '../../tools/art/lib';
import { loadContent, packArt } from '../../tools/art/pack';

const ROOT = resolve(__dirname, '../..');
const content: ArtContent = loadContent(ROOT);

describe('art keys', () => {
  it('accepts the keys the game asks for', () => {
    for (const k of [
      'crop/radish/ripe',
      'crop/golden_melon/seed',
      'tile/soil/2',
      'tile/grass@night',
      'obstacle/rock/b',
      'marker/bubble-fresh/carrot',
      'building/mill/3',
      'decor/part/glow',
      `decor/${content.decor[0]}`,
      `critter/${content.critters[0]}`,
      'moss/body',
      'portrait/hazel/happy',
      'fx/puff',
    ])
      expect(checkKey(k, content), k).toBeNull();
  });

  it('rejects typos and unknown names', () => {
    expect(checkKey('crop/radsh/ripe', content)).toMatch(/unknown crop/);
    expect(checkKey('crop/radish/mature', content)).toMatch(/stage/);
    expect(checkKey('Crop/radish/ripe', content)).toMatch(/lowercase/);
    expect(checkKey('obstacle/tree', content)).toMatch(/obstacle/);
    expect(checkKey('building/castle', content)).not.toBeNull();
    expect(checkKey('hat/top', content)).toMatch(/unknown prefix/);
  });

  it('groups pages by what loads together', () => {
    expect(pageGroup('tile/grass', content)).toBe('core');
    expect(pageGroup('crop/radish/ripe', content)).toBe('crops-1');
    const late = content.crops.find((c) => c.unlock_level > 10)!;
    expect(pageGroup(`crop/${late.id}/ripe`, content)).toBe('crops-11');
    expect(pageGroup('crop/radish/ripe@autumn', content)).toBe('crops-1@autumn');
    expect(pageGroup('building/bakery', content)).toBe('buildings');
  });
});

describe('shelf packer', () => {
  it('places without overlap and spills to a new page when full', () => {
    const rects = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, w: 100 + (i % 5) * 20, h: 80 + (i % 3) * 30 }));
    const { placed, bins } = packShelves(rects, 512, 4);
    expect(placed).toHaveLength(30);
    expect(bins.length).toBeGreaterThan(1);
    for (const b of bins) expect([b.w, b.h].every((n) => (n & (n - 1)) === 0 && n <= 512)).toBe(true);
    for (const a of placed)
      for (const b of placed)
        if (a !== b && a.bin === b.bin) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
    expect(() => packShelves([{ id: 'huge', w: 600, h: 10 }], 512, 4)).toThrow(/bigger than/);
  });
});

describe('packArt', () => {
  /** A temp project with real content files and a manifest of synthetic sprites. */
  async function fixture(assets: { key: string; w: number; h: number; pivot?: [number, number] }[]) {
    const dir = mkdtempSync(join(tmpdir(), 'cropsy-art-'));
    symlinkSync(join(ROOT, 'content'), join(dir, 'content'));
    mkdirSync(join(dir, 'art', 'src'), { recursive: true });
    for (const a of assets) {
      // a filled circle with a transparent margin, so trimming has something to do
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${a.w}" height="${a.h}"><circle cx="${a.w / 2}" cy="${a.h / 2}" r="${Math.min(a.w, a.h) / 3}" fill="#e8506a" stroke="#4a2e1a" stroke-width="12"/></svg>`;
      await sharp(Buffer.from(svg)).png().toFile(join(dir, 'art', 'src', `${a.key.replace(/\//g, '_')}.png`));
    }
    const manifest = {
      version: 1,
      masterScale: 4,
      shipScale: 2,
      assets: assets.map((a) => ({ key: a.key, file: `src/${a.key.replace(/\//g, '_')}.png`, pivot: a.pivot ?? [0.5, 0.9] })),
    };
    writeFileSync(join(dir, 'art', 'manifest.json'), JSON.stringify(manifest));
    return dir;
  }

  it('writes hashed WebP pages, Phaser multiatlas JSON and the index', async () => {
    const dir = await fixture([
      { key: 'crop/radish/ripe', w: 200, h: 240 },
      { key: 'crop/radish/sprout', w: 200, h: 160 },
      { key: 'tile/grass', w: 512, h: 256, pivot: [0.5, 0.5] },
    ]);
    const idx = await packArt(dir);
    expect(idx.pages.map((p) => p.name).sort()).toEqual(['core', 'crops-1']);
    expect(idx.frames['crop/radish/ripe']).toEqual({ page: 'crops-1', pivot: [0.5, 0.9] });
    const files = readdirSync(join(dir, 'public', 'art'));
    expect(files).toContain('index.json');
    expect(files.some((f) => /^crops-1-0\.[0-9a-f]{8}\.webp$/.test(f))).toBe(true);

    const page = idx.pages.find((p) => p.name === 'crops-1')!;
    const atlas = JSON.parse(readFileSync(join(dir, 'public', 'art', page.json), 'utf8'));
    const ripe = atlas.textures[0].frames.find((f: { filename: string }) => f.filename === 'crop/radish/ripe');
    // shipped at half the master size, then trimmed to the circle
    expect(ripe.sourceSize).toEqual({ w: 100, h: 120 });
    expect(ripe.trimmed).toBe(true);
    expect(ripe.frame.w).toBeLessThan(100);
    const meta = await sharp(join(dir, 'public', 'art', atlas.textures[0].image)).metadata();
    expect(meta.format).toBe('webp');
  });

  it('refuses a manifest with problems and lists them all', async () => {
    const dir = await fixture([{ key: 'crop/radish/ripe', w: 64, h: 64 }]);
    const m = JSON.parse(readFileSync(join(dir, 'art', 'manifest.json'), 'utf8'));
    m.assets.push({ key: 'crop/nope/ripe', file: 'src/missing.png', pivot: [2, 0] });
    m.assets.push({ ...m.assets[0] });
    writeFileSync(join(dir, 'art', 'manifest.json'), JSON.stringify(m));
    await expect(packArt(dir)).rejects.toThrow(/unknown crop[\s\S]*not found[\s\S]*pivot[\s\S]*listed twice/);
  });
});
