import * as Phaser from 'phaser';

/**
 * Small painting kit for the code-drawn art, following the art spec: one warm-brown ink outline,
 * light from the top-left, two-tone cel shading (base + one warmer shadow) and a single highlight.
 */

export type G = Phaser.GameObjects.Graphics;
export type Pt = Phaser.Math.Vector2;

export const INK = 0x4a2e1a;
const SHADOW_TINT = 0x3a1f0c;

export const V = (x: number, y: number): Pt => new Phaser.Math.Vector2(x, y);

/** Linear blend of two 0xRRGGBB colours. */
export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const gg = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gg << 8) | bl;
}

/** The one shadow tone: darker and a little warmer, as the spec asks. */
export const shade = (c: number, t = 0.24): number => mix(c, SHADOW_TINT, t);
export const light = (c: number, t = 0.3): number => mix(c, 0xffffff, t);

/** Soft contact shadow that sits things on the ground. */
export function contact(g: G, cx: number, cy: number, rx: number, ry: number, alpha = 0.18): void {
  g.fillStyle(0x000000, alpha);
  g.fillEllipse(cx, cy, rx * 2, ry * 2);
}

export function ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 22): Pt[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push(V(cx + x * c - y * s, cy + x * s + y * c));
  }
  return pts;
}

/** Fill a polygon and outline it in ink. */
export function poly(g: G, pts: Pt[], color: number, line = 2): void {
  g.fillStyle(color, 1);
  g.fillPoints(pts, true);
  if (line > 0) {
    g.lineStyle(line, INK, 1);
    g.strokePoints(pts, true);
  }
}

/**
 * A pointed leaf growing from (bx, by). `angle` is radians from straight up (negative leans left).
 * The half facing away from the top-left light gets the shadow tone; a thin midrib runs down it.
 */
export function leaf(g: G, bx: number, by: number, len: number, width: number, angle: number, color: number, line = 2): void {
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const nx = -dy;
  const ny = dx;
  const left: Pt[] = [];
  const right: Pt[] = [];
  const steps = 9;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = (width / 2) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.8);
    const px = bx + dx * len * t;
    const py = by + dy * len * t;
    left.push(V(px - nx * w, py - ny * w));
    right.push(V(px + nx * w, py + ny * w));
  }
  const outline = [...left, ...[...right].reverse()];
  g.fillStyle(color, 1);
  g.fillPoints(outline, true);
  // shadow on the half facing down-right, away from the light
  const half = nx + ny > 0 ? right : left;
  const mid: Pt[] = [];
  for (let i = 0; i <= steps; i++) mid.push(V(bx + dx * len * (i / steps), by + dy * len * (i / steps)));
  g.fillStyle(shade(color, 0.22), 1);
  g.fillPoints([...mid, ...[...half].reverse()], true);
  g.lineStyle(1.2, shade(color, 0.4), 0.8);
  g.lineBetween(bx + dx * len * 0.12, by + dy * len * 0.12, bx + dx * len * 0.82, by + dy * len * 0.82);
  if (line > 0) {
    g.lineStyle(line, INK, 1);
    g.strokePoints(outline, true);
  }
}

/** A shaded round fruit: shadow crescent bottom-right, highlight top-left, ink outline. */
export function ball(g: G, cx: number, cy: number, r: number, color: number, line = 2, rx = r, ry = r): void {
  g.fillStyle(shade(color, 0.28), 1);
  g.fillEllipse(cx, cy, rx * 2, ry * 2);
  g.fillStyle(color, 1);
  g.fillEllipse(cx - rx * 0.13, cy - ry * 0.13, rx * 1.72, ry * 1.72);
  g.fillStyle(0xffffff, 0.55);
  g.fillEllipse(cx - rx * 0.38, cy - ry * 0.42, rx * 0.62, ry * 0.4);
  if (line > 0) {
    g.lineStyle(line, INK, 1);
    g.strokeEllipse(cx, cy, rx * 2, ry * 2);
  }
}

/** A thick ink line with a coloured core, for stems and stalks. */
export function stem(g: G, x1: number, y1: number, x2: number, y2: number, color: number, w = 2.5): void {
  g.lineStyle(w + 2, INK, 1);
  g.lineBetween(x1, y1, x2, y2);
  g.lineStyle(w, color, 1);
  g.lineBetween(x1, y1, x2, y2);
}

/** A tiny four-point twinkle. */
export function twinkle(g: G, cx: number, cy: number, r: number, color = 0xffffff): void {
  g.fillStyle(color, 1);
  g.fillTriangle(cx - r * 0.35, cy, cx, cy - r, cx + r * 0.35, cy);
  g.fillTriangle(cx - r * 0.35, cy, cx, cy + r, cx + r * 0.35, cy);
  g.fillTriangle(cx, cy - r * 0.35, cx + r, cy, cx, cy + r * 0.35);
  g.fillTriangle(cx, cy - r * 0.35, cx - r, cy, cx, cy + r * 0.35);
}
