import * as Phaser from 'phaser';

/**
 * Pooled, cheap feedback effects for the farm: particle bursts and floating BitmapText.
 *
 * Before this, every burst made 5–14 Arc objects with a tween each, and every pop made a new
 * canvas Text (a canvas draw plus a texture upload). A drag-harvest across 20 plots made ~160
 * objects and 20 texture uploads in under a second. Now one particle emitter and a small pool of
 * BitmapTexts, all sharing two textures baked once at boot, do the same job.
 */

export const FX_FONT = 'fx/lilita';
const DOT = 'fx/dot';
const INK = '#4a2e1a';
/** Glyphs are baked at this size, so text stays sharp up to about 2× zoom. */
const BAKE = 48;
const POOL_MAX = 32;

const uniq = (s: string) => [...new Set(Array.from(s))].join('');

/** Bakes Lilita One (white fill, INK outline) into a bitmap font. The font must already be loaded. */
export function bakeFxFont(scene: Phaser.Scene, extraChars = ''): void {
  if (scene.cache.bitmapFont.exists(FX_FONT)) return;
  let ascii = '';
  for (let c = 32; c < 127; c++) ascii += String.fromCharCode(c);
  const chars = uniq(ascii + '×★♥…’' + extraChars);

  const stroke = Math.round(BAKE * 0.27);
  const pad = Math.ceil(stroke / 2) + 2;
  const font = `${BAKE}px "Lilita One", Fredoka, system-ui`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const m = probe.measureText('Hgjy');
  const ascent = Math.ceil(m.actualBoundingBoxAscent || BAKE * 0.8);
  const descent = Math.ceil(m.actualBoundingBoxDescent || BAKE * 0.25);
  const cellH = ascent + descent + pad * 2;

  const W = 1024;
  const cells: { ch: string; x: number; y: number; w: number; adv: number }[] = [];
  let x = 0;
  let y = 0;
  for (const ch of chars) {
    const adv = probe.measureText(ch).width;
    const w = Math.ceil(adv) + pad * 2;
    if (x + w > W) {
      x = 0;
      y += cellH;
    }
    cells.push({ ch, x, y, w, adv });
    x += w;
  }
  let H = 1;
  while (H < y + cellH) H *= 2;

  const tex = scene.textures.createCanvas(FX_FONT, W, H)!;
  const ctx = tex.context;
  ctx.font = font;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = stroke;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffffff';
  for (const c of cells) {
    ctx.strokeText(c.ch, c.x + pad, c.y + pad + ascent);
    ctx.fillText(c.ch, c.x + pad, c.y + pad + ascent);
  }
  tex.refresh();

  // same layout Phaser's own RetroFont parser produces (note the flipped v)
  // xAdvance is read by Phaser's layout code but missing from its typings
  type Glyph = Phaser.Types.GameObjects.BitmapText.BitmapFontCharacterData & { xAdvance: number };
  const glyphs: Record<number, Glyph> = {};
  const data = { font: FX_FONT, size: BAKE, lineHeight: cellH, retroFont: false, chars: glyphs };
  for (const c of cells) {
    glyphs[c.ch.charCodeAt(0)] = {
      x: c.x,
      y: c.y,
      width: c.w,
      height: cellH,
      centerX: Math.floor(c.w / 2),
      centerY: Math.floor(cellH / 2),
      xOffset: -pad,
      yOffset: 0,
      xAdvance: Math.round(c.adv),
      data: {},
      kerning: {},
      u0: c.x / W,
      v0: 1 - c.y / H,
      u1: (c.x + c.w) / W,
      v1: 1 - (c.y + cellH) / H,
    };
  }
  scene.cache.bitmapFont.add(FX_FONT, { data, texture: FX_FONT, frame: null });
}

/** A white dot with an INK rim, baked at 2× for the particle bursts (tinted per burst). */
function bakeDot(scene: Phaser.Scene): void {
  if (scene.textures.exists(DOT)) return;
  const r = 20;
  const tex = scene.textures.createCanvas(DOT, r * 2 + 4, r * 2 + 4)!;
  const ctx = tex.context;
  ctx.beginPath();
  ctx.arc(r + 2, r + 2, r - 2, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  tex.refresh();
}

const toTint = (c: string | number) => (typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16));

export class FxLayer {
  /** Add this to the world container last so effects draw over everything on the farm. */
  readonly root: Phaser.GameObjects.Container;
  private emitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private pool: Phaser.GameObjects.BitmapText[] = [];

  constructor(
    private scene: Phaser.Scene,
    extraChars = '',
    /** Reduced motion: no particle sprays, and text fades without bouncing. */
    private calm: () => boolean = () => false,
  ) {
    bakeFxFont(scene, extraChars);
    bakeDot(scene);
    this.root = scene.add.container(0, 0);
    // matches the old tweened dots: a ~22–40px spray, flattened for the isometric floor, lifting slightly
    this.emitter = scene.add.particles(0, 0, DOT, {
      emitting: false,
      lifespan: 420,
      speedX: { min: -110, max: 110 },
      speedY: { min: -120, max: 25 },
      scale: { start: 0.3, end: 0.06 },
      alpha: { start: 1, end: 0 },
    });
    this.root.add(this.emitter);
  }

  burst(x: number, y: number, color: number, count = 8): void {
    if (this.calm()) return;
    this.emitter.setParticleTint(color);
    this.emitter.explode(count, x, y - 10);
  }

  /** A soft golden twinkle: a couple of slow-rising gold flecks (★10 signature crops). Shares the burst emitter. */
  glint(x: number, y: number): void {
    if (this.calm()) return;
    this.emitter.setParticleTint(0xffd54f);
    this.emitter.explode(2, x + (Math.random() - 0.5) * 30, y - 18 - Math.random() * 14);
  }

  /** Floating "+3 Carrot" style text. */
  pop(x: number, y: number, text: string, color: string | number): void {
    const t = this.take(text, color, 22).setPosition(x, y - 30);
    this.scene.tweens.add({ targets: t, y: y - 80, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => this.release(t) });
    if (!this.calm()) this.scene.tweens.add({ targets: t, scale: { from: 0.6, to: 1.15 }, duration: 180, yoyo: true, ease: 'Back.easeOut' });
  }

  combo(x: number, y: number, n: number): void {
    const t = this.take(`Combo ×${n}!`, 0xffe14d, n >= 10 ? 34 : 28)
      .setPosition(x, y - 70)
      .setAngle(-6);
    this.scene.tweens.add({ targets: t, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.scene.tweens.add({ targets: t, y: y - 120, alpha: 0, delay: 500, duration: 600, ease: 'Cubic.easeIn', onComplete: () => this.release(t) });
  }

  /** Texts currently in use (for the debug overlay). */
  get live(): number {
    return this.pool.filter((t) => t.visible).length;
  }

  private take(text: string, color: string | number, size: number): Phaser.GameObjects.BitmapText {
    let t = this.pool.find((p) => !p.visible);
    if (t) {
      // keep the pool in last-used order so a full pool recycles the oldest pop
      this.pool.splice(this.pool.indexOf(t), 1);
      this.pool.push(t);
    } else {
      if (this.pool.length < POOL_MAX) {
        t = this.scene.add.bitmapText(0, 0, FX_FONT, '', BAKE).setOrigin(0.5);
        this.root.add(t);
        this.pool.push(t);
      } else {
        // every slot busy: recycle the oldest
        t = this.pool.shift()!;
        this.pool.push(t);
      }
    }
    this.scene.tweens.killTweensOf(t);
    this.root.bringToTop(t);
    return t.setText(text).setFontSize(size).setTint(toTint(color)).setAlpha(1).setScale(1).setAngle(0).setVisible(true);
  }

  private release(t: Phaser.GameObjects.BitmapText): void {
    t.setVisible(false);
  }
}
