import { ball, contact, ellipsePts, INK, light, poly, shade, V, type G } from './paint';
import type { CritterShape } from '../core/critters';

/**
 * Code-drawn Meadow Visitors, in the thick-outline style. Each is about 30 px across with its
 * anchor where it sits on the crop; fliers hover a little above. Baked once per species by the
 * ArtRegistry, then bobbed and wobbled by the scene.
 */

export const CRITTER_BOUNDS = { left: -22, top: -40, right: 22, bottom: 8 };

const eyes = (g: G, x: number, y: number, gap = 4, r = 1.6) => {
  g.fillStyle(0xffffff, 1);
  g.fillCircle(x - gap / 2, y, r + 1);
  g.fillCircle(x + gap / 2, y, r + 1);
  g.fillStyle(INK, 1);
  g.fillCircle(x - gap / 2 + 0.4, y + 0.3, r);
  g.fillCircle(x + gap / 2 + 0.4, y + 0.3, r);
};

const wing = (g: G, cx: number, cy: number, rx: number, ry: number, rot: number, color: number, alpha = 1) => {
  const pts = ellipsePts(cx, cy, rx, ry, rot, 18);
  g.fillStyle(color, alpha);
  g.fillPoints(pts, true);
  g.lineStyle(2, INK, 1);
  g.strokePoints(pts, true);
};

export function drawCritter(g: G, shape: CritterShape, color: number, x: number, y: number): void {
  switch (shape) {
    case 'ladybug': {
      contact(g, x, y + 2, 11, 4);
      ball(g, x, y - 8, 10, color, 2.5, 11, 9);
      g.lineStyle(2, INK, 1);
      g.lineBetween(x, y - 17, x, y + 1);
      g.fillStyle(INK, 1);
      for (const [dx, dy] of [
        [-5, -11],
        [5, -11],
        [-6, -5],
        [6, -5],
        [0, -2],
      ])
        g.fillCircle(x + dx, y + dy, 1.8);
      ball(g, x, y - 18, 5, 0x2b2b2b, 2);
      eyes(g, x, y - 19, 4, 1);
      break;
    }
    case 'bee': {
      wing(g, x - 7, y - 24, 6, 9, -0.5, 0xffffff, 0.85);
      wing(g, x + 7, y - 24, 6, 9, 0.5, 0xffffff, 0.85);
      ball(g, x, y - 14, 9, color, 2.5, 11, 9);
      g.lineStyle(3, INK, 1);
      g.lineBetween(x - 3, y - 22, x - 3, y - 6);
      g.lineBetween(x + 4, y - 21, x + 4, y - 7);
      ball(g, x - 12, y - 15, 5, color, 2);
      eyes(g, x - 13, y - 16, 3.5, 1);
      g.lineStyle(2, INK, 1);
      g.lineBetween(x + 11, y - 14, x + 15, y - 13);
      break;
    }
    case 'snail': {
      contact(g, x, y + 2, 14, 4);
      poly(g, [V(x - 15, y + 1), V(x + 12, y + 1), V(x + 9, y - 5), V(x - 12, y - 4)], 0xd9c39a, 2);
      ball(g, x + 2, y - 12, 10, color, 2.5);
      g.lineStyle(2, shade(color, 0.35), 1);
      g.beginPath();
      for (let a = 0; a < Math.PI * 3.2; a += 0.3) {
        const r = 1 + a * 0.85;
        g.lineTo(x + 2 + Math.cos(a) * r, y - 12 + Math.sin(a) * r);
      }
      g.strokePath();
      g.lineStyle(2, INK, 1);
      g.lineBetween(x - 12, y - 4, x - 15, y - 14);
      g.lineBetween(x - 10, y - 4, x - 10, y - 14);
      g.fillStyle(INK, 1);
      g.fillCircle(x - 15, y - 15, 2);
      g.fillCircle(x - 10, y - 15, 2);
      break;
    }
    case 'caterpillar': {
      contact(g, x, y + 2, 15, 4);
      const stripe = color === 0xf5c542 ? INK : light(color, 0.35);
      for (let i = 4; i >= 0; i--) {
        const bx = x + 12 - i * 6;
        const by = y - 5 - Math.sin(i * 1.1) * 3;
        ball(g, bx, by, 5.5, color, 2);
        g.fillStyle(stripe, 0.8);
        g.fillRect(bx - 1, by - 5, 2, 4);
      }
      ball(g, x - 14, y - 10, 7, color, 2.5);
      eyes(g, x - 15, y - 11, 4, 1.2);
      g.lineStyle(2, INK, 1);
      g.lineBetween(x - 17, y - 16, x - 19, y - 21);
      g.lineBetween(x - 12, y - 17, x - 11, y - 22);
      break;
    }
    case 'butterfly': {
      const lo = shade(color, 0.12);
      wing(g, x - 9, y - 26, 9, 11, -0.35, color);
      wing(g, x + 9, y - 26, 9, 11, 0.35, color);
      wing(g, x - 7, y - 13, 6, 7, 0.4, lo);
      wing(g, x + 7, y - 13, 6, 7, -0.4, lo);
      g.fillStyle(INK, 0.55);
      g.fillCircle(x - 11, y - 28, 2.5);
      g.fillCircle(x + 11, y - 28, 2.5);
      poly(g, ellipsePts(x, y - 19, 2.6, 11), 0x3a2a1a, 1.5);
      g.lineStyle(1.6, INK, 1);
      g.lineBetween(x - 1, y - 29, x - 4, y - 36);
      g.lineBetween(x + 1, y - 29, x + 4, y - 36);
      break;
    }
    case 'beetle': {
      contact(g, x, y + 2, 12, 4);
      g.lineStyle(2, INK, 1);
      for (const s of [-1, 1]) {
        g.lineBetween(x + s * 6, y - 4, x + s * 12, y + 1);
        g.lineBetween(x + s * 7, y - 9, x + s * 13, y - 8);
      }
      ball(g, x, y - 9, 10, color, 2.5, 10, 10);
      g.lineStyle(2, shade(color, 0.4), 1);
      g.lineBetween(x, y - 18, x, y);
      ball(g, x, y - 20, 5.5, shade(color, 0.3), 2);
      if (color === 0x7a4a2a) {
        // the stag beetle's jaws
        g.lineStyle(3, INK, 1);
        g.lineBetween(x - 3, y - 24, x - 7, y - 31);
        g.lineBetween(x + 3, y - 24, x + 7, y - 31);
      }
      eyes(g, x, y - 21, 4, 1);
      break;
    }
    case 'dragonfly': {
      wing(g, x - 12, y - 24, 12, 4, -0.15, 0xe8f6ff, 0.9);
      wing(g, x + 12, y - 24, 12, 4, 0.15, 0xe8f6ff, 0.9);
      wing(g, x - 11, y - 19, 10, 3.5, 0.2, 0xe8f6ff, 0.9);
      wing(g, x + 11, y - 19, 10, 3.5, -0.2, 0xe8f6ff, 0.9);
      poly(g, ellipsePts(x, y - 12, 2.8, 14), color, 2);
      ball(g, x, y - 26, 5, light(color, 0.15), 2);
      eyes(g, x, y - 27, 5, 1.4);
      break;
    }
    case 'moth': {
      wing(g, x - 10, y - 22, 11, 9, -0.6, color);
      wing(g, x + 10, y - 22, 11, 9, 0.6, color);
      g.fillStyle(light(color, 0.4), 1);
      g.fillCircle(x - 11, y - 22, 3);
      g.fillCircle(x + 11, y - 22, 3);
      poly(g, ellipsePts(x, y - 17, 3.5, 9), light(color, 0.25), 2);
      g.lineStyle(1.6, INK, 1);
      for (const s of [-1, 1]) {
        g.lineBetween(x + s, y - 25, x + s * 6, y - 33);
        g.lineBetween(x + s * 6, y - 33, x + s * 3, y - 31);
      }
      eyes(g, x, y - 24, 4, 1);
      break;
    }
  }
}
