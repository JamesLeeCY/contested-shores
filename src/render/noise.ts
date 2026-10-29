// Deterministic value noise for the terrain art (no Math.random: the same map always looks the same).

export function hash(x: number, y: number, k = 0): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1). */
export function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Three octaves of value noise in [0, 1). */
export function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.5 + vnoise(x * 2.03 + 17.1, y * 2.03 + 3.7) * 0.3 + vnoise(x * 4.11 + 5.3, y * 4.11 + 29.9) * 0.2;
}
