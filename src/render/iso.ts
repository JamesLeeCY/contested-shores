// 2:1 isometric projection; each logical tile is drawn as a 64×32 diamond (spec §6.1).
export const TILE_W = 64;
export const TILE_H = 32;

/** Continuous tile coordinates → world pixels. Tile (x, y) spans [x, x+1) × [y, y+1). */
export function toScreen(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** World pixels → continuous tile coordinates. */
export function toTile(sx: number, sy: number): { x: number; y: number } {
  const a = sx / (TILE_W / 2);
  const b = sy / (TILE_H / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}
