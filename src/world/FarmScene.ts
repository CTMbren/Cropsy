import * as Phaser from 'phaser';
import { hasFlag, isFresh, key, parseKey, stageOf, type ObstacleKind } from '../core/farm';
import { decorSpots, placed, spotCell } from '../core/decor';
import type { Game } from '../game';
import { ArtRegistry } from './art';
import { light, shade } from './paint';
import { cropBounds, drawCropArt } from './cropArt';
import { DIRT_SIDE_L, DIRT_SIDE_R, drawObstacleArt, drawOvergrown, drawSoil, OBSTACLE_BOUNDS, OVERGROWN_BOUNDS, SOIL_BOUNDS } from './tileArt';
import { cellToScreen, screenToCell, TILE_H, TILE_W } from './iso';

const INK = 0x4a2e1a; // thick dark-brown outline used on everything in the cartoon style
const GRASS = 0x7cc94f;
const GRASS_EDGE = 0x5aa83a;
const WOOD = 0xc98a4b;
const TAP_SLOP = 10;
/** Space reserved for the HUD above and the seed tray + nav below, in logical pixels. */
const UI_TOP = 116;
const UI_BOTTOM = 196;
/** Grass around the field, in tiles: room for the mill and farm buildings. */
const PAD = 2.7;
/** Zoom limits. Max is 2.0 so the planned 2× art atlases stay sharp (see graphics-update-plan). */
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.0;

/** Placeholder bounds around each sprite's anchor, in logical pixels (see ArtRegistry). */
/** Crops are shown a little larger than drawn so they read at phone size. */
const CROP_SCALE = 1.15;
const BUBBLE_BOUNDS = { left: -14, top: -18, right: 18, bottom: 14 };
const FERT_BOUNDS = { left: -10, top: -10, right: 10, bottom: 10 };
const SPARKLE_BOUNDS = { left: -5, top: -8, right: 5, bottom: 8 };
/** Ripe-bubble, fertilizer and sparkle positions relative to the plot centre. */
const BUBBLE_Y = -52;
const FERT_AT = { x: 30, y: -4 };
const SPARKLE_AT = { x: 23, y: -58 };

/** The sprites standing on one cell, kept alive between frames and only re-pointed on change. */
interface PlotView {
  k: string;
  sx: number;
  sy: number;
  soil: Phaser.GameObjects.Image;
  crop: Phaser.GameObjects.Image;
  fert: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Image;
  sparkle: Phaser.GameObjects.Image;
  /** What the view currently shows, so syncPlots only touches views that changed. */
  shown: string;
  ripe: boolean;
  fresh: boolean;
}

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
  /** Soil beds and overgrown patches, one sprite per cell, under the crops. */
  private soilLayer!: Phaser.GameObjects.Container;
  private buildG!: Phaser.GameObjects.Graphics;
  /** Crops, obstacles and their markers as pooled sprites, back to front. */
  private plotLayer!: Phaser.GameObjects.Container;
  private views: PlotView[] = [];
  private viewsSize = '';
  private art!: ArtRegistry;
  private decoG!: Phaser.GameObjects.Graphics;
  /** Per-plot pop-in animations (planting), keyed by cell, with their start time. */
  private pops = new Map<string, number>();
  private combo = { n: 0, at: 0 };
  private coachG!: Phaser.GameObjects.Graphics;
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
  /** `?debug` performance overlay: FPS, frame time and the cost of the periodic vector redraw. */
  private perfText?: Phaser.GameObjects.Text;
  private perf = { frames: 0, frameMs: 0, redraws: 0, redrawMs: 0, redrawMax: 0, at: 0 };

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
    this.soilLayer = this.add.container(0, 0);
    this.buildG = this.add.graphics();
    this.plotLayer = this.add.container(0, 0);
    // bake placeholders at device pixels for max zoom, so they stay as crisp as the vector drawing
    this.art = new ArtRegistry(this, Math.min(4, Math.ceil(this.dpr * MAX_ZOOM)));
    this.decoG = this.add.graphics();
    this.coachG = this.add.graphics();
    this.highlight = this.add.graphics();
    this.world.add([this.ground, this.buildG, this.soilLayer, this.coachG, this.plotLayer, this.decoG, this.highlight]);

    if (this.registry.get('debug')) {
      this.perfText = this.add
        .text(8, UI_TOP + 4, '', { fontFamily: 'monospace', fontSize: '11px', color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 4, y: 3 } })
        .setDepth(1000);
    }

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
        // drag-harvest combos
        const t = this.time.now;
        this.combo = t - this.combo.at < 700 ? { n: this.combo.n + 1, at: t } : { n: 1, at: t };
        if (this.combo.n >= 3 && [3, 5, 8, 12, 16, 20, 25, 30].includes(this.combo.n)) this.popCombo(e.key, this.combo.n);
        navigator.vibrate?.(8);
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
      if (e.kind === 'plant') {
        this.burst(e.key, 0x7a4626, 5);
        this.pops.set(e.key, this.time.now);
      }
      if (e.kind === 'decor') {
        const c = spotCell(this.game_.state, e.spot);
        this.burst(`${c.x},${c.y}`, e.placed ? 0xffe14d : 0xffffff, e.placed ? 10 : 5);
      }
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

  update(t: number, dt: number): void {
    this.sparkleT += dt;
    if (this.sparkleT > 120) {
      this.sparkleT = 0;
      const t0 = performance.now();
      this.drawBuildings();
      this.drawDecor();
      this.drawCoach();
      if (this.perfText) {
        const ms = performance.now() - t0;
        this.perf.redraws++;
        this.perf.redrawMs += ms;
        this.perf.redrawMax = Math.max(this.perf.redrawMax, ms);
      }
    }
    this.animatePlots(t);
    if (this.perfText) this.updatePerf(t, dt);
  }

  /** Refreshes the debug overlay twice a second with averages over that window. */
  private updatePerf(t: number, dt: number): void {
    const p = this.perf;
    p.frames++;
    p.frameMs += dt;
    if (t - p.at < 500) return;
    const s = this.game_.state;
    const plots = Object.keys(s.plots).length;
    const avgRedraw = p.redraws ? p.redrawMs / p.redraws : 0;
    this.perfText!.setText(
      [
        `fps ${this.game.loop.actualFps.toFixed(0)}  frame ${(p.frameMs / p.frames).toFixed(1)}ms`,
        `redraw ${avgRedraw.toFixed(2)}ms avg  ${p.redrawMax.toFixed(2)}ms max`,
        `plots ${plots}  zoom ${this.world.scale.toFixed(2)}  dpr ${this.dpr}`,
      ].join('\n'),
    );
    Object.assign(p, { frames: 0, frameMs: 0, redraws: 0, redrawMs: 0, redrawMax: 0, at: t });
  }

  /** Pulsing outlines on the plots the first-minutes hint is talking about. */
  private drawCoach(): void {
    const g = this.coachG;
    g.clear();
    const hint = this.game_.coach();
    if (!hint?.farm) return;
    const s = this.game_.state;
    const now = this.game_.now();
    const pulse = 0.55 + Math.sin(this.time.now / 220) * 0.35;
    g.lineStyle(4, 0xffffff, pulse);
    for (const k of Object.keys(s.plots)) {
      const p = s.plots[k];
      const ob = s.obstacles[k];
      const want = hint.farm === 'weeds' ? ob === 'weeds' : hint.farm === 'empty' ? !ob && !p.crop : !ob && !!p.crop && stageOf(p, now) === 'ripe';
      if (!want) continue;
      const [x, y] = parseKey(k);
      const { sx, sy } = cellToScreen(x, y);
      const grow = 1 + (1 - pulse) * 0.08;
      g.strokePoints(this.diamond(sx, sy, TILE_W * 0.92 * grow, TILE_H * 0.92 * grow), true);
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
    this.world.setScale(Phaser.Math.Clamp(fit, MIN_ZOOM, MAX_ZOOM));
    this.world.setPosition(width / 2 - mid.sx * this.world.scale, UI_TOP + availH / 2 - mid.sy * this.world.scale + 10);
    this.drawGround();
    this.buildViews();
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
    const [n, e, so, w] = [corner(-pad, -pad), corner(s.width - 1 + pad, -pad), corner(s.width - 1 + pad, s.height - 1 + pad), corner(-pad, s.height - 1 + pad)];
    const down = (p: Phaser.Math.Vector2, d: number) => V(p.x, p.y + d);
    // the island's edge: a grass lip over layered earth, lit on the left face
    const LIP = 6;
    const CLIFF = 22;
    g.fillStyle(DIRT_SIDE_L, 1);
    g.fillPoints([w, so, down(so, CLIFF), down(w, CLIFF)], true);
    g.fillStyle(DIRT_SIDE_R, 1);
    g.fillPoints([so, e, down(e, CLIFF), down(so, CLIFF)], true);
    g.fillStyle(shade(DIRT_SIDE_L, 0.2), 1);
    g.fillPoints([down(w, 15), down(so, 15), down(so, CLIFF), down(w, CLIFF)], true);
    g.fillStyle(shade(DIRT_SIDE_R, 0.2), 1);
    g.fillPoints([down(so, 15), down(e, 15), down(e, CLIFF), down(so, CLIFF)], true);
    g.fillStyle(GRASS_EDGE, 1);
    g.fillPoints([w, so, down(so, LIP), down(w, LIP)], true);
    g.fillStyle(shade(GRASS_EDGE, 0.12), 1);
    g.fillPoints([so, e, down(e, LIP), down(so, LIP)], true);
    // pebbles in the earth
    for (let i = 0; i < 18; i++) {
      const t = ((i * 37) % 100) / 100;
      const leftFace = i % 2 === 0;
      const p = leftFace ? Phaser.Math.LinearXY(w, so, t) : Phaser.Math.LinearXY(so, e, t);
      g.fillStyle(shade(leftFace ? DIRT_SIDE_L : DIRT_SIDE_R, 0.35), 1);
      g.fillEllipse(p.x, p.y + 10 + (i % 3) * 3, 5, 2.6);
    }
    // lawn
    g.fillStyle(GRASS, 1);
    g.fillPoints([n, e, so, w], true);
    // mown checkerboard, one tile per cell
    g.fillStyle(light(GRASS, 0.07), 1);
    for (let y = -2; y <= s.height + 1; y++) {
      for (let x = -2; x <= s.width + 1; x++) {
        if ((x + y) % 2 === 0) continue;
        const c = cellToScreen(x, y);
        g.fillPoints(this.diamond(c.sx, c.sy), true);
      }
    }
    g.lineStyle(4, INK, 1);
    g.strokePoints([n, e, down(e, CLIFF), down(so, CLIFF), down(w, CLIFF), w], true);
    g.lineBetween(w.x, w.y, so.x, so.y);
    g.lineBetween(so.x, so.y, e.x, e.y);
    g.lineBetween(so.x, so.y, so.x, so.y + CLIFF);
    // tufts and flowers on the grass around the field (the field itself is covered by plots)
    const inField = (cx: number, cy: number) => cx > -0.7 && cy > -0.7 && cx < s.width - 0.3 && cy < s.height - 0.3;
    for (let i = 0; i < 60; i++) {
      const a = ((i * 97) % 100) / 100;
      const b = ((i * 53 + 17) % 100) / 100;
      const cx = -pad + 0.3 + a * (s.width + 2 * pad - 1.6);
      const cy = -pad + 0.3 + b * (s.height + 2 * pad - 1.6);
      if (inField(cx, cy)) continue;
      const c = cellToScreen(cx, cy);
      if (i % 5 === 0) {
        const petal = [0xffffff, 0xffe14d, 0xf48fb1, 0xb39ddb][i % 4];
        g.fillStyle(petal, 1);
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2;
          g.fillCircle(c.sx + Math.cos(ang) * 2.2, c.sy - 3 + Math.sin(ang) * 1.6, 1.6);
        }
        g.fillStyle(0xffb300, 1);
        g.fillCircle(c.sx, c.sy - 3, 1.1);
      } else {
        g.lineStyle(2, GRASS_EDGE, 1);
        g.lineBetween(c.sx - 3, c.sy, c.sx - 1.5, c.sy - 6);
        g.lineBetween(c.sx + 2, c.sy, c.sx + 3, c.sy - 5);
        g.lineStyle(1.6, light(GRASS, 0.25), 1);
        g.lineBetween(c.sx - 0.5, c.sy, c.sx + 0.5, c.sy - 7);
      }
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
      // two faces, lit left, with a lighter cut top
      g.fillStyle(WOOD, 1);
      g.fillRect(p.x - 3.5, p.y - 20, 4, 20);
      g.fillStyle(shade(WOOD, 0.25), 1);
      g.fillRect(p.x + 0.5, p.y - 20, 3, 20);
      g.fillStyle(light(WOOD, 0.3), 1);
      g.fillRect(p.x - 3.5, p.y - 22, 7, 2.5);
      g.lineStyle(2, INK, 1);
      g.strokeRect(p.x - 3.5, p.y - 22, 7, 22);
    };
    const rail = (p: Phaser.Math.Vector2, q: Phaser.Math.Vector2) => {
      for (const h of [14, 7]) {
        g.lineStyle(6.5, INK, 1);
        g.lineBetween(p.x, p.y - h, q.x, q.y - h);
        g.lineStyle(4, WOOD, 1);
        g.lineBetween(p.x, p.y - h, q.x, q.y - h);
        g.lineStyle(1.3, light(WOOD, 0.3), 1);
        g.lineBetween(p.x, p.y - h - 1.2, q.x, q.y - h - 1.2);
      }
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
    this.syncPlots();
    this.drawDecor();
  }

  /** One pooled view per cell, created back to front so later cells draw over earlier ones. */
  private buildViews(): void {
    const s = this.game_.state;
    const size = `${s.width}x${s.height}`;
    if (size === this.viewsSize) return;
    this.viewsSize = size;
    this.plotLayer.removeAll(true);
    this.soilLayer.removeAll(true);
    this.views = [];
    const cells: [number, number][] = [];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) cells.push([x, y]);
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1])); // back to front
    const img = (x: number, y: number) => this.add.image(x, y, '__DEFAULT').setVisible(false);
    for (const [x, y] of cells) {
      const { sx, sy } = cellToScreen(x, y);
      const v: PlotView = {
        k: key(x, y),
        sx,
        sy,
        soil: img(sx, sy),
        crop: img(sx, sy),
        fert: img(sx + FERT_AT.x, sy + FERT_AT.y),
        bubble: img(sx, sy + BUBBLE_Y),
        sparkle: img(sx + SPARKLE_AT.x, sy + SPARKLE_AT.y),
        shown: '',
        ripe: false,
        fresh: false,
      };
      this.soilLayer.add(v.soil);
      this.plotLayer.add([v.crop, v.fert, v.bubble, v.sparkle]);
      this.views.push(v);
    }
    this.syncPlots();
  }

  /** Points each view at the art for its plot's current state. Runs on state change and once a second. */
  private syncPlots(): void {
    const s = this.game_.state;
    const now = this.game_.now();
    for (const v of this.views) {
      const plot = s.plots[v.k];
      const ob = s.obstacles[v.k];
      const stage = !ob && plot?.crop ? stageOf(plot, now) : 'empty';
      const fresh = stage === 'ripe' && isFresh(plot!, now);
      const fert = !ob && !!plot?.fertilized && stage !== 'ripe' && stage !== 'empty';
      const cropKey = ob ? this.obstacleArt(ob, v.k) : stage !== 'empty' ? this.cropArt(plot!.crop!, stage) : '';
      const soilKey = !plot ? '' : ob ? this.tileArt('overgrown') : this.tileArt('soil', plot.soil ?? 0);
      const shown = `${soilKey}|${cropKey}|${fert}|${fresh}`;
      v.ripe = stage === 'ripe';
      v.fresh = fresh;
      if (shown === v.shown) continue;
      v.shown = shown;
      this.show(v.soil, soilKey);
      this.show(v.crop, cropKey);
      this.show(v.fert, fert ? this.markerArt('fertilizer') : '');
      this.show(v.bubble, v.ripe ? this.bubbleArt(plot!.crop!, fresh) : '');
      this.show(v.sparkle, fresh ? this.markerArt('sparkle') : '');
      if (!v.ripe) v.crop.x = v.sx;
    }
  }

  private show(img: Phaser.GameObjects.Image, artKey: string): void {
    if (!artKey || !this.art.apply(img, artKey)) {
      img.setVisible(false);
      return;
    }
    img.setScale(img.getData('artScale') as number).setVisible(true);
  }

  /** Per-frame motion only (no redrawing): ripe sway, bubble bob, fresh sparkle blink, planting pop. */
  private animatePlots(time: number): void {
    const bob = Math.sin(time / 250) * 3;
    const blink = Math.floor(time / 400) % 2 === 0;
    for (const v of this.views) {
      const k = this.pops.size ? this.popScale(v.k) : 1;
      if (k !== 1 || v.crop.getData('popping')) {
        v.crop.setScale((v.crop.getData('artScale') as number) * k);
        v.crop.setData('popping', k !== 1);
      }
      if (!v.ripe) continue;
      v.crop.x = v.sx + Math.sin(time / 400 + v.sx) * 1.5 * k;
      v.bubble.y = v.sy + BUBBLE_Y + bob;
      if (v.fresh) v.sparkle.setVisible(blink);
    }
  }

  private cropArt(id: string, stage: Exclude<ReturnType<typeof stageOf>, 'empty'>): string {
    const k = `crop/${id}/${stage}`;
    if (!this.art.has(k)) {
      const def = this.game_.content.cropById.get(id);
      if (def) this.art.placeholder(k, cropBounds(id), (g, cx, cy) => drawCropArt(g, id, stage, hex(def.leaf), hex(def.color), cx, cy), CROP_SCALE);
    }
    return k;
  }

  private tileArt(kind: 'soil' | 'overgrown', tier = 0): string {
    if (kind === 'overgrown') {
      this.art.placeholder('tile/overgrown', OVERGROWN_BOUNDS, (g, cx, cy) => drawOvergrown(g, cx, cy));
      return 'tile/overgrown';
    }
    const k = `tile/soil/${tier}`;
    this.art.placeholder(k, SOIL_BOUNDS, (g, cx, cy) => drawSoil(g, cx, cy, tier));
    return k;
  }

  private obstacleArt(kind: ObstacleKind, cell: string): string {
    // weeds come in two shades so a field of them doesn't look stamped
    const [x, y] = parseKey(cell);
    const alt = kind === 'weeds' && (x * 7 + y * 13) % 2 === 1;
    const k = `obstacle/${kind}${alt ? '/b' : ''}`;
    this.art.placeholder(k, OBSTACLE_BOUNDS, (g, cx, cy) => drawObstacleArt(g, kind, cx, cy, alt));
    return k;
  }

  private bubbleArt(cropId: string, fresh: boolean): string {
    const k = `marker/bubble${fresh ? '-fresh' : ''}/${cropId}`;
    if (!this.art.has(k)) {
      const def = this.game_.content.cropById.get(cropId);
      this.art.placeholder(k, BUBBLE_BOUNDS, (g, cx, cy) => this.drawBubble(g, def ? hex(def.color) : 0xffffff, fresh, cx, cy));
    }
    return k;
  }

  private markerArt(id: 'fertilizer' | 'sparkle'): string {
    const k = `marker/${id}`;
    if (id === 'fertilizer') this.art.placeholder(k, FERT_BOUNDS, (g, cx, cy) => this.drawFertilizer(g, cx, cy));
    else this.art.placeholder(k, SPARKLE_BOUNDS, (g, cx, cy) => this.drawSparkle(g, cx, cy));
    return k;
  }

  /** Squash-and-stretch for a freshly planted plot: grows from small with a little overshoot. */
  private popScale(k: string): number {
    const start = this.pops.get(k);
    if (start === undefined) return 1;
    const t = (this.time.now - start) / 380;
    if (t >= 1) {
      this.pops.delete(k);
      return 1;
    }
    const back = 1.70158;
    const u = t - 1;
    return 0.3 + 0.7 * (1 + (back + 1) * u * u * u + back * u * u);
  }

  /** The ripe bubble; a star marks a Fresh Pick so it doesn't rely on the yellow alone. */
  private drawBubble(g: Phaser.GameObjects.Graphics, fruit: number, fresh: boolean, cx: number, cy: number): void {
    g.lineStyle(3, INK, 1);
    g.fillStyle(fresh ? 0xffe14d : 0xffffff, 1);
    g.fillCircle(cx, cy, 10);
    g.strokeCircle(cx, cy, 10);
    g.fillStyle(fruit, 1);
    g.fillCircle(cx, cy, 5);
    if (!fresh) return;
    g.fillStyle(0xffffff, 1);
    g.lineStyle(1.5, INK, 1);
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? 6 * 0.45 : 6;
      pts.push(V(cx + 9 + Math.cos(a) * rr, cy - 9 + Math.sin(a) * rr));
    }
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }

  private drawFertilizer(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.lineStyle(2.5, INK, 1);
    g.fillStyle(0x7cdc4f, 1);
    g.fillCircle(cx, cy, 7);
    g.strokeCircle(cx, cy, 7);
    g.lineStyle(2.5, 0xffffff, 1);
    g.lineBetween(cx - 4, cy, cx + 4, cy);
    g.lineBetween(cx, cy - 4, cx, cy + 4);
  }

  private drawSparkle(g: Phaser.GameObjects.Graphics, cx: number, cy: number): void {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(cx - 3, cy, cx, cy + 6, cx + 3, cy);
    g.fillTriangle(cx - 3, cy, cx, cy - 6, cx + 3, cy);
  }

  // ── buildings ───────────────────────────────────────────────────

  /** Where each building stands, in (fractional) cell coordinates, outside the fence. */
  private buildingCell(id: string): { x: number; y: number } | null {
    if (id === 'mill') return { x: -2.3, y: 0.8 };
    if (id === 'jam_maker') return { x: 1.0, y: -2.2 };
    if (id === 'bakery') return { x: 3.2, y: -2.2 };
    return null;
  }

  // ── decorations ─────────────────────────────────────────────────

  private spotAt(p: Phaser.Input.Pointer): string | null {
    const q = this.pt(p);
    const s = this.game_.state;
    let best: string | null = null;
    let bestD = 46 * this.world.scale;
    for (const spot of decorSpots(s)) {
      const c = spotCell(s, spot);
      const { sx, sy } = cellToScreen(c.x, c.y);
      const d = Phaser.Math.Distance.Between(q.x, q.y, this.world.x + sx * this.world.scale, this.world.y + (sy - 12) * this.world.scale);
      if (d < bestD) {
        bestD = d;
        best = spot;
      }
    }
    return best;
  }

  private drawDecor(): void {
    const g = this.decoG;
    const s = this.game_.state;
    g.clear();
    const editing = this.game_.mode === 'decorate';
    const spots = decorSpots(s);
    const items = placed(s);
    // back to front so nearer decorations overlap farther ones
    const order = [...spots].sort((a, b) => {
      const ca = spotCell(s, a);
      const cb = spotCell(s, b);
      return ca.x + ca.y - (cb.x + cb.y);
    });
    for (const spot of order) {
      const c = spotCell(s, spot);
      const { sx, sy } = cellToScreen(c.x, c.y);
      if (editing) {
        const d = this.diamond(sx, sy, TILE_W * 0.7, TILE_H * 0.7);
        g.fillStyle(0xffffff, items[spot] ? 0.15 : 0.35);
        g.fillPoints(d, true);
        g.lineStyle(2.5, 0xffffff, 0.9);
        g.strokePoints(d, true);
      }
      if (items[spot]) this.drawDecoration(g, items[spot], sx, sy);
    }
  }

  /** Placeholder vector art for each decoration, in the thick-outline style. */
  private drawDecoration(g: Phaser.GameObjects.Graphics, id: string, x: number, y: number): void {
    const t = this.time.now;
    g.lineStyle(3, INK, 1);
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(x, y + 2, 56, 16);
    g.lineStyle(3, INK, 1);
    switch (id) {
      case 'flowerbed': {
        g.fillStyle(0x7a4626, 1);
        g.fillEllipse(x, y - 4, 54, 22);
        g.strokeEllipse(x, y - 4, 54, 22);
        const cols = [0xe8506a, 0xffd54f, 0xf2f2f2, 0xb36ad6, 0xe8506a];
        cols.forEach((col, i) => {
          const fx = x - 18 + i * 9;
          const fy = y - 10 - (i % 2) * 5;
          g.fillStyle(0x4caf50, 1);
          g.fillRect(fx - 1, fy, 2, 8);
          g.fillStyle(col, 1);
          g.fillCircle(fx, fy, 5);
          g.lineStyle(2, INK, 1);
          g.strokeCircle(fx, fy, 5);
        });
        break;
      }
      case 'hay': {
        for (const [dx, dy] of [[-14, 0], [14, 0], [0, -18]]) {
          g.fillStyle(0xf2c230, 1);
          g.fillRoundedRect(x + dx - 16, y + dy - 22, 32, 20, 5);
          g.strokeRoundedRect(x + dx - 16, y + dy - 22, 32, 20, 5);
          g.lineStyle(2, 0xc9a227, 1);
          g.lineBetween(x + dx - 8, y + dy - 20, x + dx - 8, y + dy - 4);
          g.lineBetween(x + dx + 8, y + dy - 20, x + dx + 8, y + dy - 4);
          g.lineStyle(3, INK, 1);
        }
        break;
      }
      case 'bench': {
        g.fillStyle(0x8b5a2b, 1);
        g.fillRect(x - 22, y - 14, 5, 14);
        g.strokeRect(x - 22, y - 14, 5, 14);
        g.fillRect(x + 17, y - 14, 5, 14);
        g.strokeRect(x + 17, y - 14, 5, 14);
        g.fillStyle(0xc98a4b, 1);
        g.fillRoundedRect(x - 28, y - 22, 56, 9, 3);
        g.strokeRoundedRect(x - 28, y - 22, 56, 9, 3);
        g.fillRoundedRect(x - 28, y - 40, 56, 9, 3);
        g.strokeRoundedRect(x - 28, y - 40, 56, 9, 3);
        break;
      }
      case 'scarecrow': {
        const sway = Math.sin(t / 900) * 2;
        g.lineStyle(5, INK, 1);
        g.lineBetween(x, y, x, y - 56);
        g.lineBetween(x - 24 + sway, y - 40, x + 24 + sway, y - 40);
        g.lineStyle(3, INK, 1);
        g.fillStyle(0x3f7fd0, 1);
        g.fillRoundedRect(x - 12 + sway, y - 46, 24, 26, 4);
        g.strokeRoundedRect(x - 12 + sway, y - 46, 24, 26, 4);
        g.fillStyle(0xf2d29b, 1);
        g.fillCircle(x + sway, y - 56, 10);
        g.strokeCircle(x + sway, y - 56, 10);
        g.fillStyle(0xc0562a, 1);
        g.fillTriangle(x - 16 + sway, y - 62, x + 16 + sway, y - 62, x + sway, y - 80);
        g.strokeTriangle(x - 16 + sway, y - 62, x + 16 + sway, y - 62, x + sway, y - 80);
        break;
      }
      case 'lamp': {
        g.fillStyle(0x4a4a4a, 1);
        g.fillRect(x - 3, y - 60, 6, 60);
        g.strokeRect(x - 3, y - 60, 6, 60);
        const glow = 0.25 + Math.sin(t / 600) * 0.1;
        g.fillStyle(0xffe14d, glow);
        g.fillCircle(x, y - 68, 22);
        g.fillStyle(0xffd54f, 1);
        g.fillRoundedRect(x - 9, y - 78, 18, 20, 4);
        g.strokeRoundedRect(x - 9, y - 78, 18, 20, 4);
        g.fillStyle(0x4a4a4a, 1);
        g.fillTriangle(x - 13, y - 78, x + 13, y - 78, x, y - 88);
        g.strokeTriangle(x - 13, y - 78, x + 13, y - 78, x, y - 88);
        break;
      }
      case 'beehive': {
        g.fillStyle(0x8b5a2b, 1);
        g.fillRect(x - 3, y - 18, 6, 18);
        g.strokeRect(x - 3, y - 18, 6, 18);
        for (let i = 0; i < 3; i++) {
          const w = 34 - i * 8;
          g.fillStyle(0xf5b32a, 1);
          g.fillEllipse(x, y - 24 - i * 11, w, 14);
          g.strokeEllipse(x, y - 24 - i * 11, w, 14);
        }
        g.fillStyle(INK, 1);
        g.fillCircle(x, y - 24, 3);
        const bx = x + Math.cos(t / 300) * 22;
        const by = y - 48 + Math.sin(t / 200) * 8;
        g.fillStyle(0xffd54f, 1);
        g.fillCircle(bx, by, 3.5);
        g.lineStyle(1.5, INK, 1);
        g.strokeCircle(bx, by, 3.5);
        break;
      }
      case 'pumpkins': {
        for (const [dx, dy, r] of [[-14, 0, 14], [14, 0, 14], [0, -20, 12]]) {
          g.fillStyle(0xf57c00, 1);
          g.fillEllipse(x + dx, y + dy - 12, r * 2.2, r * 1.7);
          g.strokeEllipse(x + dx, y + dy - 12, r * 2.2, r * 1.7);
          g.lineStyle(2, 0xc45f00, 1);
          g.lineBetween(x + dx, y + dy - 12 - r * 0.8, x + dx, y + dy - 12 + r * 0.8);
          g.lineStyle(3, INK, 1);
          g.fillStyle(0x558b2f, 1);
          g.fillRect(x + dx - 2, y + dy - 12 - r * 0.85 - 6, 4, 7);
        }
        break;
      }
      case 'windmill': {
        this.box(g, x, y, 18, 50, 0xf3ede0, 0xd9d1bf, 0xc9c0ab);
        g.fillStyle(0xc9483a, 1);
        g.fillTriangle(x - 20, y - 50, x + 20, y - 50, x, y - 74);
        g.strokeTriangle(x - 20, y - 50, x + 20, y - 50, x, y - 74);
        const a0 = t / 800;
        for (let i = 0; i < 4; i++) {
          const a = a0 + (i * Math.PI) / 2;
          const ex = x + Math.cos(a) * 34;
          const ey = y - 56 + Math.sin(a) * 34;
          g.lineStyle(6, INK, 1);
          g.lineBetween(x, y - 56, ex, ey);
          g.lineStyle(3, 0xffffff, 1);
          g.lineBetween(x, y - 56, ex, ey);
        }
        g.lineStyle(3, INK, 1);
        g.fillStyle(0x8b5a2b, 1);
        g.fillCircle(x, y - 56, 5);
        g.strokeCircle(x, y - 56, 5);
        break;
      }
      case 'fountain': {
        g.fillStyle(0xb0a99a, 1);
        g.fillEllipse(x, y - 8, 60, 26);
        g.strokeEllipse(x, y - 8, 60, 26);
        g.fillStyle(0x7cc4f5, 1);
        g.fillEllipse(x, y - 11, 48, 17);
        g.fillStyle(0xb0a99a, 1);
        g.fillRect(x - 5, y - 40, 10, 30);
        g.strokeRect(x - 5, y - 40, 10, 30);
        g.fillEllipse(x, y - 42, 24, 9);
        g.strokeEllipse(x, y - 42, 24, 9);
        const ph = (t / 400) % 1;
        g.fillStyle(0xbfe6ff, 0.9 - ph * 0.6);
        for (const dx of [-12, 0, 12]) g.fillCircle(x + dx * (0.4 + ph), y - 50 - Math.sin(ph * Math.PI) * 14, 3.5);
        break;
      }
      case 'statue': {
        g.fillStyle(0xb0a99a, 1);
        this.box(g, x, y, 22, 18, 0xc9c0ab, 0xb0a99a, 0xd9d1bf);
        const shine = Math.sin(t / 500) > 0.6 ? 0xfff1a8 : 0xffc531;
        g.fillStyle(0xffc531, 1);
        g.fillRoundedRect(x - 12, y - 52, 24, 34, 8);
        g.strokeRoundedRect(x - 12, y - 52, 24, 34, 8);
        g.fillCircle(x, y - 62, 11);
        g.strokeCircle(x, y - 62, 11);
        g.fillStyle(shine, 1);
        g.fillCircle(x - 4, y - 66, 3);
        // Tobias's hat
        g.fillStyle(0xd9a521, 1);
        g.fillEllipse(x, y - 70, 30, 8);
        g.strokeEllipse(x, y - 70, 30, 8);
        g.fillRoundedRect(x - 8, y - 82, 16, 12, 3);
        g.strokeRoundedRect(x - 8, y - 82, 16, 12, 3);
        break;
      }
    }
  }

  /** Moss naps just outside the fence, on the left. */
  private mossCell(): { x: number; y: number } {
    return { x: -1.3, y: this.game_.state.height - 1.2 };
  }

  private mossAt(p: Phaser.Input.Pointer): boolean {
    if (!this.game_.state.flags.includes('moss_visits')) return false;
    const q = this.pt(p);
    const c = this.mossCell();
    const { sx, sy } = cellToScreen(c.x, c.y);
    const mx = this.world.x + sx * this.world.scale;
    const my = this.world.y + (sy - 14) * this.world.scale;
    return Phaser.Math.Distance.Between(q.x, q.y, mx, my) < 40 * this.world.scale;
  }

  private drawMoss(g: Phaser.GameObjects.Graphics): void {
    const s = this.game_.state;
    if (!s.flags.includes('moss_visits')) return;
    const c = this.mossCell();
    const { sx: x, sy: y } = cellToScreen(c.x, c.y);
    const t = this.time.now;
    const wag = Math.sin(t / 120) * 0.5;
    const breathe = Math.sin(t / 700) * 1.2;
    g.lineStyle(3, INK, 1);
    // shadow
    g.fillStyle(0x000000, 0.15);
    g.fillEllipse(x, y + 4, 52, 14);
    // tail
    g.lineStyle(6, INK, 1);
    g.lineBetween(x + 16, y - 12, x + 16 + Math.cos(-1.2 + wag) * 16, y - 12 + Math.sin(-1.2 + wag) * 16);
    g.lineStyle(3.5, 0xc98a4b, 1);
    g.lineBetween(x + 16, y - 12, x + 16 + Math.cos(-1.2 + wag) * 15, y - 12 + Math.sin(-1.2 + wag) * 15);
    // body
    g.lineStyle(3, INK, 1);
    g.fillStyle(0xc98a4b, 1);
    g.fillEllipse(x + 2, y - 10 - breathe / 2, 40, 22 + breathe);
    g.strokeEllipse(x + 2, y - 10 - breathe / 2, 40, 22 + breathe);
    g.fillStyle(0xf3e1c4, 1);
    g.fillEllipse(x - 4, y - 6, 18, 10);
    // head
    g.fillStyle(0xc98a4b, 1);
    g.fillCircle(x - 16, y - 24, 12);
    g.strokeCircle(x - 16, y - 24, 12);
    g.fillStyle(0x8b5a2b, 1);
    g.fillEllipse(x - 8, y - 26, 8, 16);
    g.strokeEllipse(x - 8, y - 26, 8, 16);
    g.fillStyle(0xf3e1c4, 1);
    g.fillEllipse(x - 24, y - 20, 12, 9);
    g.fillStyle(INK, 1);
    g.fillCircle(x - 29, y - 21, 2.5);
    g.fillCircle(x - 19, y - 27, 2);
    // a bone bubble when he has something to dig up
    const day = this.game_.day();
    const left = s.moss?.day === day ? (s.flags.includes('perk:juniper') ? 2 : 1) - s.moss.digs : s.flags.includes('perk:juniper') ? 2 : 1;
    if (left > 0) {
      const bob = Math.sin(t / 250) * 3;
      g.lineStyle(3, INK, 1);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x - 16, y - 58 + bob, 14);
      g.strokeCircle(x - 16, y - 58 + bob, 14);
      g.lineStyle(2.5, INK, 1);
      g.fillStyle(0xf8f1e0, 1);
      g.fillRoundedRect(x - 24, y - 61 + bob, 16, 6, 3);
      g.fillCircle(x - 25, y - 61 + bob, 3);
      g.fillCircle(x - 25, y - 55 + bob, 3);
      g.fillCircle(x - 7, y - 61 + bob, 3);
      g.fillCircle(x - 7, y - 55 + bob, 3);
    }
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
    this.drawMoss(g);
  }

  // ── juice ───────────────────────────────────────────────────────

  private popCombo(k: string, n: number): void {
    const [x, y] = parseKey(k);
    const { sx, sy } = cellToScreen(x, y);
    const t = this.add
      .text(sx, sy - 70, `Combo ×${n}!`, { fontFamily: 'Lilita One, Fredoka, system-ui', fontSize: n >= 10 ? '34px' : '28px', color: '#ffe14d', stroke: '#4a2e1a', strokeThickness: 7, resolution: this.dpr })
      .setOrigin(0.5)
      .setAngle(-6);
    this.world.add(t);
    this.tweens.add({ targets: t, scale: { from: 0.4, to: 1 }, duration: 260, ease: 'Back.easeOut' });
    this.tweens.add({ targets: t, y: sy - 120, alpha: 0, delay: 500, duration: 600, ease: 'Cubic.easeIn', onComplete: () => t.destroy() });
    if (n >= 8) this.cameras.main.shake(120, 0.002);
  }

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
    if (this.game_.mode === 'decorate') {
      this.dragMode = 'pan';
      const spot = this.spotAt(p);
      if (spot) {
        this.dragMode = 'none';
        this.game_.tapSpot(spot);
      }
      return;
    }
    if (this.mossAt(p)) {
      this.dragMode = 'none';
      this.game_.patMoss();
      return;
    }
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
    const s = Phaser.Math.Clamp(this.world.scale * f, MIN_ZOOM, MAX_ZOOM);
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
