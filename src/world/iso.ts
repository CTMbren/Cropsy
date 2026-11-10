/** 2:1 diamond isometric projection. Tile is 128×64 logical pixels. */
export const TILE_W = 128;
export const TILE_H = 64;

export function cellToScreen(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) };
}

/** Inverse of cellToScreen for the tile's centre; returns fractional cell coordinates. */
export function screenToCell(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
