import * as Phaser from 'phaser';

/**
 * Where every farm sprite gets its texture. A key like `crop/radish/ripe` resolves to a frame in a
 * loaded art atlas when one exists; until then it falls back to a placeholder baked once from the
 * old vector drawing. Real art can therefore land one category at a time with no code changes.
 *
 * Keys may carry a variant suffix (`crop/radish/ripe@autumn`, `tile/grass@night`). A missing variant
 * falls back to the base key, so seasons and night can be added gradually too.
 */

/** Draws a placeholder with its anchor (the sprite's pivot) at (cx, cy), in logical pixels. */
export type DrawFn = (g: Phaser.GameObjects.Graphics, cx: number, cy: number) => void;

/** Logical-pixel box around the anchor that the placeholder drawing fits in. */
export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ArtFrame {
  texture: string;
  frame?: string;
  /** Normalised origin that puts the anchor on the sprite's position. */
  originX: number;
  originY: number;
  /** Sprite scale that maps texture pixels back to logical pixels. */
  scale: number;
}

interface Placeholder {
  draw: DrawFn;
  bounds: Bounds;
  /** Shown this much larger than drawn, around the anchor. */
  scale: number;
}

/** Atlas frames carry their pivot in the atlas JSON (`pivot`), so real art needs no bounds here. */
interface AtlasEntry {
  texture: string;
  frame: string;
  originX: number;
  originY: number;
  scale: number;
}

export class ArtRegistry {
  private placeholders = new Map<string, Placeholder>();
  private atlas = new Map<string, AtlasEntry>();
  private resolved = new Map<string, ArtFrame>();
  private bakeG: Phaser.GameObjects.Graphics;

  /**
   * @param bakeScale texture pixels per logical pixel for baked placeholders. Matching device pixels
   * at max zoom keeps them as crisp as the vector drawing was.
   */
  constructor(
    private scene: Phaser.Scene,
    private bakeScale: number,
  ) {
    this.bakeG = scene.make.graphics({}, false);
  }

  /** Registers the vector fallback for a key. Cheap: nothing is drawn until the key is first used. */
  placeholder(key: string, bounds: Bounds, draw: DrawFn, scale = 1): void {
    if (!this.placeholders.has(key)) this.placeholders.set(key, { draw, bounds, scale });
  }

  /** Registers a frame from a loaded atlas. Atlas art always wins over a placeholder. */
  addAtlasFrame(key: string, entry: AtlasEntry): void {
    this.atlas.set(key, entry);
    this.resolved.delete(key);
  }

  has(key: string): boolean {
    return this.atlas.has(key) || this.placeholders.has(key);
  }

  /** The frame to show for `key`, falling back from a variant to its base key. */
  frame(key: string): ArtFrame | null {
    const hit = this.resolved.get(key);
    if (hit) return hit;
    const at = key.indexOf('@');
    const base = at >= 0 ? key.slice(0, at) : key;
    const found = this.fromAtlas(key) ?? this.bake(key) ?? (base !== key ? this.frame(base) : null);
    if (found) this.resolved.set(key, found);
    return found;
  }

  /** Points an image at `key`. Returns false (and hides it) when nothing is registered for the key. */
  apply(img: Phaser.GameObjects.Image, key: string): boolean {
    const f = this.frame(key);
    if (!f) {
      img.setVisible(false);
      return false;
    }
    if (img.texture.key !== f.texture || (f.frame !== undefined && img.frame.name !== f.frame)) img.setTexture(f.texture, f.frame);
    img.setOrigin(f.originX, f.originY);
    img.setData('artScale', f.scale);
    return true;
  }

  private fromAtlas(key: string): ArtFrame | null {
    const e = this.atlas.get(key);
    return e ? { texture: e.texture, frame: e.frame, originX: e.originX, originY: e.originY, scale: e.scale } : null;
  }

  private bake(key: string): ArtFrame | null {
    const p = this.placeholders.get(key);
    if (!p) return null;
    const tex = `ph:${key}`;
    const { left, top, right, bottom } = p.bounds;
    const w = right - left;
    const h = bottom - top;
    // bake bigger when the sprite is shown bigger, so it stays crisp
    const s = this.bakeScale * p.scale;
    if (!this.scene.textures.exists(tex)) {
      const g = this.bakeG;
      g.clear();
      // generateTexture scrolls by the graphics position, so at (0,0) only the scale applies
      g.setPosition(0, 0).setScale(s);
      p.draw(g, -left, -top);
      g.generateTexture(tex, Math.ceil(w * s), Math.ceil(h * s));
      g.clear();
    }
    return { texture: tex, originX: -left / w, originY: -top / h, scale: p.scale / s };
  }
}
