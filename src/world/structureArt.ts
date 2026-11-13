import { ball, contact, ellipsePts, INK, leaf, light, poly, shade, stem, twinkle, V, type G, type Pt } from './paint';

/**
 * Code-drawn farm structures (buildings, decorations, Moss), baked once by the ArtRegistry. Moving
 * parts (water wheel, windmill blades, smoke, the bee, fountain spray, lamp glow, Moss's tail) are
 * drawn as separate pieces so the scene can animate them without redrawing anything.
 */

type Texture = 'stone' | 'plaster' | 'brick' | 'timber';

interface Box {
  cx: number;
  cy: number;
  /** Footprint half-width (px); the half-depth is a / 2. */
  a: number;
  /** Wall height. */
  h: number;
}

const L = (b: Box, u: number, v: number): Pt => V(b.cx - b.a + b.a * u, b.cy + (b.a / 2) * u - v);
const R = (b: Box, u: number, v: number): Pt => V(b.cx + b.a * u, b.cy + b.a / 2 - (b.a / 2) * u - v);

/** Two lit/shaded walls with a surface texture and ink outline. */
function walls(g: G, b: Box, color: number, tex: Texture, h = b.h): void {
  const left = [L(b, 0, 0), L(b, 1, 0), L(b, 1, h), L(b, 0, h)];
  const right = [R(b, 0, 0), R(b, 1, 0), R(b, 1, h), R(b, 0, h)];
  const lc = light(color, 0.06);
  const rc = shade(color, 0.2);
  poly(g, left, lc, 0);
  poly(g, right, rc, 0);
  // texture lines follow each face
  const face = (P: (u: number, v: number) => Pt, c: number) => {
    g.lineStyle(1.2, shade(c, 0.22), 0.9);
    if (tex === 'stone' || tex === 'brick') {
      const row = tex === 'brick' ? 7 : 11;
      const cols = tex === 'brick' ? 6 : 4;
      for (let v = row, r = 0; v < h - 2; v += row, r++) {
        const a = P(0, v);
        const bb = P(1, v);
        g.lineBetween(a.x, a.y, bb.x, bb.y);
        for (let i = 0; i < cols; i++) {
          const u = (i + (r % 2 ? 0.5 : 0)) / cols;
          if (u <= 0.02 || u >= 0.98) continue;
          const p = P(u, v);
          const q = P(u, Math.min(h, v + row));
          g.lineBetween(p.x, p.y, q.x, q.y);
        }
      }
    } else if (tex === 'timber') {
      g.lineStyle(3, 0x7a4f2a, 1);
      for (const u of [0.04, 0.5, 0.96]) {
        const p = P(u, 0);
        const q = P(u, h);
        g.lineBetween(p.x, p.y, q.x, q.y);
      }
      const p = P(0, h * 0.55);
      const q = P(1, h * 0.55);
      g.lineBetween(p.x, p.y, q.x, q.y);
      const d1 = P(0.04, h * 0.55);
      const d2 = P(0.5, h);
      g.lineBetween(d1.x, d1.y, d2.x, d2.y);
    } else {
      g.fillStyle(shade(c, 0.12), 1);
      for (let i = 0; i < 5; i++) {
        const p = P(((i * 37) % 90) / 100 + 0.05, ((i * 53) % 80) / 100 * h + 4);
        g.fillEllipse(p.x, p.y, 4, 2);
      }
    }
  };
  face((u, v) => L(b, u, v), lc);
  face((u, v) => R(b, u, v), rc);
  // lit edge where the two walls meet
  g.lineStyle(1.6, light(color, 0.35), 1);
  g.lineBetween(L(b, 1, 1).x - 1.2, L(b, 1, 1).y, L(b, 1, h - 1).x - 1.2, L(b, 1, h - 1).y);
  g.lineStyle(3, INK, 1);
  g.strokePoints([L(b, 0, 0), L(b, 1, 0), R(b, 1, 0), R(b, 1, h), L(b, 1, h), L(b, 0, h)], true);
  g.lineBetween(L(b, 1, 0).x, L(b, 1, 0).y, L(b, 1, h).x, L(b, 1, h).y);
}

/** Gabled roof whose ridge runs along the left wall; the gable end sits on the right wall. */
function roof(g: G, b: Box, peak: number, color: number, wall: number): { ridgeFront: Pt; ridgeBack: Pt } {
  const { cx, cy, a, h } = b;
  const half = a / 2;
  const leftTop = V(cx - a, cy - h);
  const frontTop = V(cx, cy + half - h);
  const rightTop = V(cx + a, cy - h);
  const backTop = V(cx, cy - half - h);
  const ridgeBack = V(cx - a / 2, cy - half / 2 - h - peak);
  const ridgeFront = V(cx + a / 2, cy + half / 2 - h - peak);
  const o = 5; // eave overhang
  // back slope (mostly hidden), then the gable end, then the front slope
  poly(g, [ridgeBack, ridgeFront, V(rightTop.x + o, rightTop.y + 1), V(backTop.x, backTop.y - 2)], shade(color, 0.3), 3);
  poly(g, [frontTop, rightTop, ridgeFront], shade(wall, 0.22), 3);
  g.fillStyle(shade(wall, 0.45), 1);
  const vent = V((frontTop.x + rightTop.x + ridgeFront.x) / 3, (frontTop.y + rightTop.y + ridgeFront.y) / 3 - 2);
  g.fillCircle(vent.x, vent.y, 3.2);
  const front = [V(leftTop.x - o, leftTop.y + o / 2), V(frontTop.x + 1, frontTop.y + o), V(ridgeFront.x + 3, ridgeFront.y), V(ridgeBack.x - 3, ridgeBack.y)];
  poly(g, front, color, 0);
  // shingle rows parallel to the ridge
  for (let i = 1; i < 5; i++) {
    const t = i / 5;
    const p = V(ridgeBack.x + (front[0].x - ridgeBack.x) * t, ridgeBack.y + (front[0].y - ridgeBack.y) * t);
    const q = V(ridgeFront.x + (front[1].x - ridgeFront.x) * t, ridgeFront.y + (front[1].y - ridgeFront.y) * t);
    g.lineStyle(1.4, shade(color, 0.28), 1);
    g.lineBetween(p.x, p.y, q.x, q.y);
    g.lineStyle(1, light(color, 0.25), 1);
    g.lineBetween(p.x, p.y - 1.6, q.x, q.y - 1.6);
  }
  g.lineStyle(3, INK, 1);
  g.strokePoints(front, true);
  // ridge cap
  stem(g, ridgeBack.x - 2, ridgeBack.y, ridgeFront.x + 2, ridgeFront.y, light(color, 0.3), 3);
  return { ridgeFront, ridgeBack };
}

/** A window on a wall: a lit pane in a frame with a cross bar. */
function windowOn(g: G, P: (u: number, v: number) => Pt, u: number, v: number, w: number, hh: number, glow = false): void {
  const quad = [P(u, v), P(u + w, v), P(u + w, v + hh), P(u, v + hh)];
  poly(g, quad, glow ? 0xffe8a0 : 0x9fd8f5, 2);
  g.fillStyle(0xffffff, 0.55);
  const a = P(u + w * 0.12, v + hh * 0.85);
  const c = P(u + w * 0.4, v + hh * 0.5);
  g.fillTriangle(a.x, a.y, c.x, c.y, P(u + w * 0.12, v + hh * 0.45).x, P(u + w * 0.12, v + hh * 0.45).y);
  g.lineStyle(1.6, INK, 1);
  const m1 = P(u + w / 2, v);
  const m2 = P(u + w / 2, v + hh);
  g.lineBetween(m1.x, m1.y, m2.x, m2.y);
  const n1 = P(u, v + hh / 2);
  const n2 = P(u + w, v + hh / 2);
  g.lineBetween(n1.x, n1.y, n2.x, n2.y);
}

function doorOn(g: G, P: (u: number, v: number) => Pt, u: number, w: number, hh: number, color: number): void {
  const quad = [P(u, 0), P(u + w, 0), P(u + w, hh), P(u, hh)];
  poly(g, quad, color, 2.2);
  g.lineStyle(1.2, shade(color, 0.3), 1);
  for (const k of [0.33, 0.66]) {
    const p = P(u + w * k, 1);
    const q = P(u + w * k, hh - 1);
    g.lineBetween(p.x, p.y, q.x, q.y);
  }
  g.fillStyle(0xffd54f, 1);
  const k = P(u + w * 0.82, hh * 0.45);
  g.fillCircle(k.x, k.y, 1.4);
}

// ── buildings ────────────────────────────────────────────────────

export const MILL = { a: 56, h: 80, peak: 42 };
export const MILL_BOUNDS = { left: -72, top: -170, right: 72, bottom: 40 };
/** Where the water wheel turns, relative to the mill's anchor. */
export const MILL_WHEEL_AT = { x: 46, y: -24 };
export const WHEEL_BOUNDS = { left: -38, top: -38, right: 38, bottom: 38 };

/** The mill: stages 0–2 are the ruin being rebuilt (scaffolding from 1), 3 is the working mill. */
export function drawMill(g: G, cx: number, cy: number, stage: number): void {
  const b: Box = { cx, cy, a: MILL.a, h: MILL.h };
  contact(g, cx + 6, cy + 4, 70, 26, 0.18);
  const stone = 0xd9c7a3;
  if (stage >= 3) {
    walls(g, b, stone, 'stone');
    windowOn(g, (u, v) => L(b, u, v), 0.18, 40, 0.22, 18, true);
    windowOn(g, (u, v) => L(b, u, v), 0.6, 40, 0.22, 18, true);
    doorOn(g, (u, v) => L(b, u, v), 0.38, 0.24, 30, 0x8b5a2b);
    windowOn(g, (u, v) => R(b, u, v), 0.2, 52, 0.22, 16, true);
    roof(g, b, MILL.peak, 0xc9483a, stone);
    // flour sacks by the door
    ball(g, cx - 2, cy + 16, 6, 0xf3ead2, 2, 6.5, 7);
    ball(g, cx + 9, cy + 13, 5.5, 0xf3ead2, 2, 6, 6.5);
    return;
  }
  // the ruin: a dark floor, broken back walls, jagged front walls, rubble
  const h = 36 + stage * 20;
  const floor = [V(cx - b.a, cy), V(cx, cy - b.a / 2), V(cx + b.a, cy), V(cx, cy + b.a / 2)];
  poly(g, floor, 0x6b5f50, 0);
  const jag = (P: (u: number, v: number) => Pt, n: number, seed: number): Pt[] => {
    const pts: Pt[] = [P(0, 0), P(1, 0)];
    for (let i = n; i >= 0; i--) {
      const u = i / n;
      const v = h * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7 + seed)));
      pts.push(P(u, v));
    }
    return pts;
  };
  const backL = (u: number, v: number) => V(cx - b.a + b.a * u, cy - (b.a / 2) * u - v);
  const backR = (u: number, v: number) => V(cx + b.a * u, cy - b.a / 2 + (b.a / 2) * u - v);
  poly(g, jag(backL, 5, 1), shade(stone, 0.35), 2.5);
  poly(g, jag(backR, 5, 2), shade(stone, 0.45), 2.5);
  poly(g, jag((u, v) => L(b, u, v), 6, 3), light(stone, 0.04), 3);
  poly(g, jag((u, v) => R(b, u, v), 6, 4), shade(stone, 0.2), 3);
  // stone courses on the front walls
  g.lineStyle(1.2, shade(stone, 0.3), 0.8);
  for (let v = 11; v < h * 0.5; v += 11) {
    g.lineBetween(L(b, 0, v).x, L(b, 0, v).y, L(b, 1, v).x, L(b, 1, v).y);
    g.lineBetween(R(b, 0, v).x, R(b, 0, v).y, R(b, 1, v).x, R(b, 1, v).y);
  }
  // rubble
  for (const [dx, dy, r] of [
    [-50, 10, 6],
    [-40, 16, 4.5],
    [30, 22, 5],
    [42, 16, 4],
  ])
    ball(g, cx + dx, cy + dy, r, 0xb0a99a, 2, r * 1.2, r * 0.85);
  // creeping ivy
  leaf(g, L(b, 0.15, 6).x, L(b, 0.15, 6).y, 12, 7, -0.4, 0x5cb83a);
  leaf(g, L(b, 0.2, 6).x, L(b, 0.2, 6).y, 10, 6, 0.6, 0x4caf50);
  if (stage >= 1) {
    // scaffolding: poles, planks and a ladder
    const wood = 0xb07a45;
    for (const u of [-0.15, 0.5, 1.15]) {
      const p = L(b, u, -6);
      stem(g, p.x, p.y, p.x, p.y - 112, wood, 3);
    }
    for (const v of [58, 90]) {
      const p = L(b, -0.18, v);
      const q = L(b, 1.18, v);
      stem(g, p.x, p.y, q.x, q.y, light(wood, 0.15), 4);
    }
    const la = L(b, 0.72, -4);
    stem(g, la.x - 5, la.y, la.x - 9, la.y - 60, wood, 1.8);
    stem(g, la.x + 5, la.y - 4, la.x + 1, la.y - 64, wood, 1.8);
    for (let i = 1; i < 6; i++) stem(g, la.x - 5 - i * 0.7, la.y - i * 10, la.x + 5 - i * 0.7, la.y - 4 - i * 10, wood, 1.4);
  }
}

/** The mill's water wheel, drawn around its hub so it can spin. */
export function drawWheel(g: G, cx: number, cy: number): void {
  const wood = 0x8b5a2b;
  g.fillStyle(shade(wood, 0.3), 1);
  g.fillCircle(cx, cy, 32);
  g.fillStyle(wood, 1);
  g.fillCircle(cx - 1.5, cy - 1.5, 29);
  g.fillStyle(0xc98a4b, 1);
  g.fillCircle(cx, cy, 21);
  g.fillStyle(light(0xc98a4b, 0.25), 1);
  g.fillCircle(cx - 2, cy - 2, 17);
  g.lineStyle(3, INK, 1);
  g.strokeCircle(cx, cy, 32);
  g.strokeCircle(cx, cy, 21);
  // paddles and spokes
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    stem(g, cx + Math.cos(a) * 6, cy + Math.sin(a) * 6, cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, 0x7a4f2a, 2.2);
    const p = V(cx + Math.cos(a) * 26.5, cy + Math.sin(a) * 26.5);
    g.lineStyle(5.5, INK, 1);
    g.lineBetween(p.x - Math.cos(a) * 5, p.y - Math.sin(a) * 5, p.x + Math.cos(a) * 5, p.y + Math.sin(a) * 5);
    g.lineStyle(3, light(wood, 0.3), 1);
    g.lineBetween(p.x - Math.cos(a) * 4.5, p.y - Math.sin(a) * 4.5, p.x + Math.cos(a) * 4.5, p.y + Math.sin(a) * 4.5);
  }
  ball(g, cx, cy, 5.5, 0x6b6b6b, 2);
}

export const JAM = { a: 50, h: 52, peak: 32 };
export const BAKERY = { a: 52, h: 60, peak: 32 };
export const SHOP_BOUNDS = { left: -64, top: -150, right: 64, bottom: 40 };
/** Bakery chimney top (smoke comes out here), relative to the anchor. */
export const CHIMNEY_TOP = { x: 16, y: -110 };

export function drawJamMaker(g: G, cx: number, cy: number): void {
  const b: Box = { cx, cy, a: JAM.a, h: JAM.h };
  contact(g, cx + 6, cy + 4, 62, 24, 0.18);
  const plaster = 0xf3ede0;
  walls(g, b, plaster, 'timber');
  windowOn(g, (u, v) => L(b, u, v), 0.1, 18, 0.26, 16, true);
  doorOn(g, (u, v) => L(b, u, v), 0.6, 0.26, 28, 0xc94a3a);
  windowOn(g, (u, v) => R(b, u, v), 0.35, 20, 0.3, 16);
  roof(g, b, JAM.peak, 0xe8323c, plaster);
  // hanging jar sign
  const s = L(b, 0.5, 40);
  stem(g, s.x - 4, s.y - 18, s.x + 12, s.y - 26, 0x7a4f2a, 2);
  ball(g, s.x + 10, s.y - 13, 7, 0xd6304a, 2, 6.5, 8);
  g.fillStyle(0xfff8e6, 1);
  g.fillRect(s.x + 5.5, s.y - 22, 9, 3.5);
  g.lineStyle(1.5, INK, 1);
  g.strokeRect(s.x + 5.5, s.y - 22, 9, 3.5);
  // crates of fruit by the door
  crate(g, cx + 30, cy + 12, 0xe8323c);
  crate(g, cx + 40, cy + 2, 0x8e44ad);
}

export function drawBakery(g: G, cx: number, cy: number): void {
  const b: Box = { cx, cy, a: BAKERY.a, h: BAKERY.h };
  contact(g, cx + 6, cy + 4, 64, 24, 0.18);
  const brick = 0xd27a4c;
  walls(g, b, brick, 'brick');
  // big shop window with bread on show, and an awning
  windowOn(g, (u, v) => L(b, u, v), 0.08, 12, 0.42, 22, true);
  const loaf = L(b, 0.28, 16);
  ball(g, loaf.x, loaf.y, 4, 0xe8b55c, 1.5, 6, 3.5);
  doorOn(g, (u, v) => L(b, u, v), 0.62, 0.26, 32, 0x6b4a8f);
  const aw = [L(b, 0.04, 38), L(b, 0.54, 38), L(b, 0.58, 30), L(b, 0.0, 30)];
  poly(g, aw.map((p, i) => (i >= 2 ? V(p.x - 3, p.y + 6) : p)), 0xfff3d6, 2.2);
  g.lineStyle(3, 0xd6304a, 1);
  for (let i = 1; i < 6; i += 2) {
    const t = i / 6;
    const p = V(aw[0].x + (aw[1].x - aw[0].x) * t, aw[0].y + (aw[1].y - aw[0].y) * t);
    g.lineBetween(p.x, p.y + 1.5, p.x - 3, p.y + 12);
  }
  windowOn(g, (u, v) => R(b, u, v), 0.3, 28, 0.3, 16, true);
  roof(g, b, BAKERY.peak, 0x6b4a8f, brick);
  // chimney
  const c = { cx: cx + CHIMNEY_TOP.x, cy: cy + CHIMNEY_TOP.y + 30, a: 8, h: 30 };
  walls(g, c, 0x9a9a9a, 'stone');
  poly(g, [V(c.cx - c.a, c.cy - c.h), V(c.cx, c.cy - c.h - c.a / 2), V(c.cx + c.a, c.cy - c.h), V(c.cx, c.cy - c.h + c.a / 2)], 0x3a3a3a, 2.5);
}

function crate(g: G, x: number, y: number, fruit: number): void {
  poly(g, [V(x - 8, y - 6), V(x, y - 10), V(x + 8, y - 6), V(x, y - 2)], light(0xc98a4b, 0.15), 1.8);
  poly(g, [V(x - 8, y - 6), V(x, y - 2), V(x, y + 6), V(x - 8, y + 2)], 0xc98a4b, 1.8);
  poly(g, [V(x, y - 2), V(x + 8, y - 6), V(x + 8, y + 2), V(x, y + 6)], shade(0xc98a4b, 0.2), 1.8);
  for (const [dx, dy] of [
    [-3, -7],
    [2, -8],
    [0, -5],
  ])
    ball(g, x + dx, y + dy, 2.4, fruit, 1.2);
}

export const PICKLING = { a: 50, h: 48, peak: 28 };
export const LOOM = { a: 52, h: 54, peak: 30 };

/** A stoneware pickle crock with a wooden lid. */
function crock(g: G, x: number, y: number, r = 7, glaze = 0xc9a86a): void {
  ball(g, x, y, r, glaze, 1.8, r, r * 1.1);
  g.fillStyle(shade(glaze, 0.35), 1);
  g.fillRect(x - r * 0.7, y - r * 0.35, r * 1.4, 2);
  ball(g, x, y - r * 1.05, r * 0.75, 0x8a5a33, 1.6, r * 0.75, r * 0.3);
}

/** A glass jar of pickles: green brine, a little dill. */
function pickleJar(g: G, x: number, y: number, fill = 0x9ccf5a): void {
  poly(g, [V(x - 4, y - 10), V(x + 4, y - 10), V(x + 4.5, y), V(x - 4.5, y)], fill, 1.5);
  g.fillStyle(0xffffff, 0.45);
  g.fillRect(x - 3, y - 8, 1.5, 6);
  poly(g, [V(x - 4.5, y - 12.5), V(x + 4.5, y - 12.5), V(x + 4.5, y - 10), V(x - 4.5, y - 10)], 0xe8323c, 1.4);
}

/** Goldie's old crocks, under a little cellar-house with a green roof and dill drying by the door. */
export function drawPickling(g: G, cx: number, cy: number): void {
  const b: Box = { cx, cy, a: PICKLING.a, h: PICKLING.h };
  contact(g, cx + 6, cy + 4, 62, 24, 0.18);
  const stoneWall = 0xd8cdb8;
  walls(g, b, stoneWall, 'stone');
  doorOn(g, (u, v) => L(b, u, v), 0.55, 0.28, 28, 0x3f7f4a);
  windowOn(g, (u, v) => L(b, u, v), 0.12, 16, 0.26, 14);
  windowOn(g, (u, v) => R(b, u, v), 0.35, 18, 0.3, 14);
  roof(g, b, PICKLING.peak, 0x3fa34d, stoneWall);
  // dill hanging by the door
  const d = L(b, 0.5, 40);
  stem(g, d.x - 2, d.y - 4, d.x + 1, d.y + 10, 0x6a8f3a, 1.8);
  for (const k of [0, 4, 8]) leaf(g, d.x + 1, d.y + k, 6, 3, -0.7 + k * 0.08, 0x8cc63f, 1.2);
  // crocks and jars out front
  crock(g, cx + 30, cy + 10);
  pickleJar(g, cx + 42, cy + 6);
  pickleJar(g, cx + 48, cy + 1, 0xe8892a);
}

/** Juniper's grandmother's loom, in a timber workshop with bolts of cloth outside. */
export function drawLoom(g: G, cx: number, cy: number, upgraded = false): void {
  const b: Box = { cx, cy, a: LOOM.a, h: LOOM.h };
  contact(g, cx + 6, cy + 4, 64, 24, 0.18);
  const plaster = 0xf1e6d2;
  walls(g, b, plaster, 'timber');
  windowOn(g, (u, v) => L(b, u, v), 0.08, 14, 0.46, 22, true);
  doorOn(g, (u, v) => L(b, u, v), 0.64, 0.24, 30, 0x2f6fb0);
  windowOn(g, (u, v) => R(b, u, v), 0.3, 22, 0.32, 16, true);
  roof(g, b, LOOM.peak, 0x2f6fb0, plaster);
  // a loom frame seen through the big window
  const w = L(b, 0.3, 30);
  g.lineStyle(2, 0x7a4f2a, 1);
  g.lineBetween(w.x - 6, w.y - 2, w.x - 6, w.y + 14);
  g.lineBetween(w.x + 6, w.y - 6, w.x + 6, w.y + 10);
  g.lineStyle(1, 0xf4f1ea, 1);
  for (let i = -4; i <= 4; i += 2) g.lineBetween(w.x + i, w.y - 3 - i / 3, w.x + i, w.y + 12 - i / 3);
  // bolts of cloth by the door
  ball(g, cx + 32, cy + 10, 6, 0xd9604a, 1.6, 9, 5);
  ball(g, cx + 40, cy + 3, 6, 0xe9e2d2, 1.6, 9, 5);
  if (upgraded) {
    // a second loom under a little awning outside
    const x = cx - 36;
    const y = cy + 12;
    poly(g, [V(x - 12, y - 26), V(x + 12, y - 32), V(x + 14, y - 26), V(x - 10, y - 20)], 0x2f6fb0, 1.8);
    g.lineStyle(2.2, 0x7a4f2a, 1);
    g.lineBetween(x - 9, y - 21, x - 9, y + 2);
    g.lineBetween(x + 9, y - 27, x + 9, y - 4);
    g.lineBetween(x - 9, y - 8, x + 9, y - 14);
    g.lineStyle(1, 0xf4f1ea, 1);
    for (let i = -6; i <= 6; i += 2) g.lineBetween(x + i, y - 20 - i / 3, x + i, y - 2 - i / 3);
  }
}

/** Extra pieces a building's second-line upgrade adds (drawn on top of the base building). */
export function drawUpgrade(g: G, id: string, cx: number, cy: number): void {
  if (id === 'jam_maker') {
    // a second copper kettle on a little stove outside
    poly(g, [V(cx - 44, cy + 6), V(cx - 32, cy), V(cx - 20, cy + 6), V(cx - 32, cy + 12)], 0x6b6b6b, 1.8);
    ball(g, cx - 32, cy - 2, 9, 0xd08a4a, 2, 10, 8);
    stem(g, cx - 32, cy - 10, cx - 30, cy - 16, INK, 1.6);
  } else if (id === 'bakery') {
    // a second chimney
    const c = { cx: cx - 18, cy: cy - 72, a: 7, h: 26 };
    walls(g, c, 0x9a9a9a, 'stone');
    poly(g, [V(c.cx - c.a, c.cy - c.h), V(c.cx, c.cy - c.h - c.a / 2), V(c.cx + c.a, c.cy - c.h), V(c.cx, c.cy - c.h + c.a / 2)], 0x3a3a3a, 2.2);
  } else if (id === 'mill') {
    // a second millstone leaning by the door
    ball(g, cx + 34, cy + 6, 11, 0xa8a29a, 2, 11, 12);
    ball(g, cx + 34, cy + 6, 3, 0x6b6b6b, 1.4);
  }
}

/** A ready badge: a green check, bobbed by the scene. */
export function drawBadge(g: G, cx: number, cy: number): void {
  contact(g, cx, cy + 16, 8, 2.5, 0.12);
  ball(g, cx, cy, 12, 0x5cb83a, 3);
  g.lineStyle(3.5, 0xffffff, 1);
  g.lineBetween(cx - 5, cy, cx - 1, cy + 4);
  g.lineBetween(cx - 1, cy + 4, cx + 6, cy - 4);
}
export const BADGE_BOUNDS = { left: -16, top: -16, right: 16, bottom: 20 };

export function drawPuff(g: G, cx: number, cy: number): void {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(cx, cy, 8);
  g.fillCircle(cx - 6, cy + 3, 5.5);
  g.fillCircle(cx + 6, cy + 2, 6);
  g.fillStyle(0xe8eef2, 1);
  g.fillCircle(cx + 2, cy + 4, 5);
}
export const PUFF_BOUNDS = { left: -14, top: -10, right: 14, bottom: 12 };

// ── decorations ──────────────────────────────────────────────────

export const DECOR_BOUNDS = { left: -44, top: -100, right: 44, bottom: 18 };

/** Animated pieces that sit on top of (or behind) a decoration, relative to its anchor. */
export const DECOR_PARTS: Record<string, { key: string; x: number; y: number; behind?: boolean }[]> = {
  lamp: [{ key: 'decor/part/glow', x: 0, y: -68, behind: true }],
  beehive: [{ key: 'decor/part/bee', x: 0, y: -48 }],
  windmill: [{ key: 'decor/part/blades', x: 0, y: -58 }],
  fountain: [
    { key: 'decor/part/drop', x: 0, y: -50 },
    { key: 'decor/part/drop', x: 0, y: -50 },
    { key: 'decor/part/drop', x: 0, y: -50 },
  ],
  statue: [{ key: 'decor/part/twinkle', x: -6, y: -68 }],
};
export const PART_BOUNDS: Record<string, { left: number; top: number; right: number; bottom: number }> = {
  'decor/part/glow': { left: -26, top: -26, right: 26, bottom: 26 },
  'decor/part/bee': { left: -7, top: -7, right: 7, bottom: 7 },
  'decor/part/blades': { left: -40, top: -40, right: 40, bottom: 40 },
  'decor/part/drop': { left: -5, top: -5, right: 5, bottom: 5 },
  'decor/part/twinkle': { left: -6, top: -6, right: 6, bottom: 6 },
};

export function drawDecorPart(g: G, key: string, cx: number, cy: number): void {
  if (key === 'decor/part/glow') {
    for (const [r, a] of [
      [24, 0.18],
      [17, 0.22],
      [11, 0.3],
    ]) {
      g.fillStyle(0xffe14d, a);
      g.fillCircle(cx, cy, r);
    }
  } else if (key === 'decor/part/bee') {
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(cx - 1, cy - 4, 5, 3.5);
    g.fillEllipse(cx + 2, cy - 4, 5, 3.5);
    ball(g, cx, cy, 3.6, 0xffd54f, 1.4, 4.2, 3.3);
    g.lineStyle(1.2, INK, 1);
    g.lineBetween(cx - 1, cy - 3, cx - 1, cy + 3);
    g.lineBetween(cx + 1.5, cy - 3, cx + 1.5, cy + 3);
  } else if (key === 'decor/part/blades') {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      stem(g, cx, cy, cx + dx * 34, cy + dy * 34, 0x8b5a2b, 2.6);
      // sail: a cloth panel beside each arm
      const nx = -dy;
      const ny = dx;
      const sail = [V(cx + dx * 10 + nx * 2, cy + dy * 10 + ny * 2), V(cx + dx * 33 + nx * 2, cy + dy * 33 + ny * 2), V(cx + dx * 33 + nx * 10, cy + dy * 33 + ny * 10), V(cx + dx * 12 + nx * 8, cy + dy * 12 + ny * 8)];
      poly(g, sail, i % 2 ? 0xfff8e6 : shade(0xfff8e6, 0.08), 1.8);
      g.lineStyle(1, shade(0xfff8e6, 0.25), 1);
      for (const t of [0.4, 0.7]) g.lineBetween(cx + dx * 33 * t + nx * 2, cy + dy * 33 * t + ny * 2, cx + dx * 33 * t + nx * 9, cy + dy * 33 * t + ny * 9);
    }
    ball(g, cx, cy, 5, 0xc0562a, 2);
  } else if (key === 'decor/part/drop') {
    ball(g, cx, cy, 3, 0xbfe6ff, 1.2);
  } else if (key === 'decor/part/twinkle') {
    twinkle(g, cx, cy, 5.5, 0xfffbe0);
  }
}

export function drawDecor(g: G, id: string, x: number, y: number): void {
  contact(g, x + 2, y + 2, 28, 8, 0.16);
  switch (id) {
    case 'flowerbed': {
      poly(g, ellipsePts(x, y - 2, 28, 12), shade(0x7a4626, 0.15), 0);
      poly(g, ellipsePts(x, y - 4, 27, 11), 0x7a4626, 0);
      // stone border
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        ball(g, x + Math.cos(a) * 27, y - 4 + Math.sin(a) * 11, 3.2, 0xc9c0ab, 1.3, 4, 3);
      }
      const cols = [0xe8506a, 0xffd54f, 0xf2f2f2, 0xb36ad6, 0xf48fb1, 0xe8506a, 0xffd54f];
      cols.forEach((col, i) => {
        const fx = x - 18 + i * 6;
        const fy = y - 10 - ((i * 3) % 5) - (i % 2) * 4;
        stem(g, fx, fy + 10, fx, fy, 0x4caf50, 1.4);
        leaf(g, fx, fy + 8, 6, 4, i % 2 ? 0.9 : -0.9, 0x4caf50, 1.2);
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          g.fillStyle(col, 1);
          g.fillCircle(fx + Math.cos(a) * 2.8, fy + Math.sin(a) * 2.8, 2.4);
          g.lineStyle(1, INK, 1);
          g.strokeCircle(fx + Math.cos(a) * 2.8, fy + Math.sin(a) * 2.8, 2.4);
        }
        g.fillStyle(0xffb300, 1);
        g.fillCircle(fx, fy, 1.6);
      });
      break;
    }
    case 'hay': {
      const bale = (bx: number, by: number) => {
        const b: Box = { cx: bx, cy: by, a: 16, h: 16 };
        walls(g, b, 0xf2c230, 'plaster');
        const top = [V(bx - 16, by - 16), V(bx, by - 24), V(bx + 16, by - 16), V(bx, by - 8)];
        poly(g, top, light(0xf2c230, 0.2), 2.5);
        g.lineStyle(1, shade(0xf2c230, 0.3), 1);
        for (let i = 1; i < 4; i++) g.lineBetween(bx - 16 + i * 4, by - 16 - i * 2 + 1, bx + i * 4, by - 8 - i * 2 + 1);
        g.lineStyle(2.5, 0xc0562a, 1);
        g.lineBetween(bx - 9, by - 4.5, bx - 9, by - 20.5);
        g.lineBetween(bx + 9, by - 4.5, bx + 9, by - 20.5);
      };
      bale(x - 14, y + 4);
      bale(x + 14, y + 4);
      bale(x, y - 14);
      break;
    }
    case 'bench': {
      const wood = 0xc98a4b;
      for (const [dx, dy] of [
        [-20, -6],
        [16, -18],
        [-12, 2],
        [24, -10],
      ])
        stem(g, x + dx, y + dy, x + dx, y + dy - 14, shade(wood, 0.3), 3);
      const seat = [V(x - 26, y - 10), V(x + 18, y - 32), V(x + 30, y - 24), V(x - 14, y - 2)];
      poly(g, seat.map((p) => V(p.x, p.y - 12)), wood, 2.5);
      g.lineStyle(1.2, shade(wood, 0.3), 1);
      for (const t of [0.33, 0.66]) g.lineBetween(x - 26 + 12 * t, y - 22 + 8 * t, x + 18 + 12 * t, y - 44 + 8 * t);
      poly(g, [V(x - 26, y - 22), V(x - 14, y - 14), V(x - 14, y - 11), V(x - 26, y - 19)], shade(wood, 0.25), 2);
      // backrest
      for (const t of [0, 0.5]) {
        const by = y - 30 - t * 10;
        poly(g, [V(x - 26, by), V(x + 18, by - 22), V(x + 18, by - 28), V(x - 26, by - 6)], t ? light(wood, 0.12) : wood, 2.2);
      }
      stem(g, x - 24, y - 20, x - 24, y - 46, shade(wood, 0.2), 2.5);
      stem(g, x + 16, y - 42, x + 16, y - 68, shade(wood, 0.2), 2.5);
      break;
    }
    case 'scarecrow': {
      stem(g, x, y, x, y - 58, 0x8b5a2b, 4);
      stem(g, x - 24, y - 42, x + 24, y - 42, 0x8b5a2b, 3.5);
      // straw cuffs
      for (const s of [-1, 1]) for (const a of [-0.4, 0, 0.4]) leaf(g, x + s * 24, y - 42, 7, 3, s * (1.57 + a), 0xf2c230, 1.2);
      poly(g, [V(x - 13, y - 48), V(x + 13, y - 48), V(x + 15, y - 22), V(x - 15, y - 22)], 0x3f7fd0, 2.5);
      g.fillStyle(shade(0x3f7fd0, 0.2), 1);
      g.fillRect(x + 3, y - 46, 10, 22);
      poly(g, [V(x - 6, y - 38), V(x, y - 38), V(x, y - 32), V(x - 6, y - 32)], 0xe0a35e, 1.4);
      for (const a of [-0.3, 0.1, 0.4]) leaf(g, x - 6 + a * 20, y - 22, 7, 3, Math.PI + a, 0xf2c230, 1.2);
      ball(g, x, y - 57, 10, 0xf2d29b, 2.5);
      g.fillStyle(INK, 1);
      g.fillCircle(x - 3.5, y - 58, 1.6);
      g.fillCircle(x + 3.5, y - 58, 1.6);
      g.lineStyle(1.4, INK, 1);
      g.lineBetween(x - 4, y - 52.5, x + 4, y - 52.5);
      for (let i = -3; i <= 3; i += 2) g.lineBetween(x + i, y - 54, x + i, y - 51);
      // hat
      poly(g, ellipsePts(x, y - 64, 17, 4.5), shade(0xc0562a, 0.1), 2.2);
      poly(g, [V(x - 9, y - 64), V(x - 7, y - 78), V(x + 7, y - 78), V(x + 9, y - 64)], 0xc0562a, 2.2);
      g.lineStyle(2.5, 0xffd54f, 1);
      g.lineBetween(x - 8.5, y - 67, x + 8.5, y - 67);
      break;
    }
    case 'lamp': {
      g.fillStyle(0x4a4a4a, 1);
      ball(g, x, y - 3, 6, 0x5a5a5a, 2, 7, 3.5);
      stem(g, x, y - 4, x, y - 58, 0x4a4a4a, 4);
      g.lineStyle(1, 0x8a8a8a, 1);
      g.lineBetween(x - 1, y - 6, x - 1, y - 56);
      poly(g, [V(x - 9, y - 58), V(x + 9, y - 58), V(x + 11, y - 78), V(x - 11, y - 78)], 0xffd54f, 2.5);
      g.fillStyle(0xfff3b0, 1);
      g.fillRect(x - 6, y - 74, 4, 12);
      g.lineStyle(1.6, INK, 1);
      g.lineBetween(x, y - 58, x, y - 78);
      poly(g, [V(x - 14, y - 78), V(x + 14, y - 78), V(x, y - 90)], 0x4a4a4a, 2.5);
      ball(g, x, y - 91, 2.5, 0x4a4a4a, 1.5);
      break;
    }
    case 'beehive': {
      stem(g, x - 8, y, x - 8, y - 16, 0x8b5a2b, 3);
      stem(g, x + 8, y, x + 8, y - 16, 0x8b5a2b, 3);
      poly(g, [V(x - 18, y - 16), V(x + 18, y - 16), V(x + 18, y - 20), V(x - 18, y - 20)], 0xc98a4b, 2);
      for (let i = 0; i < 4; i++) {
        const w = 17 - i * 3.5;
        ball(g, x, y - 26 - i * 9, w, 0xf5b32a, 2.2, w, 6);
      }
      ball(g, x, y - 26, 3.5, INK, 0, 4, 3);
      g.fillStyle(INK, 1);
      g.fillEllipse(x, y - 25, 8, 6);
      leaf(g, x - 16, y - 20, 9, 5, -1.1, 0x5cb83a, 1.4);
      break;
    }
    case 'pumpkins': {
      for (const [dx, dy, r] of [
        [0, -16, 11],
        [-14, 0, 13],
        [14, 0, 12],
      ]) {
        const px = x + dx;
        const py = y + dy - 10;
        ball(g, px, py, r, 0xf57c00, 2.5, r * 1.15, r * 0.85);
        g.lineStyle(1.4, shade(0xf57c00, 0.4), 1);
        g.strokeEllipse(px, py, r * 0.8, r * 1.7);
        g.strokeEllipse(px, py, r * 1.6, r * 1.7);
        g.lineStyle(2.5, INK, 1);
        g.strokeEllipse(px, py, r * 2.3, r * 1.7);
        stem(g, px, py - r * 0.8, px + 2, py - r * 0.8 - 6, 0x558b2f, 2.4);
      }
      leaf(g, x - 22, y + 4, 12, 9, -1.3, 0x689f38);
      leaf(g, x + 22, y + 4, 12, 9, 1.3, shade(0x689f38, 0.1));
      break;
    }
    case 'windmill': {
      const b: Box = { cx: x, cy: y, a: 16, h: 52 };
      walls(g, b, 0xf3ede0, 'plaster');
      doorOn(g, (u, v) => L(b, u, v), 0.35, 0.4, 14, 0x8b5a2b);
      windowOn(g, (u, v) => R(b, u, v), 0.3, 30, 0.4, 9);
      poly(g, [V(x - 20, y - 51), V(x, y - 80), V(x, y - 42)], 0xc9483a, 2.5);
      poly(g, [V(x, y - 42), V(x, y - 80), V(x + 20, y - 51)], shade(0xc9483a, 0.25), 2.5);
      break;
    }
    case 'fountain': {
      poly(g, ellipsePts(x, y - 4, 30, 13), shade(0xb0a99a, 0.25), 0);
      poly(g, ellipsePts(x, y - 9, 30, 13), 0xc9c0ab, 2.5);
      poly(g, ellipsePts(x, y - 10, 24, 9.5), 0x6fb7e8, 2);
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(x - 9, y - 12, 12, 3);
      g.lineStyle(2.5, INK, 1);
      g.lineBetween(x - 30, y - 9, x - 30, y - 4);
      g.lineBetween(x + 30, y - 9, x + 30, y - 4);
      walls(g, { cx: x, cy: y - 10, a: 5, h: 26 }, 0xc9c0ab, 'plaster');
      poly(g, ellipsePts(x, y - 37, 13, 5), 0xc9c0ab, 2.2);
      poly(g, ellipsePts(x, y - 38, 10, 3.5), 0x6fb7e8, 1.5);
      break;
    }
    case 'statue': {
      const b: Box = { cx: x, cy: y, a: 22, h: 16 };
      walls(g, b, 0xc9c0ab, 'stone');
      poly(g, [V(x - 22, y - 16), V(x, y - 27), V(x + 22, y - 16), V(x, y - 5)], light(0xc9c0ab, 0.15), 2.5);
      // golden Tobias
      const gold = 0xffc531;
      poly(g, [V(x - 11, y - 18), V(x - 9, y - 50), V(x + 9, y - 50), V(x + 11, y - 18)], gold, 2.5);
      g.fillStyle(shade(gold, 0.25), 1);
      g.fillRect(x + 2, y - 48, 7, 30);
      stem(g, x + 8, y - 44, x + 18, y - 58, gold, 3.5);
      ball(g, x + 18, y - 60, 3, gold, 1.8);
      ball(g, x, y - 60, 10, gold, 2.5);
      poly(g, ellipsePts(x, y - 68, 16, 4), shade(gold, 0.1), 2.2);
      poly(g, [V(x - 8, y - 68), V(x - 7, y - 80), V(x + 7, y - 80), V(x + 8, y - 68)], gold, 2.2);
      g.lineStyle(1.6, light(gold, 0.5), 1);
      g.lineBetween(x - 6, y - 46, x - 6, y - 22);
      break;
    }
    case 'moonpetal':
    case 'ember_lily':
    case 'glass_tulip':
    case 'star_fern':
    case 'rainbow_rose':
      bloomPot(g, id, x, y);
      break;
    default:
      ball(g, x, y - 10, 10, 0xc9c0ab, 2.5);
  }
}

/** A mystery bloom from Ziggy's seed, in a terracotta pot. */
function bloomPot(g: G, id: string, x: number, y: number): void {
  const pot = 0xc8693f;
  // stems and leaves first, then the pot rim over them
  const green = id === 'star_fern' ? 0x4f9d3a : 0x5e9c4a;
  if (id !== 'star_fern') {
    stem(g, x, y - 16, x - 1, y - 34, green, 2.6);
    leaf(g, x - 1, y - 22, 12, 6, -1.0, green);
    leaf(g, x, y - 26, 12, 6, 1.05, light(green, 0.1));
  }
  const fy = y - 38;
  switch (id) {
    case 'moonpetal': {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        poly(g, ellipsePts(x + Math.cos(a) * 7, fy + Math.sin(a) * 6, 6, 4, a), i % 2 ? 0xb9c9f2 : 0xcfdcff, 1.8);
      }
      ball(g, x, fy, 3.6, 0xeef3ff, 1.6);
      twinkle(g, x + 13, fy - 10, 3, 0xe6efff);
      break;
    }
    case 'ember_lily': {
      for (const a of [-0.9, -0.3, 0.3, 0.9]) leaf(g, x, fy + 6, 15, 7, a, a < 0 ? 0xf2793a : 0xe8603a, 2);
      for (const a of [-0.45, 0.45]) stem(g, x, fy + 2, x + Math.sin(a) * 8, fy - 8, 0xffd54f, 1.4);
      ball(g, x, fy + 3, 3, 0xffd54f, 1.4);
      break;
    }
    case 'glass_tulip': {
      g.fillStyle(0x9fe3e8, 0.75);
      g.fillPoints([V(x - 9, fy - 8), V(x - 4, fy - 2), V(x, fy - 10), V(x + 4, fy - 2), V(x + 9, fy - 8), V(x + 8, fy + 6), V(x, fy + 10), V(x - 8, fy + 6)], true);
      g.lineStyle(2, INK, 1);
      g.strokePoints([V(x - 9, fy - 8), V(x - 4, fy - 2), V(x, fy - 10), V(x + 4, fy - 2), V(x + 9, fy - 8), V(x + 8, fy + 6), V(x, fy + 10), V(x - 8, fy + 6)], true);
      g.lineStyle(2, 0xffffff, 0.9);
      g.lineBetween(x - 5, fy - 3, x - 5, fy + 5);
      twinkle(g, x + 12, fy - 6, 3, 0xffffff);
      break;
    }
    case 'star_fern': {
      for (const a of [-1.1, -0.55, 0, 0.55, 1.1]) leaf(g, x, y - 16, 26, 7, a, a === 0 ? light(green, 0.1) : green, 2);
      for (const [dx, dy] of [
        [-12, -34],
        [10, -40],
        [0, -46],
        [15, -26],
      ])
        twinkle(g, x + dx, y + dy, 3, 0xfff3a0);
      break;
    }
    case 'rainbow_rose': {
      const rings = [0xe8506a, 0xf2a23a, 0xffd54f, 0x6fc36a, 0x5c8fe0, 0xa070d8];
      rings.forEach((col, i) => {
        const r = 11 - i * 1.6;
        poly(g, ellipsePts(x + (i % 2 ? 1 : -1), fy - i * 0.6, r, r * 0.8, i * 0.5), col, 1.6);
      });
      twinkle(g, x + 13, fy - 11, 3.4, 0xffffff);
      break;
    }
  }
  poly(g, [V(x - 12, y - 16), V(x + 12, y - 16), V(x + 9, y), V(x - 9, y)], pot, 2.2);
  poly(g, [V(x - 14, y - 20), V(x + 14, y - 20), V(x + 14, y - 15), V(x - 14, y - 15)], light(pot, 0.12), 2.2);
  g.fillStyle(shade(pot, 0.2), 1);
  g.fillRect(x + 3, y - 14, 5, 12);
}

// ── Moss ─────────────────────────────────────────────────────────

const FUR = 0xc98a4b;
const BELLY = 0xf3e1c4;
export const MOSS_BOUNDS = { left: -40, top: -44, right: 30, bottom: 12 };
/** Base of the tail, relative to Moss's anchor; the tail sprite wags around it. */
export const TAIL_AT = { x: 16, y: -12 };
export const TAIL_BOUNDS = { left: -4, top: -20, right: 16, bottom: 4 };
export const BONE_AT = { x: -16, y: -58 };
export const BONE_BOUNDS = { left: -18, top: -18, right: 18, bottom: 18 };

/** Moss napping: body and head, without the tail (that's its own sprite so it can wag). */
export function drawMoss(g: G, x: number, y: number): void {
  contact(g, x, y + 4, 26, 7, 0.16);
  // back legs and paws
  ball(g, x + 12, y - 2, 6, shade(FUR, 0.1), 2.5, 8, 5);
  ball(g, x - 16, y - 1, 5, BELLY, 2.2, 7, 4);
  // body
  ball(g, x + 2, y - 10, 11, FUR, 3, 20, 11);
  g.fillStyle(BELLY, 1);
  g.fillEllipse(x - 4, y - 5, 18, 9);
  g.fillStyle(shade(FUR, 0.3), 1);
  g.fillEllipse(x + 8, y - 16, 10, 5);
  // head
  ball(g, x - 16, y - 24, 12, FUR, 3);
  g.fillStyle(BELLY, 1);
  g.fillEllipse(x - 24, y - 20, 12, 9);
  // floppy ear
  poly(g, ellipsePts(x - 8, y - 26, 4.5, 8.5, 0.25, 16), 0x8b5a2b, 2.5);
  // sleepy eye, nose, collar
  g.lineStyle(2, INK, 1);
  g.beginPath();
  g.arc(x - 19, y - 27, 2.6, 0.2, Math.PI - 0.2);
  g.strokePath();
  ball(g, x - 29, y - 21, 2.8, 0x2a1a10, 1.2);
  stem(g, x - 9, y - 17, x - 7, y - 11, 0xc94a3a, 2.4);
  ball(g, x - 7, y - 10, 2.4, 0xffc531, 1.2);
}

/** The tail, pointing right from its base so the scene can rotate it to wag. */
export function drawTail(g: G, x: number, y: number): void {
  stem(g, x, y, x + 6, y - 9, FUR, 4);
  stem(g, x + 6, y - 9, x + 12, y - 14, FUR, 3.5);
  ball(g, x + 12, y - 14, 2.4, light(FUR, 0.25), 1.6);
}

export function drawBoneBubble(g: G, x: number, y: number): void {
  contact(g, x, y + 16, 7, 2, 0.1);
  ball(g, x, y, 14, 0xffffff, 3);
  const bone = 0xf8f1e0;
  g.fillStyle(bone, 1);
  g.lineStyle(2, INK, 1);
  g.fillRoundedRect(x - 8, y - 3, 16, 6, 3);
  g.strokeRoundedRect(x - 8, y - 3, 16, 6, 3);
  for (const [dx, dy] of [
    [-9, -2.5],
    [-9, 2.5],
    [9, -2.5],
    [9, 2.5],
  ]) {
    g.fillCircle(x + dx, y + dy, 3);
    g.strokeCircle(x + dx, y + dy, 3);
  }
  g.fillStyle(bone, 1);
  g.fillRect(x - 8, y - 2, 16, 4);
}

