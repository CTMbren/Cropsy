import * as Phaser from 'phaser';
import { hasFlag, isFresh, key, parseKey, stageOf, type ObstacleKind, type PlotState } from '../core/farm';
import type { Game } from '../game';
import { cellToScreen, screenToCell, TILE_H, TILE_W } from './iso';

const INK = 0x4a2e1a; // thick dark-brown outline used on everything in the cartoon style
const DIRT_TOP = 0xa86a3c;
const DIRT_TOP_DARK = 0x8e5530;
const DIRT_SIDE_L = 0x7a4626;
const DIRT_SIDE_R = 0x653a1f;
const GRASS = 0x7cc94f;
const GRASS_EDGE = 0x5aa83a;
const WOOD = 0xc98a4b;
const PLOT_DEPTH = 10;
const TAP_SLOP = 10;
/** Space reserved for the HUD above and the seed tray + nav below, in logical pixels. */
const UI_TOP = 116;
const UI_BOTTOM = 196;
/** Grass around the field, in tiles: room for the mill and farm buildings. */
const PAD = 2.7;

const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const V = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/**
 * The isometric farm. Draws placeholder vector art (real atlases come with the art pipeline) and
 * turns touches into game intents: tap or drag across plots to plant, harvest or clear; drag empty
 * ground or use two fingers to pan; pinch or scroll to zoom.
 */
export class FarmScene extends Phaser.Scene {
  private game_!: Game;
  private world!: Phaser.GameObjects.Container;
  private ground!: Phaser.GameObjects.Graphics;
  private plotsG!: Phaser.GameObjects.Graphics;
  private buildG!: Phaser.GameObjects.Graphics;
  private cropsG!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private dragMode: 'none' | 'act' | 'pan' = 'none';
  private downAt = { x: 0, y: 0 };
  private lastPan = { x: 0, y: 0 };
  private actedKeys = new Set<string>();
  private pinchDist = 0;
  private sparkleT = 0;
  private drawnSize = '';
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
    this.buildG = this.add.graphics();
    this.cropsG = this.add.graphics();
    this.highlight = this.add.graphics();
    this.world.add([this.ground, this.buildG, this.plotsG, this.cropsG, this.highlight]);

    this.layout();
    this.scale.on('resize', () => this.layout());
    this.redraw();

    this.game_.subscribe(() => this.redraw());
    this.game_.onFx((e) => {
      if (e.kind === 'harvest') {
        const crop = this.game_.content.cropById.get(e.crop);
        this.burst(e.key, crop ? hex(crop.color) : 0xffffff);
        this.popText(e.key, `+${e.qty} ${crop?.name ?? ''}`, e.qty > 1 ? '#ffe14d' : '#ffffff');
        if (e.tip) this.coinFly(e.key, e.tip);
      }
      if (e.kind === 'clear') {
        const rocky = e.obstacle === 'rock' || e.obstacle === 'boulder';
        const woody = e.obstacle === 'branch' || e.obstacle === 'stump';
        this.burst(e.key, rocky ? 0x9a9a9a : woody ? WOOD : 0x5cb83a);
        if (e.item) this.popText(e.key, `+${e.qty} ${e.item === 'wood' ? 'Wood' : 'Stone'}${e.gold ? ' +Gold!' : ''}`, e.gold ? '#ffe14d' : '#ffffff');
      }
      if (e.kind === 'collect') {
        const pos = this.buildingCell(e.building);
        if (pos) this.burst(`${pos.x},${pos.y}`, 0xffe14d, 10);
      }
      if (e.kind === 'plant') this.burst(e.key, 0x7a4626, 5);
      if (e.kind === 'expand') {
        this.layout();
        this.cameras.main.shake(250, 0.004);
      }
      if (e.kind === 'denied') {
        const msg: Record<string, string> = {
          'no-coins': 'Need coins',
          locked: 'Locked',
          max: 'Best soil already',
          missing: 'Need materials',
          already: 'Already fertilized',
          ripe: 'Harvest first',
          empty: 'Plant first',
          none: 'No fertilizer',
          blocked: 'Clear it first',
        };
        if (msg[e.reason]) this.popText(e.key, msg[e.reason], '#ffd0d0');
      }
      if (e.kind === 'soil') {
        this.burst(e.key, e.tier >= 3 ? 0xffc531 : 0x5b3418, 10);
        this.popText(e.key, ['', 'Loam!', 'Rich soil!', 'Golden soil!'][e.tier] ?? '', '#ffe14d');
      }
      if (e.kind === 'fertilize') this.burst(e.key, 0x7cdc4f, 8);
      if (e.kind === 'denied' && e.reason === 'need-tool') {
        const ob = this.game_.state.obstacles[e.key];
        this.popText(e.key, ob === 'boulder' ? 'Need a pickaxe' : 'Need a saw', '#ffd0d0');
      }
    });
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.redraw() });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.onMove(p));
    this.input.on('pointerup', () => this.onUp());
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.zoomBy(dy > 0 ? 0.9 : 1.1));
  }

  update(_t: number, dt: number): void {
    this.sparkleT += dt;
    if (this.sparkleT > 120) {
      this.sparkleT = 0;
      this.drawCrops();
      this.drawBuildings();
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

  private toScreen(k: string): { x: number; y: number } {
    const [x, y] = parseKey(k);
    const { sx, sy } = cellToScreen(x, y);
    return { x: this.world.x + sx * this.world.scale, y: this.world.y + sy * this.world.scale };
  }

  private layout(): void {
    const { width, height } = this.view();
    const s = this.game_.state;
    const mid = cellToScreen((s.width - 1) / 2, (s.height - 1) / 2);
    const farmW = (s.width + s.height + 2 * PAD) * (TILE_W / 2);
    const farmH = (s.width + s.height + 2 * PAD) * (TILE_H / 2) + 60;
    const availH = Math.max(160, height - UI_TOP - UI_BOTTOM);
    const fit = Math.min((width * 0.94) / farmW, availH / farmH, 1.6);
    this.world.setScale(Math.max(0.4, fit));
    this.world.setPosition(width / 2 - mid.sx * this.world.scale, UI_TOP + availH / 2 - mid.sy * this.world.scale + 10);
    this.drawGround();
    this.drawPlots();
    this.drawBuildings();
  }

  private diamond(cx: number, cy: number, w = TILE_W, h = TILE_H): Phaser.Math.Vector2[] {
    return [V(cx, cy - h / 2), V(cx + w / 2, cy), V(cx, cy + h / 2), V(cx - w / 2, cy)];
  }

  private drawGround(): void {
    const g = this.ground;
    const s = this.game_.state;
    g.clear();
    const pad = PAD;
    const corner = (x: number, y: number) => {
      const c = cellToScreen(x, y);
      return V(c.sx, c.sy);
    };
    const pts = [corner(-pad, -pad), corner(s.width - 1 + pad, -pad), corner(s.width - 1 + pad, s.height - 1 + pad), corner(-pad, s.height - 1 + pad)];
    g.fillStyle(GRASS_EDGE, 1);
    g.fillPoints(pts.map((p) => V(p.x, p.y + 14)), true);
    g.fillStyle(GRASS, 1);
    g.fillPoints(pts, true);
    g.lineStyle(4, INK, 1);
    g.strokePoints(pts, true);
    // grass tufts for texture
    g.lineStyle(2, GRASS_EDGE, 1);
    for (let i = 0; i < 30; i++) {
      const a = (i * 97) % 100 / 100;
      const b = (i * 53) % 100 / 100;
      const c = cellToScreen(-pad + 0.3 + a * (s.width + 2 * pad - 1.6), -pad + 0.3 + b * (s.height + 2 * pad - 1.6));
      g.lineBetween(c.sx - 3, c.sy, c.sx - 1, c.sy - 6);
      g.lineBetween(c.sx + 2, c.sy, c.sx + 3, c.sy - 5);
    }
    this.drawFence(g);
  }

  /** Wooden fence around the field, with Tobias's gate on the front-left side. */
  private drawFence(g: Phaser.GameObjects.Graphics): void {
    const s = this.game_.state;
    const off = 0.62;
    const edge = (x: number, y: number) => {
      const c = cellToScreen(x, y);
      return V(c.sx, c.sy);
    };
    const a = edge(-off, -off);
    const b = edge(s.width - 1 + off, -off);
    const d = edge(-off, s.height - 1 + off);
    const post = (p: Phaser.Math.Vector2) => {
      g.fillStyle(WOOD, 1);
      g.fillRect(p.x - 3, p.y - 18, 6, 18);
      g.lineStyle(2, INK, 1);
      g.strokeRect(p.x - 3, p.y - 18, 6, 18);
    };
    const rail = (p: Phaser.Math.Vector2, q: Phaser.Math.Vector2) => {
      g.lineStyle(6, INK, 1);
      g.lineBetween(p.x, p.y - 12, q.x, q.y - 12);
      g.lineStyle(3.5, WOOD, 1);
      g.lineBetween(p.x, p.y - 12, q.x, q.y - 12);
    };
    // back two sides only, so the fence never hides crops
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const p = Phaser.Math.LinearXY(a, b, i / segs) as Phaser.Math.Vector2;
      const q = Phaser.Math.LinearXY(a, b, (i + 1) / segs) as Phaser.Math.Vector2;
      rail(p, q);
      post(p);
    }
    post(b);
    for (let i = 0; i < segs; i++) {
      const p = Phaser.Math.LinearXY(a, d, i / segs) as Phaser.Math.Vector2;
      const q = Phaser.Math.LinearXY(a, d, (i + 1) / segs) as Phaser.Math.Vector2;
      const isGate = i === segs - 2;
      if (isGate) {
        const fixed = hasFlag(s, 'effect:bruno_gate_done');
        g.lineStyle(6, INK, 1);
        if (fixed) {
          g.fillStyle(0xe0a35e, 1);
          g.fillRect(p.x - 2, p.y - 22, q.x - p.x + 4, 16);
          g.lineStyle(2.5, INK, 1);
          g.strokeRect(p.x - 2, p.y - 22, q.x - p.x + 4, 16);
        } else {
          // the sorry state of the old gate: one plank hanging off
          g.lineStyle(6, INK, 1);
          g.lineBetween(p.x, p.y - 4, q.x, q.y - 16);
          g.lineStyle(3.5, 0x9a6a3a, 1);
          g.lineBetween(p.x, p.y - 4, q.x, q.y - 16);
        }
      } else {
        rail(p, q);
      }
      post(p);
    }
    post(d);
  }

  private redraw(): void {
    const s = this.game_.state;
    const size = `${s.width}x${s.height}:${hasFlag(s, 'effect:bruno_gate_done')}`;
    if (size !== this.drawnSize) {
      this.drawnSize = size;
      this.layout();
    }
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
        const k = key(x, y);
        if (!s.plots[k]) continue;
        const { sx, sy } = cellToScreen(x, y);
        if (s.obstacles[k]) {
          // overgrown patch: rough darker grass until cleared
          const patch = this.diamond(sx, sy, TILE_W * 0.9, TILE_H * 0.9);
          g.fillStyle(0x5f9e36, 1);
          g.fillPoints(patch, true);
          g.lineStyle(2, 0x3f7a22, 1);
          g.strokePoints(patch, true);
          continue;
        }
        const top = this.diamond(sx, sy, TILE_W * inset, TILE_H * inset);
        const [n, e, so, w] = top;
        g.fillStyle(DIRT_SIDE_L, 1);
        g.fillPoints([w, so, V(so.x, so.y + PLOT_DEPTH), V(w.x, w.y + PLOT_DEPTH)], true);
        g.fillStyle(DIRT_SIDE_R, 1);
        g.fillPoints([so, e, V(e.x, e.y + PLOT_DEPTH), V(so.x, so.y + PLOT_DEPTH)], true);
        const soil = s.plots[k].soil ?? 0;
        g.fillStyle([DIRT_TOP, 0x8a5430, 0x6e3f22, 0x8a5a24][soil] ?? DIRT_TOP, 1);
        g.fillPoints(top, true);
        if (soil >= 2) {
          // rich and golden soil glitter
          g.fillStyle(soil >= 3 ? 0xffd54f : 0xc9955c, 1);
          for (let i = 0; i < 6; i++) g.fillCircle(sx + ((i * 37) % 70) - 35, sy + ((i * 23) % 26) - 13, soil >= 3 ? 2.2 : 1.6);
        }
        g.lineStyle(2, DIRT_TOP_DARK, 1);
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          g.lineBetween(Phaser.Math.Linear(w.x, n.x, t), Phaser.Math.Linear(w.y, n.y, t), Phaser.Math.Linear(so.x, e.x, t), Phaser.Math.Linear(so.y, e.y, t));
        }
        g.lineStyle(3, INK, 1);
        g.strokePoints([n, e, V(e.x, e.y + PLOT_DEPTH), V(so.x, so.y + PLOT_DEPTH), V(w.x, w.y + PLOT_DEPTH), w], true);
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
    const cells: [number, number][] = [];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) cells.push([x, y]);
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1])); // back to front
    for (const [x, y] of cells) {
      const k = key(x, y);
      const { sx, sy } = cellToScreen(x, y);
      const ob = s.obstacles[k];
      if (ob) this.drawObstacle(g, ob, sx, sy, x * 7 + y * 13);
      else if (s.plots[k]?.crop) this.drawCrop(g, s.plots[k], sx, sy, now);
    }
  }

  private drawObstacle(g: Phaser.GameObjects.Graphics, kind: ObstacleKind, sx: number, sy: number, seed: number): void {
    g.lineStyle(2.5, INK, 1);
    if (kind === 'weeds') {
      const tufts: [number, number][] = [
        [-24, 0],
        [-2, -10],
        [20, 0],
        [-4, 12],
        [10, 6],
      ];
      for (const [dx, dy] of tufts) {
        const cx = sx + dx;
        const cy = sy + dy;
        g.fillStyle(seed % 2 ? 0x4f9a2f : 0x5aa83a, 1);
        g.fillTriangle(cx - 9, cy, cx - 3, cy - 20, cx + 1, cy);
        g.strokeTriangle(cx - 9, cy, cx - 3, cy - 20, cx + 1, cy);
        g.fillStyle(0x6cc040, 1);
        g.fillTriangle(cx - 3, cy, cx + 4, cy - 24, cx + 8, cy);
        g.strokeTriangle(cx - 3, cy, cx + 4, cy - 24, cx + 8, cy);
      }
    } else if (kind === 'branch') {
      g.lineStyle(9, INK, 1);
      g.lineBetween(sx - 26, sy + 4, sx + 22, sy - 10);
      g.lineBetween(sx - 6, sy - 4, sx + 4, sy + 12);
      g.lineStyle(5, 0x8b5a2b, 1);
      g.lineBetween(sx - 26, sy + 4, sx + 22, sy - 10);
      g.lineBetween(sx - 6, sy - 4, sx + 4, sy + 12);
      g.lineStyle(2.5, INK, 1);
      g.fillStyle(0x5cb83a, 1);
      g.fillEllipse(sx + 22, sy - 14, 14, 9);
      g.strokeEllipse(sx + 22, sy - 14, 14, 9);
    } else if (kind === 'stump') {
      g.fillStyle(0x6b4423, 1);
      g.fillRect(sx - 20, sy - 22, 40, 20);
      g.fillEllipse(sx, sy - 2, 40, 18);
      g.lineStyle(2.5, INK, 1);
      g.strokeEllipse(sx, sy - 2, 40, 18);
      g.fillStyle(0x6b4423, 1);
      g.fillRect(sx - 18.5, sy - 22, 37, 20);
      g.lineBetween(sx - 20, sy - 22, sx - 20, sy - 2);
      g.lineBetween(sx + 20, sy - 22, sx + 20, sy - 2);
      g.fillStyle(0xd9a86c, 1);
      g.fillEllipse(sx, sy - 22, 40, 18);
      g.strokeEllipse(sx, sy - 22, 40, 18);
      g.lineStyle(1.5, 0x9c6b3a, 1);
      g.strokeEllipse(sx, sy - 22, 24, 10);
      g.strokeEllipse(sx, sy - 22, 10, 4);
    } else if (kind === 'boulder') {
      g.fillStyle(0x7d7d7d, 1);
      g.fillEllipse(sx, sy - 16, 70, 50);
      g.strokeEllipse(sx, sy - 16, 70, 50);
      g.fillStyle(0xa8a8a8, 1);
      g.fillEllipse(sx - 10, sy - 26, 34, 18);
      g.lineStyle(2.5, INK, 1);
      g.lineBetween(sx + 4, sy - 38, sx + 10, sy - 22);
      g.lineBetween(sx + 10, sy - 22, sx + 2, sy - 10);
    } else {
      g.fillStyle(0x8f8f8f, 1);
      g.fillEllipse(sx, sy - 8, 52, 34);
      g.strokeEllipse(sx, sy - 8, 52, 34);
      g.fillStyle(0xb5b5b5, 1);
      g.fillEllipse(sx - 6, sy - 14, 28, 14);
      g.fillStyle(0x7a7a7a, 1);
      g.fillEllipse(sx + 18, sy, 22, 14);
      g.strokeEllipse(sx + 18, sy, 22, 14);
    }
  }

  private drawCrop(g: Phaser.GameObjects.Graphics, plot: PlotState, sx: number, sy: number, now: number): void {
    const def = this.game_.content.cropById.get(plot.crop!);
    if (!def) return;
    const stage = stageOf(plot, now);
    const leaf = hex(def.leaf);
    const fruit = hex(def.color);
    const sway = stage === 'ripe' ? Math.sin(this.time.now / 400 + sx) * 1.5 : 0;
    const spots: [number, number][] = [
      [-18, -4],
      [18, -4],
      [0, 8],
      [0, -14],
    ];
    for (const [dx, dy] of spots) {
      const cx = sx + dx + sway;
      const cy = sy + dy;
      if (stage === 'seed') {
        g.fillStyle(0x5b3418, 1);
        g.fillEllipse(cx, cy, 10, 6);
        continue;
      }
      const h = stage === 'sprout' ? 10 : stage === 'growing' ? 18 : 22;
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
    if (plot.fertilized && stage !== 'ripe') {
      g.lineStyle(2.5, INK, 1);
      g.fillStyle(0x7cdc4f, 1);
      g.fillCircle(sx + 30, sy - 4, 7);
      g.strokeCircle(sx + 30, sy - 4, 7);
      g.lineStyle(2.5, 0xffffff, 1);
      g.lineBetween(sx + 26, sy - 4, sx + 34, sy - 4);
      g.lineBetween(sx + 30, sy - 8, sx + 30, sy);
    }
    if (stage === 'ripe') {
      const bob = Math.sin(this.time.now / 250) * 3;
      const fresh = isFresh(plot, now);
      g.lineStyle(3, INK, 1);
      g.fillStyle(fresh ? 0xffe14d : 0xffffff, 1);
      g.fillCircle(sx, sy - 44 + bob, 10);
      g.strokeCircle(sx, sy - 44 + bob, 10);
      g.fillStyle(fruit, 1);
      g.fillCircle(sx, sy - 44 + bob, 5);
      if (fresh && Math.floor(this.time.now / 400) % 2 === 0) {
        g.fillStyle(0xffffff, 1);
        g.fillTriangle(sx + 20, sy - 50, sx + 23, sy - 44, sx + 26, sy - 50);
        g.fillTriangle(sx + 20, sy - 50, sx + 23, sy - 56, sx + 26, sy - 50);
      }
    }
  }

  // ── buildings ───────────────────────────────────────────────────

  /** Where each building stands, in (fractional) cell coordinates, outside the fence. */
  private buildingCell(id: string): { x: number; y: number } | null {
    if (id === 'mill') return { x: -2.3, y: 0.8 };
    if (id === 'jam_maker') return { x: 1.0, y: -2.2 };
    if (id === 'bakery') return { x: 3.2, y: -2.2 };
    return null;
  }

  private buildingAt(p: Phaser.Input.Pointer): string | null {
    const q = this.pt(p);
    const s = this.game_.state;
    const ids = ['mill', ...Object.keys(s.buildings).filter((b) => b !== 'mill')];
    for (const id of ids) {
      const c = this.buildingCell(id);
      if (!c) continue;
      if (id === 'mill' && !(s.flags.includes('mill_project') || s.buildings.mill)) continue;
      if (id !== 'mill' && !s.buildings[id]) continue;
      const { sx, sy } = cellToScreen(c.x, c.y);
      const bx = this.world.x + sx * this.world.scale;
      const by = this.world.y + (sy - 50) * this.world.scale;
      if (Phaser.Math.Distance.Between(q.x, q.y, bx, by) < 80 * this.world.scale) return id;
    }
    return null;
  }

  /** An isometric box: footprint half-width `a` (px), wall height `h`. Returns the roof-top centre y. */
  private box(g: Phaser.GameObjects.Graphics, cx: number, cy: number, a: number, h: number, left: number, right: number, top: number): number {
    const b = a / 2;
    g.lineStyle(3, INK, 1);
    g.fillStyle(left, 1);
    g.fillPoints([V(cx - a, cy - h), V(cx, cy + b - h), V(cx, cy + b), V(cx - a, cy)], true);
    g.strokePoints([V(cx - a, cy - h), V(cx, cy + b - h), V(cx, cy + b), V(cx - a, cy)], true);
    g.fillStyle(right, 1);
    g.fillPoints([V(cx, cy + b - h), V(cx + a, cy - h), V(cx + a, cy), V(cx, cy + b)], true);
    g.strokePoints([V(cx, cy + b - h), V(cx + a, cy - h), V(cx + a, cy), V(cx, cy + b)], true);
    g.fillStyle(top, 1);
    const roof = [V(cx, cy - b - h), V(cx + a, cy - h), V(cx, cy + b - h), V(cx - a, cy - h)];
    g.fillPoints(roof, true);
    g.strokePoints(roof, true);
    return cy - h;
  }

  /** A gabled roof over a box drawn with `box`. */
  private gable(g: Phaser.GameObjects.Graphics, cx: number, cy: number, a: number, h: number, peak: number, color: number, dark: number): void {
    const b = a / 2;
    const top = cy - h;
    g.lineStyle(3, INK, 1);
    g.fillStyle(dark, 1);
    const l = [V(cx - a - 4, top + 2), V(cx - a / 2, top - b / 2 - peak), V(cx + a / 2, top + b / 2 - peak), V(cx + 4, top + b + 2)];
    g.fillPoints(l, true);
    g.strokePoints(l, true);
    g.fillStyle(color, 1);
    const r = [V(cx + 4, top + b + 2), V(cx + a / 2, top + b / 2 - peak), V(cx + a + 4, top + 2), V(cx + a, top + 2)];
    g.fillPoints(r, true);
    g.strokePoints(r, true);
  }

  private badge(g: Phaser.GameObjects.Graphics, x: number, y: number, n: number): void {
    if (n <= 0) return;
    const bob = Math.sin(this.time.now / 250) * 3;
    g.lineStyle(3, INK, 1);
    g.fillStyle(0x5cb83a, 1);
    g.fillCircle(x, y + bob, 12);
    g.strokeCircle(x, y + bob, 12);
    g.lineStyle(3.5, 0xffffff, 1);
    g.lineBetween(x - 5, y + bob, x - 1, y + 4 + bob);
    g.lineBetween(x - 1, y + 4 + bob, x + 6, y - 4 + bob);
  }

  private drawBuildings(): void {
    const g = this.buildG;
    const s = this.game_.state;
    const now = this.game_.now();
    g.clear();
    const ready = (id: string) => (s.buildings[id] ? s.buildings[id].queue.filter((q) => now >= q.startsAt + q.durS).length : 0);

    // Bramblewick Mill, beyond the fence: a ruin, then scaffolding, then turning
    const mc = this.buildingCell('mill')!;
    const m = cellToScreen(mc.x, mc.y);
    const stage = s.projects.mill ?? 0;
    const working = !!s.buildings.mill;
    if (s.flags.includes('met_rufus') || stage > 0 || working) {
      if (!working && stage < 3) {
        // ruined walls
        this.box(g, m.sx, m.sy, 56, 36 + stage * 20, 0xb0a99a, 0x938c7e, 0x7d766a);
        if (stage >= 1) {
          g.lineStyle(3, 0x8b5a2b, 1);
          for (let i = -1; i <= 1; i++) g.lineBetween(m.sx + i * 32, m.sy + 16, m.sx + i * 32, m.sy - 100);
          g.lineBetween(m.sx - 44, m.sy - 58, m.sx + 44, m.sy - 58);
          g.lineBetween(m.sx - 44, m.sy - 90, m.sx + 44, m.sy - 90);
        }
      } else {
        this.box(g, m.sx, m.sy, 56, 80, 0xd9c7a3, 0xbfa985, 0xa38f6b);
        this.gable(g, m.sx, m.sy, 56, 80, 42, 0xc9483a, 0xa63a2f);
      }
      // water wheel on the right wall
      const wx = m.sx + 44;
      const wy = m.sy - 24;
      const turning = working ? this.time.now / 900 : 0.3;
      g.lineStyle(3, INK, 1);
      g.fillStyle(0x8b5a2b, 1);
      g.fillCircle(wx, wy, 32);
      g.strokeCircle(wx, wy, 32);
      g.fillStyle(0xc98a4b, 1);
      g.fillCircle(wx, wy, 22);
      g.lineStyle(3, INK, 1);
      for (let i = 0; i < 6; i++) {
        const a = turning + (i * Math.PI) / 3;
        g.lineBetween(wx, wy, wx + Math.cos(a) * 32, wy + Math.sin(a) * 32);
      }
      if (working) this.badge(g, m.sx, m.sy - 156, ready('mill'));
    }

    // farm buildings on the right
    if (s.buildings.jam_maker) {
      const c = this.buildingCell('jam_maker')!;
      const p = cellToScreen(c.x, c.y);
      this.box(g, p.sx, p.sy, 50, 52, 0xf3ede0, 0xd9d1bf, 0xc9c0ab);
      this.gable(g, p.sx, p.sy, 50, 52, 32, 0xe8323c, 0xc42630);
      g.lineStyle(2.5, INK, 1);
      g.fillStyle(0xd6304a, 1);
      g.fillRoundedRect(p.sx + 14, p.sy - 42, 20, 26, 4);
      g.strokeRoundedRect(p.sx + 14, p.sy - 42, 20, 26, 4);
      this.badge(g, p.sx, p.sy - 124, ready('jam_maker'));
    }
    if (s.buildings.bakery) {
      const c = this.buildingCell('bakery')!;
      const p = cellToScreen(c.x, c.y);
      this.box(g, p.sx, p.sy, 52, 60, 0xd27a4c, 0xb5633a, 0x9c5230);
      this.gable(g, p.sx, p.sy, 52, 60, 32, 0x6b4a8f, 0x553a73);
      g.lineStyle(3, INK, 1);
      g.fillStyle(0x9a9a9a, 1);
      g.fillRect(p.sx + 22, p.sy - 132, 14, 30);
      g.strokeRect(p.sx + 22, p.sy - 132, 14, 30);
      const puff = (this.time.now / 600) % 1;
      g.fillStyle(0xffffff, 0.8 - puff * 0.8);
      g.fillCircle(p.sx + 29, p.sy - 140 - puff * 24, 8 + puff * 8);
      this.badge(g, p.sx, p.sy - 140, ready('bakery'));
    }
  }

  // ── juice ───────────────────────────────────────────────────────

  private popText(k: string, text: string, color: string): void {
    const [x, y] = parseKey(k);
    const { sx, sy } = cellToScreen(x, y);
    const t = this.add
      .text(sx, sy - 30, text, { fontFamily: 'Lilita One, Fredoka, system-ui', fontSize: '22px', color, stroke: '#4a2e1a', strokeThickness: 6, resolution: this.dpr })
      .setOrigin(0.5);
    this.world.add(t);
    this.tweens.add({ targets: t, y: sy - 80, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
    this.tweens.add({ targets: t, scale: { from: 0.6, to: 1.15 }, duration: 180, yoyo: true, ease: 'Back.easeOut' });
  }

  private burst(k: string, color: number, count = 8): void {
    const [x, y] = parseKey(k);
    const { sx, sy } = cellToScreen(x, y);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const d = 22 + Math.random() * 18;
      const c = this.add.circle(sx, sy - 10, 4 + Math.random() * 3, color).setStrokeStyle(2, INK);
      this.world.add(c);
      this.tweens.add({
        targets: c,
        x: sx + Math.cos(a) * d,
        y: sy - 10 + Math.sin(a) * d * 0.6 - 14,
        scale: 0.2,
        alpha: 0,
        duration: 420,
        ease: 'Cubic.easeOut',
        onComplete: () => c.destroy(),
      });
    }
  }

  private coinFly(k: string, amount: number): void {
    const p = this.toScreen(k);
    this.game_.screenFx({ kind: 'coin-fly', x: p.x, y: p.y - 30, amount });
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

  private act(k: string): void {
    this.actedKeys.add(k);
    this.game_.tapPlot(k);
    this.flash(k);
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
    const b = this.buildingAt(p);
    if (b) {
      this.dragMode = 'none';
      this.game_.screenFx({ kind: 'open-building', id: b });
      return;
    }
    const k = this.plotAt(p);
    this.dragMode = k ? 'act' : 'pan';
    if (k) this.act(k);
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
      if (Phaser.Math.Distance.Between(q.x, q.y, this.downAt.x, this.downAt.y) < TAP_SLOP) return;
      const k = this.plotAt(p);
      if (k && !this.actedKeys.has(k)) this.act(k);
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
    const cx = width / 2;
    const cy = height / 2;
    this.world.x = cx - (cx - this.world.x) * (s / this.world.scale);
    this.world.y = cy - (cy - this.world.y) * (s / this.world.scale);
    this.world.setScale(s);
  }

  private flash(k: string): void {
    const [x, y] = parseKey(k);
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
