import { ball, contact, ellipsePts, INK, leaf, light, mix, poly, shade, stem, twinkle, type G } from './paint';

/**
 * Code-drawn crop art, one shaded plant shape per crop, painted once and baked into a texture by the
 * ArtRegistry. Four plants per plot, drawn back to front. Ripe crops show their produce so they read
 * from silhouette alone at phone size; growing crops show foliage only (or unripe fruit).
 */

export type CropStage = 'seed' | 'sprout' | 'growing' | 'ripe';

interface Colors {
  leaf: number;
  fruit: number;
}

type Plant = (g: G, x: number, y: number, s: number, c: Colors, ripe: boolean) => void;

/** Plant positions on the plot top, back to front. */
const SPOTS: [number, number][] = [
  [0, -13],
  [-19, -2],
  [19, -2],
  [0, 9],
];

const TALL = new Set(['corn', 'sunflower']);

/** Box around the plot centre that a crop's drawing fits in (see ArtRegistry bounds). */
export function cropBounds(id: string): { left: number; top: number; right: number; bottom: number } {
  return { left: -40, top: TALL.has(id) ? -74 : -58, right: 40, bottom: 22 };
}

export function drawCropArt(g: G, id: string, stage: CropStage, leafColor: number, fruitColor: number, cx: number, cy: number): void {
  const c = { leaf: leafColor, fruit: fruitColor };
  const plant = PLANTS[id] ?? radish;
  for (const [dx, dy] of SPOTS) {
    const x = cx + dx;
    const y = cy + dy;
    if (stage === 'seed') seed(g, x, y);
    else if (stage === 'sprout') sprout(g, x, y, c);
    else {
      const s = stage === 'ripe' ? 1 : 0.8;
      contact(g, x, y + 1, 10 * s, 4 * s);
      plant(g, x, y, s, c, stage === 'ripe');
    }
  }
}

// ── shared stages ────────────────────────────────────────────────

function seed(g: G, x: number, y: number): void {
  g.fillStyle(0x5b3418, 1);
  g.fillEllipse(x, y + 1, 13, 6);
  g.fillStyle(0x7a4626, 1);
  g.fillEllipse(x - 1, y, 9, 4);
  g.fillStyle(0xe8d3a0, 1);
  g.fillEllipse(x + 1, y - 0.5, 3, 2);
}

function sprout(g: G, x: number, y: number, c: Colors): void {
  contact(g, x, y + 1, 5, 2);
  const l = light(c.leaf, 0.12);
  stem(g, x, y, x, y - 5, l, 1.6);
  leaf(g, x, y - 4, 8, 6, -1.0, l, 1.6);
  leaf(g, x, y - 4, 8, 6, 1.0, l, 1.6);
}

// ── plants ───────────────────────────────────────────────────────

const radish: Plant = (g, x, y, s, c, ripe) => {
  leaf(g, x, y - 3 * s, 14 * s, 7 * s, -0.6, c.leaf);
  leaf(g, x, y - 3 * s, 13 * s, 7 * s, 0.6, c.leaf);
  leaf(g, x, y - 3 * s, 16 * s, 7 * s, 0.02, light(c.leaf, 0.08));
  if (ripe) ball(g, x, y - 1, 6.5, c.fruit);
  else ball(g, x, y, 3.5, c.fruit, 1.5);
};

const carrot: Plant = (g, x, y, s, c, ripe) => {
  for (const a of [-0.75, -0.38, 0, 0.38, 0.75]) leaf(g, x, y - 2 * s, (14 + (a === 0 ? 3 : 0)) * s, 4 * s, a, a > 0 ? shade(c.leaf, 0.08) : c.leaf, 1.6);
  if (ripe) {
    ball(g, x, y, 6, c.fruit, 2, 6.5, 4.2);
    g.lineStyle(1.2, shade(c.fruit, 0.35), 1);
    g.lineBetween(x - 3, y + 1.5, x + 1, y + 1.5);
  } else ball(g, x, y, 3, c.fruit, 1.5, 3.5, 2.2);
};

const potato: Plant = (g, x, y, s, c, ripe) => {
  const lf = light(c.leaf, 0.18);
  for (const a of [-1.15, -0.62, -0.12, 0.38, 0.85, 1.25]) leaf(g, x, y - 2 * s, 11 * s, 9.5 * s, a, a > 0.3 ? shade(lf, 0.06) : lf);
  if (ripe) {
    ball(g, x - 4, y + 2, 4, c.fruit, 2, 4.8, 3.6);
    ball(g, x + 4.5, y + 3, 4, c.fruit, 2, 4.4, 3.4);
    flower(g, x - 2, y - 12, 0xffffff, 0xffd54f, 2.4);
    flower(g, x + 6, y - 9, 0xffffff, 0xffd54f, 2.2);
  }
};

const lettuce: Plant = (g, x, y, s, c, ripe) => {
  const r = ripe ? 1 : 0.8;
  const outer = (front: boolean) => {
    for (let i = 0; i < 7; i++) {
      const t = (i / 7) * Math.PI * 2 + 0.3;
      if (Math.sin(t) > 0 !== front) continue;
      const lx = x + Math.cos(t) * 7 * r;
      const ly = y - 5 * r + Math.sin(t) * 3.5 * r;
      poly(g, ellipsePts(lx, ly, 6.5 * r, 4.5 * r, t), front ? c.leaf : shade(c.leaf, 0.18), 1.8);
    }
  };
  outer(false);
  ball(g, x, y - 7 * r, (ripe ? 7.5 : 5) * s, ripe ? c.fruit : light(c.leaf, 0.2), 2);
  if (ripe) {
    g.lineStyle(1.2, shade(c.fruit, 0.3), 1);
    g.lineBetween(x - 2, y - 12, x + 2, y - 4);
  }
  outer(true);
};

const strawberry: Plant = (g, x, y, s, c, ripe) => {
  stem(g, x, y, x, y - 7 * s, shade(c.leaf, 0.1), 1.6);
  for (const a of [-0.95, 0, 0.95]) leaf(g, x, y - 6 * s, 10 * s, 9 * s, a, a > 0 ? shade(c.leaf, 0.06) : c.leaf);
  if (!ripe) {
    flower(g, x + 5, y - 3, 0xffffff, 0xffd54f, 2.6);
    return;
  }
  berry(g, x - 7, y + 1, c);
  berry(g, x + 6.5, y + 2, c);
  berry(g, x, y - 1, c);
};

function berry(g: G, x: number, y: number, c: Colors): void {
  const pts = ellipsePts(x, y, 4, 4.6, 0, 18).map((p) => {
    if (p.y > y) p.x = x + (p.x - x) * (1 - ((p.y - y) / 4.6) * 0.45);
    return p;
  });
  g.fillStyle(shade(c.fruit, 0.25), 1);
  g.fillPoints(pts, true);
  g.fillStyle(c.fruit, 1);
  g.fillPoints(
    pts.map((p) => p.clone().set(x - 0.6 + (p.x - x) * 0.85, y - 0.6 + (p.y - y) * 0.85)),
    true,
  );
  g.lineStyle(1.8, INK, 1);
  g.strokePoints(pts, true);
  g.fillStyle(0xffe082, 1);
  for (const [dx, dy] of [
    [-1.5, -0.5],
    [1.4, 0.2],
    [0, 2],
    [-0.4, -2],
  ])
    g.fillCircle(x + dx, y + dy, 0.55);
  g.fillStyle(c.leaf, 1);
  g.fillTriangle(x - 3.5, y - 4, x, y - 6, x + 3.5, y - 4);
  g.lineStyle(1.2, INK, 1);
  g.strokeTriangle(x - 3.5, y - 4, x, y - 6, x + 3.5, y - 4);
}

const blueberry: Plant = (g, x, y, s, c, ripe) => {
  const bush = shade(c.leaf, 0.05);
  ball(g, x - 5 * s, y - 6 * s, 6.5 * s, bush, 2);
  ball(g, x + 5 * s, y - 6 * s, 6.5 * s, shade(bush, 0.1), 2);
  ball(g, x, y - 11 * s, 7 * s, light(bush, 0.08), 2);
  if (!ripe) return;
  for (const [dx, dy] of [
    [-6, -5],
    [-3, -3],
    [4, -8],
    [7, -5],
    [1, -13],
    [-2, -10],
  ])
    ball(g, x + dx, y + dy, 2.5, c.fruit, 1.3);
};

const coffee: Plant = (g, x, y, s, c, ripe) => {
  // glossy, brighter than its dark content colour so it doesn't read as a black blob
  const lf = light(c.leaf, 0.28);
  stem(g, x, y, x, y - 19 * s, 0x6b4a2b, 2);
  for (const [h, len, w] of [
    [5, 11, 8],
    [11, 10, 7],
    [16, 8, 6],
  ]) {
    leaf(g, x, y - h * s, len * s, w * s, -1.1, light(lf, 0.08));
    leaf(g, x, y - h * s, len * s, w * s, 1.1, lf);
  }
  leaf(g, x, y - 18 * s, 7 * s, 5 * s, 0, lf);
  if (!ripe) return;
  const cherry = mix(c.fruit, 0xd84315, 0.45);
  for (const [dx, dy] of [
    [-2.6, -7],
    [2.6, -8],
    [-2.6, -12.5],
    [2.6, -13.5],
  ])
    ball(g, x + dx, y + dy, 2.7, cherry, 1.3);
};

const wheat: Plant = (g, x, y, s, c, ripe) => {
  const straw = ripe ? c.leaf : 0x8bc34a;
  const head = ripe ? c.fruit : 0xaed581;
  leaf(g, x, y - 2, 11 * s, 3.5 * s, -0.7, straw, 1.4);
  leaf(g, x, y - 2, 11 * s, 3.5 * s, 0.7, shade(straw, 0.08), 1.4);
  for (const [dx, h] of [
    [-5, 21],
    [-1.5, 25],
    [2, 23],
    [5.5, 20],
  ]) {
    const top = y - h * s;
    stem(g, x + dx * 0.5, y, x + dx, top + 4, straw, 1.4);
    ball(g, x + dx, top, 2.3, head, 1.4, 2.4, 5.2);
    g.lineStyle(1, shade(head, 0.4), 1);
    for (const k of [-2.5, 0, 2.5]) g.lineBetween(x + dx - 1.6, top + k, x + dx + 1.6, top + k - 1);
  }
};

const tomato: Plant = (g, x, y, s, c, ripe) => {
  stake(g, x + 6, y, 26 * s);
  stem(g, x, y, x + 1, y - 22 * s, shade(c.leaf, 0.1), 1.8);
  for (const [h, a] of [
    [6, -1.0],
    [11, 1.0],
    [16, -0.9],
    [20, 0.8],
  ])
    leaf(g, x, y - h * s, 9 * s, 7 * s, a, a > 0 ? shade(c.leaf, 0.08) : c.leaf);
  const fruit = ripe ? c.fruit : 0x9ccc65;
  const r = ripe ? 4.6 : 3;
  for (const [dx, dy] of [
    [-5, -8],
    [4, -13],
    [-3, -18],
  ])
    ball(g, x + dx, y + dy * s, r, fruit);
};

const grapes: Plant = (g, x, y, s, c, ripe) => {
  stake(g, x - 7, y, 24 * s);
  // vine climbing the stake and arching over the plant
  stem(g, x - 6, y - 3, x - 6, y - 21 * s, 0x8d6e4a, 1.6);
  stem(g, x - 6, y - 21 * s, x + 6, y - 17 * s, 0x8d6e4a, 1.6);
  for (const [dx, dy, a] of [
    [-6, -20, -0.9],
    [-1, -21, -0.1],
    [5, -18, 0.8],
    [-6, -10, -1.2],
  ])
    leaf(g, x + dx * s, y + dy * s, 9 * s, 9 * s, a, a > 0 ? shade(c.leaf, 0.08) : c.leaf);
  const fruit = ripe ? c.fruit : 0xaed581;
  const r = ripe ? 2.8 : 2.1;
  let row = 0;
  for (const n of ripe ? [4, 3, 2, 1] : [3, 2, 1]) {
    for (let i = 0; i < n; i++) ball(g, x + 2 + (i - (n - 1) / 2) * r * 1.7, y - (15 - row * r * 1.55) * s, r, fruit, 1.3);
    row++;
  }
};

const corn: Plant = (g, x, y, s, c, ripe) => {
  const h = 36 * s;
  for (const [hh, len, a] of [
    [6, 17, -1.15],
    [12, 17, 1.15],
  ])
    leaf(g, x, y - hh * s, len * s, 5 * s, a, a > 0 ? shade(c.leaf, 0.1) : c.leaf, 1.8);
  stem(g, x, y, x, y - h, c.leaf, 3.4);
  if (ripe) {
    ball(g, x + 4, y - 20, 3.6, c.fruit, 1.8, 3.6, 7.5);
    g.fillStyle(shade(c.fruit, 0.25), 1);
    for (let i = -2; i <= 2; i++) for (const dx of [-1.2, 1.2]) g.fillCircle(x + 4 + dx, y - 20 + i * 2.6, 0.6);
    leaf(g, x + 2, y - 13, 12, 6, 0.32, light(c.leaf, 0.1), 1.8);
  }
  for (const [hh, len, a] of [
    [20, 15, -0.95],
    [26, 13, 0.95],
  ])
    leaf(g, x, y - hh * s, len * s, 4.5 * s, a, a > 0 ? shade(c.leaf, 0.1) : c.leaf, 1.8);
  // tassel
  const tassel = ripe ? 0xd4a73a : light(c.leaf, 0.2);
  for (const a of [-0.5, 0, 0.5]) stem(g, x, y - h, x + Math.sin(a) * 5, y - h - Math.cos(a) * 5, tassel, 1.2);
};

const sunflower: Plant = (g, x, y, s, c, ripe) => {
  const h = 36 * s;
  stem(g, x, y, x, y - h, c.leaf, 2.8);
  leaf(g, x, y - 10 * s, 12 * s, 8 * s, -1.2, c.leaf);
  leaf(g, x, y - 16 * s, 12 * s, 8 * s, 1.2, shade(c.leaf, 0.1));
  if (!ripe) {
    ball(g, x, y - h - 2, 4, light(c.leaf, 0.15), 1.8);
    return;
  }
  const fy = y - h - 3;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    leaf(g, x + Math.sin(a) * 3, fy - Math.cos(a) * 3, 7.5, 4.5, a, i % 2 ? shade(c.fruit, 0.08) : c.fruit, 1.3);
  }
  ball(g, x, fy, 5, 0x6d4c2a, 1.8);
  g.fillStyle(0x4a321c, 1);
  for (const [dx, dy] of [
    [-1.8, 0.8],
    [1.6, 1.4],
    [0.2, -1.8],
    [1.8, -0.6],
    [-1.4, -1.2],
  ])
    g.fillCircle(x + dx, fy + dy, 0.6);
};

const pumpkin: Plant = (g, x, y, s, c, ripe) => {
  gourdLeaves(g, x, y, s, c);
  const fruit = ripe ? c.fruit : mix(c.fruit, c.leaf, 0.65);
  gourd(g, x, y - 4 * s, (ripe ? 8 : 4.5) * 1, (ripe ? 6.2 : 3.6) * 1, fruit, true);
  if (ripe) stem(g, x, y - 10, x + 1.5, y - 13.5, 0x6d8b2f, 2);
};

const goldenMelon: Plant = (g, x, y, s, c, ripe) => {
  gourdLeaves(g, x, y, s, c);
  const fruit = ripe ? c.fruit : mix(c.fruit, c.leaf, 0.65);
  const rx = ripe ? 7.5 : 4.5;
  const ry = ripe ? 6.5 : 3.8;
  gourd(g, x, y - 4 * s, rx, ry, fruit, false);
  if (!ripe) return;
  g.lineStyle(1, light(fruit, 0.55), 0.9);
  for (const k of [-0.5, 0, 0.5]) {
    g.lineBetween(x - rx * 0.7, y - 4 + k * ry * 1.2 - 2, x + rx * 0.7, y - 4 + k * ry * 1.2 + 2);
    g.lineBetween(x - rx * 0.7, y - 4 + k * ry * 1.2 + 2, x + rx * 0.7, y - 4 + k * ry * 1.2 - 2);
  }
  g.lineStyle(2, INK, 1);
  g.strokeEllipse(x, y - 4, rx * 2, ry * 2);
  twinkle(g, x + 5, y - 11, 2.6);
  twinkle(g, x - 6, y - 2, 1.8);
};

const cotton: Plant = (g, x, y, s, c, ripe) => {
  const wood = 0x8d6e4a;
  const tips: [number, number][] = [
    [-6, -14],
    [0, -18],
    [6, -13],
  ];
  for (const [dx, dy] of tips) stem(g, x, y, x + dx * s, y + dy * s, wood, 1.5);
  leaf(g, x, y - 6 * s, 9 * s, 7 * s, -1.0, c.leaf);
  leaf(g, x, y - 7 * s, 9 * s, 7 * s, 1.0, shade(c.leaf, 0.08));
  for (const [dx, dy] of tips) {
    const bx = x + dx * s;
    const by = y + dy * s;
    if (!ripe) {
      ball(g, bx, by, 2.6, light(c.leaf, 0.15), 1.4);
      continue;
    }
    const fluff = c.fruit;
    ball(g, bx - 2.4, by + 0.5, 3, fluff, 1.4);
    ball(g, bx + 2.4, by + 0.5, 3, fluff, 1.4);
    ball(g, bx, by - 2.2, 3.2, fluff, 1.4);
  }
};

// ── helpers ──────────────────────────────────────────────────────

function flower(g: G, x: number, y: number, petal: number, middle: number, r: number): void {
  g.fillStyle(petal, 1);
  g.lineStyle(1, INK, 1);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillCircle(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55);
    g.strokeCircle(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, r * 0.55);
  }
  g.fillStyle(middle, 1);
  g.fillCircle(x, y, r * 0.45);
}

function stake(g: G, x: number, y: number, h: number): void {
  g.fillStyle(0xc98a4b, 1);
  g.fillRect(x - 1.5, y - h, 3, h);
  g.fillStyle(shade(0xc98a4b, 0.25), 1);
  g.fillRect(x + 0.3, y - h, 1.2, h);
  g.lineStyle(1.5, INK, 1);
  g.strokeRect(x - 1.5, y - h, 3, h);
}

function gourdLeaves(g: G, x: number, y: number, s: number, c: Colors): void {
  leaf(g, x - 3, y - 1, 11 * s, 11 * s, -1.25, c.leaf);
  leaf(g, x + 3, y - 1, 11 * s, 11 * s, 1.25, shade(c.leaf, 0.1));
  leaf(g, x, y - 3, 10 * s, 10 * s, 0.1, light(c.leaf, 0.06));
}

/** A ribbed gourd body. */
function gourd(g: G, x: number, y: number, rx: number, ry: number, color: number, ribs: boolean): void {
  ball(g, x, y, rx, color, 0, rx, ry);
  if (ribs) {
    g.lineStyle(1.3, shade(color, 0.35), 1);
    for (const k of [0.35, 0.7]) g.strokeEllipse(x, y, rx * 2 * k, ry * 2);
  }
  g.lineStyle(2, INK, 1);
  g.strokeEllipse(x, y, rx * 2, ry * 2);
}

const PLANTS: Record<string, Plant> = {
  radish,
  carrot,
  lettuce,
  strawberry,
  wheat,
  tomato,
  corn,
  potato,
  blueberry,
  pumpkin,
  sunflower,
  cotton,
  grapes,
  coffee,
  golden_melon: goldenMelon,
};
