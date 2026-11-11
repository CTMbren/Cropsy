import * as Phaser from 'phaser';
import type { ArtRegistry } from './art';

/** `public/art/index.json`, written by `npm run art:pack`. */
export interface ArtIndex {
  version: 1;
  shipScale: number;
  pages: { name: string; group: string; variant: string | null; json: string; bytes: number }[];
  frames: Record<string, { page: string; pivot: [number, number] }>;
}

const INDEX = 'art:index';
const pageTexture = (page: string) => `art:${page}`;

/**
 * Queues the art index and, once it arrives, every base atlas page (variants such as seasons are
 * left for later). Call from `preload()`. A missing or empty index is fine: the game keeps using
 * the baked placeholders.
 */
export function queueArt(scene: Phaser.Scene): void {
  scene.load.json(INDEX, 'art/index.json');
  scene.load.once(`filecomplete-json-${INDEX}`, (_key: string, _type: string, idx: ArtIndex | undefined) => {
    for (const p of idx?.pages ?? []) {
      if (p.variant) continue;
      scene.load.multiatlas(pageTexture(p.name), `art/${p.json}`, 'art/');
    }
  });
}

/** Points every loaded atlas frame's key at its frame, so atlas art replaces the placeholder. */
export function registerArt(scene: Phaser.Scene, art: ArtRegistry): number {
  const idx = scene.cache.json.get(INDEX) as ArtIndex | undefined;
  if (!idx?.frames) return 0;
  let n = 0;
  for (const [key, f] of Object.entries(idx.frames)) {
    const tex = pageTexture(f.page);
    if (!scene.textures.exists(tex) || !scene.textures.get(tex).has(key)) continue;
    art.addAtlasFrame(key, { texture: tex, frame: key, originX: f.pivot[0], originY: f.pivot[1], scale: 1 / idx.shipScale });
    n++;
  }
  return n;
}
