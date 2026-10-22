// Grid A* (8-way, diagonal cost √2, no corner cutting) plus line-of-sight smoothing (spec §10.4).
import { MinHeap } from './heap';
import type { MoveClass, NavGrids } from './navgrid';

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
] as const;
/** Fastest terrain multiplier (roads); keeps the heuristic admissible. */
const MAX_SPEED = 1.2;

export interface PathResult {
  /** Waypoints [x0, y0, x1, y1, …] in continuous tile coordinates, excluding the start. */
  path: number[];
  complete: boolean;
  expanded: number;
}

class Scratch {
  g: Float64Array;
  parent: Int32Array;
  stamp: Uint32Array;
  closed: Uint32Array;
  gen = 0;
  heap = new MinHeap();
  constructor(n: number) {
    this.g = new Float64Array(n);
    this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }
}
const scratch = new WeakMap<NavGrids, Scratch>();
const getScratch = (nav: NavGrids) => {
  let s = scratch.get(nav);
  if (!s) scratch.set(nav, (s = new Scratch(nav.width * nav.height)));
  return s;
};

/** Whether moving diagonally from (x,y) by (dx,dy) cuts a blocked corner. */
export function cutsCorner(nav: NavGrids, cls: MoveClass, x: number, y: number, dx: number, dy: number) {
  return dx !== 0 && dy !== 0 && (!nav.passable(cls, x + dx, y) || !nav.passable(cls, x, y + dy));
}

export function findPath(
  nav: NavGrids,
  cls: MoveClass,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
  maxNodes = 20000,
): PathResult {
  const W = nav.width;
  const s = getScratch(nav);
  const gen = ++s.gen;
  const { g, parent, stamp, closed, heap } = s;
  heap.clear();
  const start = sy * W + sx;
  const goal = gy * W + gx;
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return (Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy)) / MAX_SPEED;
  };
  g[start] = 0;
  parent[start] = -1;
  stamp[start] = gen;
  heap.push(start, h(sx, sy));
  let best = start;
  let bestH = h(sx, sy);
  let expanded = 0;
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur] === gen) continue;
    closed[cur] = gen;
    if (cur === goal) {
      found = true;
      break;
    }
    const cx = cur % W;
    const cy = (cur - cx) / W;
    const ch = h(cx, cy);
    if (ch < bestH) {
      bestH = ch;
      best = cur;
    }
    if (++expanded >= maxNodes) break;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const sp = nav.speedAt(cls, nx, ny);
      if (sp <= 0 || cutsCorner(nav, cls, cx, cy, dx, dy)) continue;
      const ni = ny * W + nx;
      if (closed[ni] === gen) continue;
      const ng = g[cur] + cost / sp;
      if (stamp[ni] !== gen || ng < g[ni]) {
        stamp[ni] = gen;
        g[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + h(nx, ny));
      }
    }
  }
  const end = found ? goal : best;
  const tiles: number[] = [];
  for (let i = end; i !== -1 && i !== start; i = parent[i]) tiles.push(i);
  tiles.reverse();
  const path: number[] = [];
  for (const t of tiles) path.push((t % W) + 0.5, Math.floor(t / W) + 0.5);
  return { path: smooth(nav, cls, sx + 0.5, sy + 0.5, path), complete: found, expanded };
}

/** True if a unit can walk the straight segment without entering blocked tiles or cutting corners. */
export function lineWalkable(nav: NavGrids, cls: MoveClass, x0: number, y0: number, x1: number, y1: number): boolean {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(dist / 0.25);
  let px = Math.floor(x0);
  let py = Math.floor(y0);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const tx = Math.floor(x0 + (x1 - x0) * t);
    const ty = Math.floor(y0 + (y1 - y0) * t);
    if (tx === px && ty === py) continue;
    if (!nav.passable(cls, tx, ty)) return false;
    if (tx !== px && ty !== py && (!nav.passable(cls, tx, py) || !nav.passable(cls, px, ty))) return false;
    px = tx;
    py = ty;
  }
  return true;
}

/** Greedy string-pulling: skip waypoints that are directly reachable. */
export function smooth(nav: NavGrids, cls: MoveClass, sx: number, sy: number, path: number[]): number[] {
  if (path.length <= 2) return path;
  const out: number[] = [];
  let ax = sx;
  let ay = sy;
  let i = 0;
  const n = path.length / 2;
  while (i < n) {
    let j = n - 1;
    while (j > i && !lineWalkable(nav, cls, ax, ay, path[j * 2], path[j * 2 + 1])) j--;
    out.push(path[j * 2], path[j * 2 + 1]);
    ax = path[j * 2];
    ay = path[j * 2 + 1];
    i = j + 1;
  }
  return out;
}

/** Nearest passable tile to (x, y) by expanding square rings; null if none within maxR. */
export function nearestPassable(nav: NavGrids, cls: MoveClass, x: number, y: number, maxR = 24): [number, number] | null {
  if (nav.passable(cls, x, y)) return [x, y];
  for (let r = 1; r <= maxR; r++) {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!nav.passable(cls, x + dx, y + dy)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [x + dx, y + dy];
        }
      }
    if (best) return best;
  }
  return null;
}
