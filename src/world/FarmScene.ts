import * as Phaser from 'phaser';
import { isFresh, key, stageOf, type PlotState } from '../core/farm';
import type { Game } from '../game';
import { cellToScreen, screenToCell, TILE_H, TILE_W } from './iso';

const INK = 0x4a2e1a; // thick dark-brown outline used on everything in the cartoon style
const DIRT_TOP = 0xa86a3c;
const DIRT_TOP_DARK = 0x8e5530;
const DIRT_SIDE_L = 0x7a4626;
const DIRT_SIDE_R = 0x653a1f;
const GRASS = 0x7cc94f;
const GRASS_EDGE = 0x5aa83a;
const PLOT_DEPTH = 10;
const TAP_SLOP = 10;

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

/**
 * The isometric farm. Draws placeholder vector art (real atlases come with the art pipeline) and
 * turns touches into game intents: tap or drag across plots to plant/harvest, drag elsewhere or
 * use two fingers to pan, pinch or wheel to zoom.
 */
export class FarmScene extends Phaser.Scene {
  private game_!: Game;
  private world!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Graphics;
  private plotsG!: Phaser.GameObjects.Graphics;
  private cropsG!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private dragMode: 'none' | 'act' | 'pan' = 'none';
  private downAt = { x: 0, y: 0 };
  private lastPan = { x: 0, y: 0 };
  private actedKeys = new Set<string>();
  private pinchDist = 0;
  private sparkleT = 0;
  /** Canvas is rendered at device pixels; the camera zoom maps logical (CSS) pixels onto it. */
  private dpr = 1;

  constructor() {
    super('farm');
  }

  init(data: { game: Game }): void {
    this.game_ = data.game;
  }

  create(): void {
    this.dpr = this.registry.get('dpr') ?? 1;
    this.cameras.main.setOrigin(0, 0).setZoom(this.dpr);
    this.input.addPointer(1);
    this.world = this.add.container(0, 0);
    this.ground = this.add.graphics();
    this.plotsG = this.add.graphics();
    this.cropsG = this.add.graphics();
    this.highlight = this.add.graphics();
    this.world.add([this.ground, this.plotsG, this.cropsG, this.highlight]);

    this.layout();
    this.scale.on('resize', () => this.layout());
    this.drawGround();
    this.redraw();

    this.game_.subscribe(() => this.redraw());
    this.game_.onFx((e) => {
      if (e.kind === 'harvest') this.popText(e.key, `+${e.coins}`, e.fresh ? '#ffe14d' : '#ffffff');
      if (e.kind === 'denied' && e.reason === 'no-coins') this.popText(e.key, 'Need coins', '#ffd0d0');
      if (e.kind === 'denied' && e.reason === 'locked') this.popText(e.key, 'Locked', '#ffd0d0');
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.redraw() });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.9 : 1.1));
  }

  update(_t: number, dt: number): void {
    this.sparkleT += dt;
    if (this.sparkleT > 400) {
      this.sparkleT = 0;
      this.drawCrops();
    }
  }

  // ── layout & drawing ─────────────────────────────────────────────

  /** Logical (CSS-pixel) viewport size. */
  private view(): { width: number; height: number } {
    return { width: this.scale.width / this.dpr, height: this.scale.height / this.dpr };
  }

  /** Pointer position in logical pixels. */
  private pt(p: Phaser.Input.Pointer): { x: number; y: number } {
    return { x: p.x / this.dpr, y: p.y / this.dpr };
  }

  private layout(): void {
    const { width, height } = this.view();
    const s = this.game_.state;
    const mid = cellToScreen((s.width - 1) / 2, (s.height - 1) / 2);
    // Fit the farm to ~90% of the narrower dimension; HUD takes the top and the tray the bottom.
    const farmW = (s.width + s.height) * (TILE_W / 2);
    const fit = Math.min((width * 0.92) / farmW, 1.6);
    this.world.setScale(Math.max(0.5, fit));
    this.world.setPosition(width / 2 - mid.sx * this.world.scale, height * 0.46 - mid.sy * this.world.scale);
  }

  private drawGround(): void {
    const g = this.ground;
    const s = this.game_.state;
    g.clear();
    const pad = 1.6;
    const pts = [
      cellToScreen(-pad, -pad),
      cellToScreen(s.width - 1 + pad, -pad),
      cellToScreen(s.width - 1 + pad, s.height - 1 + pad),
      cellToScreen(-pad, s.height - 1 + pad),
    ].map((c) => new Phaser.Math.Vector2(c.sx, c.sy));
    // grass island with a thick outlined lip
    g.fillStyle(GRASS_EDGE, 1);
    g.fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x, p.y + 14)), true);
    g.fillStyle(GRASS, 1);
    g.fillPoints(pts, true);
    g.lineStyle(4, INK, 1);
    g.strokePoints(pts, true);
  }

  private diamond(cx: number, cy: number, w = TILE_W, h = TILE_H): Phaser.Math.Vector2[] {
    return [
      new Phaser.Math.Vector2(cx, cy - h / 2),
      new Phaser.Math.Vector2(cx + w / 2, cy),
      new Phaser.Math.Vector2(cx, cy + h / 2),
      new Phaser.Math.Vector2(cx - w / 2, cy),
    ];
  }

  private redraw(): void {
    this.drawPlots();
    this.drawCrops();
  }

  private drawPlots(): void {
    const g = this.plotsG;
    const s = this.game_.state;
    g.clear();
    const inset = 0.84;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const { sx, sy } = cellToScreen(x, y);
        const top = this.diamond(sx, sy, TILE_W * inset, TILE_H * inset);
        const [n, e, so, w] = top;
        // raised soil block: left and right side faces, then the top
        g.fillStyle(DIRT_SIDE_L, 1);
        g.fillPoints([w, so, new Phaser.Math.Vector2(so.x, so.y + PLOT_DEPTH), new Phaser.Math.Vector2(w.x, w.y + PLOT_DEPTH)], true);
        g.fillStyle(DIRT_SIDE_R, 1);
        g.fillPoints([so, e, new Phaser.Math.Vector2(e.x, e.y + PLOT_DEPTH), new Phaser.Math.Vector2(so.x, so.y + PLOT_DEPTH)], true);
        g.fillStyle(DIRT_TOP, 1);
        g.fillPoints(top, true);
        // furrows
        g.lineStyle(2, DIRT_TOP_DARK, 1);
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          g.lineBetween(Phaser.Math.Linear(w.x, n.x, t), Phaser.Math.Linear(w.y, n.y, t), Phaser.Math.Linear(so.x, e.x, t), Phaser.Math.Linear(so.y, e.y, t));
        }
        g.lineStyle(3, INK, 1);
        g.strokePoints([n, e, new Phaser.Math.Vector2(e.x, e.y + PLOT_DEPTH), new Phaser.Math.Vector2(so.x, so.y + PLOT_DEPTH), new Phaser.Math.Vector2(w.x, w.y + PLOT_DEPTH), w], true);
        g.lineBetween(w.x, w.y, so.x, so.y);
        g.lineBetween(so.x, so.y, e.x, e.y);
        g.lineBetween(so.x, so.y, so.x, so.y + PLOT_DEPTH);
      }
    }
  }

  private drawCrops(): void {
    const g = this.cropsG;
    const s = this.game_.state;
    const now = this.game_.now();
    g.clear();
    // back-to-front so nearer crops overlap farther ones
    const cells: [number, number][] = [];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) cells.push([x, y]);
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]));
    for (const [x, y] of cells) {
      const plot = s.plots[key(x, y)];
      if (!plot?.crop) continue;
      const { sx, sy } = cellToScreen(x, y);
      this.drawCrop(g, plot, sx, sy, now);
    }
  }

  private drawCrop(g: Phaser.GameObjects.Graphics, plot: PlotState, sx: number, sy: number, now: number): void {
    const def = this.game_.content.cropById.get(plot.crop!);
    if (!def) return;
    const stage = stageOf(plot, now);
    const leaf = hex(def.leaf);
    const fruit = hex(def.color);
    const spots: [number, number][] = [
      [-18, -4],
      [18, -4],
      [0, 8],
      [0, -14],
    ];
    for (const [dx, dy] of spots) {
      const cx = sx + dx;
      const cy = sy + dy;
      if (stage === 'seed') {
        g.fillStyle(0x5b3418, 1);
        g.fillEllipse(cx, cy, 10, 6);
        continue;
      }
      const h = stage === 'sprout' ? 10 : stage === 'growing' ? 18 : 22;
      // two outlined leaves
      g.lineStyle(2.5, INK, 1);
      g.fillStyle(leaf, 1);
      g.fillEllipse(cx - 5, cy - h / 2, 9, h);
      g.strokeEllipse(cx - 5, cy - h / 2, 9, h);
      g.fillEllipse(cx + 5, cy - h / 2, 9, h);
      g.strokeEllipse(cx + 5, cy - h / 2, 9, h);
      if (stage === 'ripe') {
        g.fillStyle(fruit, 1);
        g.fillCircle(cx, cy - 2, 9);
        g.strokeCircle(cx, cy - 2, 9);
        g.fillStyle(0xffffff, 0.7);
        g.fillCircle(cx - 3, cy - 5, 2.5);
      }
    }
    if (stage === 'ripe') {
      // bobbing "ready" badge; sparkles when inside the Fresh Pick window
      const bob = Math.sin(this.time.now / 250) * 3;
      g.lineStyle(3, INK, 1);
      g.fillStyle(isFresh(plot, now) ? 0xffe14d : 0xffffff, 1);
      g.fillCircle(sx, sy - 44 + bob, 10);
      g.strokeCircle(sx, sy - 44 + bob, 10);
      g.fillStyle(fruit, 1);
      g.fillCircle(sx, sy - 44 + bob, 5);
      if (isFresh(plot, now) && Math.floor(this.time.now / 400) % 2 === 0) {
        g.fillStyle(0xffffff, 1);
        g.fillTriangle(sx + 20, sy - 50, sx + 23, sy - 44, sx + 26, sy - 50);
        g.fillTriangle(sx + 20, sy - 50, sx + 23, sy - 56, sx + 26, sy - 50);
      }
    }
  }

  private popText(k: string, text: string, color: string): void {
    const [x, y] = k.split(',').map(Number);
    const { sx, sy } = cellToScreen(x, y);
    const t = this.add
      .text(sx, sy - 30, text, { fontFamily: 'Lilita One, Fredoka, system-ui', fontSize: '26px', color, stroke: '#4a2e1a', strokeThickness: 6, resolution: this.dpr })
      .setOrigin(0.5);
    this.world.add(t);
    this.tweens.add({ targets: t, y: sy - 80, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1.15 }, duration: 180, yoyo: true, ease: 'Back.easeOut' });
  }

  // ── input ───────────────────────────────────────────────────────

  private plotAt(p: Phaser.Input.Pointer): string | null {
    const q = this.pt(p);
    const lx = (q.x - this.world.x) / this.world.scale;
    const ly = (q.y - this.world.y) / this.world.scale;
    const c = screenToCell(lx, ly);
    const x = Math.round(c.x);
    const y = Math.round(c.y);
    const s = this.game_.state;
    if (x < 0 || y < 0 || x >= s.width || y >= s.height) return null;
    return key(x, y);
  }

  private pointersDown(): Phaser.Input.Pointer[] {
    return [this.input.pointer1, this.input.pointer2].filter((p) => p && p.isDown);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const downs = this.pointersDown().map((d) => this.pt(d));
    if (downs.length >= 2) {
      this.dragMode = 'pan';
      this.pinchDist = Phaser.Math.Distance.Between(downs[0].x, downs[0].y, downs[1].x, downs[1].y);
      this.lastPan = { x: (downs[0].x + downs[1].x) / 2, y: (downs[0].y + downs[1].y) / 2 };
      return;
    }
    const q = this.pt(p);
    this.downAt = { x: q.x, y: q.y };
    this.lastPan = { x: q.x, y: q.y };
    this.actedKeys.clear();
    const k = this.plotAt(p);
    this.dragMode = k ? 'act' : 'pan';
    if (k) {
      this.actedKeys.add(k);
      this.game_.tapPlot(k);
      this.flash(k);
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (!p.isDown) return;
    const q = this.pt(p);
    const downs = this.pointersDown().map((d) => this.pt(d));
    if (downs.length >= 2) {
      const d = Phaser.Math.Distance.Between(downs[0].x, downs[0].y, downs[1].x, downs[1].y);
      if (this.pinchDist > 0) this.zoomBy(d / this.pinchDist);
      this.pinchDist = d;
      const mid = { x: (downs[0].x + downs[1].x) / 2, y: (downs[0].y + downs[1].y) / 2 };
      this.world.x += mid.x - this.lastPan.x;
      this.world.y += mid.y - this.lastPan.y;
      this.lastPan = mid;
      return;
    }
    if (this.dragMode === 'pan') {
      this.world.x += q.x - this.lastPan.x;
      this.world.y += q.y - this.lastPan.y;
      this.lastPan = { x: q.x, y: q.y };
    } else if (this.dragMode === 'act') {
      // drag-to-plant / drag-to-harvest across plots
      if (Phaser.Math.Distance.Between(q.x, q.y, this.downAt.x, this.downAt.y) < TAP_SLOP) return;
      const k = this.plotAt(p);
      if (k && !this.actedKeys.has(k)) {
        this.actedKeys.add(k);
        this.game_.tapPlot(k);
        this.flash(k);
      }
    }
  }

  private onUp(): void {
    if (this.pointersDown().length === 0) {
      this.dragMode = 'none';
      this.pinchDist = 0;
    }
  }

  private zoomBy(f: number): void {
    const s = Phaser.Math.Clamp(this.world.scale * f, 0.4, 2.5);
    const { width, height } = this.view();
    // zoom around the screen centre
    const cx = width / 2;
    const cy = height / 2;
    this.world.x = cx - (cx - this.world.x) * (s / this.world.scale);
    this.world.y = cy - (cy - this.world.y) * (s / this.world.scale);
    this.world.setScale(s);
  }

  private flash(k: string): void {
    const [x, y] = k.split(',').map(Number);
    const { sx, sy } = cellToScreen(x, y);
    const g = this.highlight;
    g.clear();
    g.lineStyle(4, 0xffffff, 0.9);
    g.strokePoints(this.diamond(sx, sy, TILE_W * 0.9, TILE_H * 0.9), true);
    this.tweens.killTweensOf(g);
    g.setAlpha(1);
    this.tweens.add({ targets: g, alpha: 0, duration: 300 });
  }
}
