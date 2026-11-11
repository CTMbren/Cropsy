import type { ObstacleKind } from '../core/farm';
import { TILE_H, TILE_W } from './iso';
import { ball, contact, ellipsePts, INK, leaf, light, mix, poly, shade, stem, twinkle, V, type G, type Pt } from './paint';

/** Code-drawn plot tiles and obstacles, baked once by the ArtRegistry like the crops. */

export const PLOT_INSET = 0.84;
export const PLOT_DEPTH = 10;
const W = TILE_W * PLOT_INSET;
const H = TILE_H * PLOT_INSET;

export const DIRT_SIDE_L = 0x7a4626;
export const DIRT_SIDE_R = 0x653a1f;
/** Bed colour per soil tier: plain, loam, rich, golden. */
const SOIL = [0xa86a3c, 0x8a5430, 0x6e3f22, 0x8a5a24];

export const SOIL_BOUNDS = { left: -W / 2 - 4, top: -H / 2 - 4, right: W / 2 + 4, bottom: H / 2 + PLOT_DEPTH + 4 };
export const OVERGROWN_BOUNDS = { left: -TILE_W * 0.47, top: -TILE_H * 0.47, right: TILE_W * 0.47, bottom: TILE_H * 0.47 + 2 };
export const OBSTACLE_BOUNDS = { left: -44, top: -54, right: 44, bottom: 22 };

const diamond = (cx: number, cy: number, w: number, h: number): Pt[] => [V(cx, cy - h / 2), V(cx + w / 2, cy), V(cx, cy + h / 2), V(cx - w / 2, cy)];
const lerp = (a: Pt, b: Pt, t: number): Pt => V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);

/** A raised wooden-edged bed of tilled soil: lit rim, sunken bed, furrow ridges, pebbles. */
export function drawSoil(g: G, cx: number, cy: number, tier: number): void {
  const base = SOIL[tier] ?? SOIL[0];
  const [n, e, s, w] = diamond(cx, cy, W, H);
  const down = (p: Pt, d = PLOT_DEPTH) => V(p.x, p.y + d);

  // sides, with a lit band along the top edge
  poly(g, [w, s, down(s), down(w)], DIRT_SIDE_L, 0);
  poly(g, [s, e, down(e), down(s)], DIRT_SIDE_R, 0);
  poly(g, [w, s, down(s, 3), down(w, 3)], light(DIRT_SIDE_L, 0.14), 0);
  poly(g, [s, e, down(e, 3), down(s, 3)], light(DIRT_SIDE_R, 0.1), 0);
  g.fillStyle(shade(DIRT_SIDE_L, 0.3), 1);
  for (const t of [0.2, 0.55, 0.8]) g.fillEllipse(lerp(w, s, t).x, lerp(w, s, t).y + 6.5, 3.5, 2);
  g.fillStyle(shade(DIRT_SIDE_R, 0.3), 1);
  for (const t of [0.3, 0.7]) g.fillEllipse(lerp(s, e, t).x, lerp(s, e, t).y + 6.5, 3.5, 2);

  // rim, then the sunken bed inside it
  poly(g, [n, e, s, w], light(base, 0.16), 0);
  const bed = diamond(cx, cy + 1, W * 0.86, H * 0.86);
  const [bn, be, bs, bw] = bed;
  poly(g, bed, base, 0);
  // inner walls: the back edges are in shadow, the front edges catch the light
  g.lineStyle(3, shade(base, 0.3), 1);
  g.lineBetween(bw.x, bw.y, bn.x, bn.y);
  g.lineBetween(bn.x, bn.y, be.x, be.y);
  g.lineStyle(1.5, light(base, 0.22), 1);
  g.lineBetween(bw.x + 1, bw.y + 1, bs.x, bs.y + 1);
  g.lineBetween(bs.x, bs.y + 1, be.x - 1, be.y + 1);

  // furrow ridges: dark trough below, lit crest above
  for (let i = 1; i < 4; i++) {
    const t = i / 4;
    const a = lerp(bw, bn, t);
    const b = lerp(bs, be, t);
    g.lineStyle(3.2, shade(base, 0.24), 1);
    g.lineBetween(a.x + 1, a.y + 1.4, b.x + 1, b.y + 1.4);
    g.lineStyle(1.6, light(base, 0.18), 1);
    g.lineBetween(a.x, a.y - 0.6, b.x, b.y - 0.6);
  }

  // pebbles and clods
  for (let i = 0; i < 9; i++) {
    const px = cx + ((i * 37) % 64) - 32;
    const py = cy + ((i * 23) % 24) - 11;
    if (Math.abs(px - cx) / (W * 0.4) + Math.abs(py - cy) / (H * 0.4) > 1) continue;
    g.fillStyle(i % 3 ? shade(base, 0.32) : light(base, 0.3), 1);
    g.fillEllipse(px, py, i % 2 ? 2.6 : 2, i % 2 ? 1.6 : 1.3);
  }
  if (tier >= 2) {
    // rich and golden soil glitter
    g.fillStyle(tier >= 3 ? 0xffd54f : 0xc9955c, 1);
    for (let i = 0; i < 7; i++) g.fillCircle(cx + ((i * 41) % 70) - 35, cy + ((i * 29) % 26) - 13, tier >= 3 ? 1.9 : 1.4);
    if (tier >= 3) {
      twinkle(g, cx - 22, cy - 6, 3.2, 0xfff3b0);
      twinkle(g, cx + 18, cy + 7, 2.6, 0xfff3b0);
    }
  }

  // ink outline: silhouette, front edges and the front corner
  g.lineStyle(3, INK, 1);
  g.strokePoints([n, e, down(e), down(s), down(w), w], true);
  g.lineBetween(w.x, w.y, s.x, s.y);
  g.lineBetween(s.x, s.y, e.x, e.y);
  g.lineBetween(s.x, s.y, s.x, s.y + PLOT_DEPTH);
}

/** Rough, darker grass where an obstacle still stands. */
export function drawOvergrown(g: G, cx: number, cy: number): void {
  const patch = diamond(cx, cy, TILE_W * 0.9, TILE_H * 0.9);
  poly(g, patch, 0x5f9e36, 0);
  poly(g, diamond(cx - 2, cy - 1, TILE_W * 0.7, TILE_H * 0.7), 0x67a83c, 0);
  g.lineStyle(2, 0x3f7a22, 1);
  g.strokePoints(patch, true);
  for (let i = 0; i < 14; i++) {
    const px = cx + ((i * 37) % 90) - 45;
    const py = cy + ((i * 23) % 40) - 20;
    if (Math.abs(px - cx) / 50 + Math.abs(py - cy) / 25 > 0.9) continue;
    g.lineStyle(1.6, i % 2 ? 0x4c8a2b : 0x7cc94f, 1);
    g.lineBetween(px - 2, py, px - 1, py - 5);
    g.lineBetween(px + 1.5, py, px + 2.5, py - 4);
  }
}

/** Obstacles on overgrown cells. `alt` picks the second shade of weeds. */
export function drawObstacleArt(g: G, kind: ObstacleKind, sx: number, sy: number, alt: boolean): void {
  if (kind === 'weeds') {
    contact(g, sx, sy + 2, 28, 9, 0.14);
    const tufts: [number, number][] = [
      [-22, -2],
      [0, -9],
      [20, -1],
      [-6, 10],
      [12, 7],
    ];
    const base = alt ? 0x4f9a2f : 0x5aa83a;
    for (const [dx, dy] of tufts) {
      const x = sx + dx;
      const y = sy + dy;
      leaf(g, x - 2, y, 18, 6, -0.38, shade(base, 0.08), 1.8);
      leaf(g, x + 2, y, 16, 6, 0.42, base, 1.8);
      leaf(g, x, y, 22, 6.5, 0.02, light(base, 0.14), 1.8);
    }
  } else if (kind === 'branch') {
    contact(g, sx - 2, sy + 2, 28, 7, 0.16);
    const bark = 0x8b5a2b;
    stem(g, sx - 26, sy + 4, sx + 22, sy - 10, bark, 6);
    stem(g, sx - 6, sy - 4, sx + 4, sy + 12, bark, 5);
    g.lineStyle(1.5, light(bark, 0.3), 1);
    g.lineBetween(sx - 22, sy + 1, sx + 14, sy - 9.5);
    leaf(g, sx + 20, sy - 10, 13, 9, 1.0, 0x5cb83a, 2);
    leaf(g, sx + 4, sy + 11, 10, 7, 2.4, 0x6cc040, 2);
  } else if (kind === 'stump') {
    contact(g, sx + 2, sy, 26, 10, 0.2);
    const bark = 0x6b4423;
    // trunk sides: lit left, shaded right
    g.fillStyle(bark, 1);
    g.fillRect(sx - 20, sy - 22, 40, 20);
    g.fillEllipse(sx, sy - 2, 40, 18);
    g.fillStyle(shade(bark, 0.25), 1);
    g.fillRect(sx + 4, sy - 22, 16, 20);
    g.fillEllipse(sx + 12, sy - 2, 16, 12);
    g.lineStyle(1.5, shade(bark, 0.45), 1);
    for (const dx of [-12, -4, 9, 15]) g.lineBetween(sx + dx, sy - 18, sx + dx, sy - 4);
    g.lineStyle(2.5, INK, 1);
    g.strokeEllipse(sx, sy - 2, 40, 18);
    g.fillStyle(bark, 1);
    g.fillRect(sx - 18.5, sy - 22, 4, 20);
    g.lineBetween(sx - 20, sy - 22, sx - 20, sy - 2);
    g.lineBetween(sx + 20, sy - 22, sx + 20, sy - 2);
    // cut face with rings
    g.fillStyle(0xd9a86c, 1);
    g.fillEllipse(sx, sy - 22, 40, 18);
    g.fillStyle(light(0xd9a86c, 0.25), 1);
    g.fillEllipse(sx - 4, sy - 24, 22, 8);
    g.lineStyle(2.5, INK, 1);
    g.strokeEllipse(sx, sy - 22, 40, 18);
    g.lineStyle(1.3, 0x9c6b3a, 1);
    g.strokeEllipse(sx, sy - 22, 26, 11);
    g.strokeEllipse(sx, sy - 22, 12, 5);
  } else if (kind === 'boulder') {
    contact(g, sx + 3, sy + 2, 36, 12, 0.22);
    rock(g, sx, sy - 16, 35, 25, 0x7d7d7d);
    g.lineStyle(2.5, INK, 1);
    g.lineBetween(sx + 4, sy - 38, sx + 10, sy - 22);
    g.lineBetween(sx + 10, sy - 22, sx + 2, sy - 10);
    g.lineStyle(1.5, light(0x7d7d7d, 0.3), 1);
    g.lineBetween(sx + 2.5, sy - 37, sx + 8.5, sy - 22);
    moss(g, sx - 18, sy - 2);
  } else {
    contact(g, sx + 3, sy + 3, 30, 10, 0.2);
    rock(g, sx, sy - 8, 26, 17, 0x8f8f8f);
    rock(g, sx + 18, sy + 1, 11, 7, 0x7a7a7a);
  }
}

/** A shaded lumpy rock. */
function rock(g: G, cx: number, cy: number, rx: number, ry: number, color: number): void {
  const pts = ellipsePts(cx, cy, rx, ry, 0, 14).map((p, i) => {
    const k = 1 + ((i * 7) % 5) * 0.025 - 0.05;
    return V(cx + (p.x - cx) * k, cy + (p.y - cy) * k);
  });
  g.fillStyle(shade(color, 0.28), 1);
  g.fillPoints(pts, true);
  g.fillStyle(color, 1);
  g.fillPoints(
    pts.map((p) => V(cx - rx * 0.08 + (p.x - cx) * 0.86, cy - ry * 0.12 + (p.y - cy) * 0.84)),
    true,
  );
  g.fillStyle(light(color, 0.3), 1);
  g.fillEllipse(cx - rx * 0.3, cy - ry * 0.4, rx * 0.95, ry * 0.5);
  g.fillStyle(0xffffff, 0.45);
  g.fillEllipse(cx - rx * 0.42, cy - ry * 0.52, rx * 0.35, ry * 0.18);
  g.lineStyle(2.5, INK, 1);
  g.strokePoints(pts, true);
}

function moss(g: G, x: number, y: number): void {
  const c = mix(0x7cb342, 0x5f9e36, 0.5);
  ball(g, x, y, 4, c, 1.5, 6, 3);
  ball(g, x + 6, y - 3, 3, light(c, 0.1), 1.5, 4, 2.4);
}
