// Shared integration field for group moves of more than 8 units (spec §10.4).
import { cutsCorner } from './astar';
import { MinHeap } from './heap';
import type { MoveClass, NavGrids } from './navgrid';

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

export class FlowField {
  /** Travel cost to the goal per tile; Infinity = unreachable. */
  readonly cost: Float32Array;
  expanded = 0;

  constructor(
    readonly nav: NavGrids,
    readonly cls: MoveClass,
    readonly gx: number,
    readonly gy: number,
    readonly version: number,
  ) {
    const W = nav.width;
    const n = W * nav.height;
    this.cost = new Float32Array(n).fill(Infinity);
    const heap = new MinHeap();
    const goal = gy * W + gx;
    this.cost[goal] = 0;
    heap.push(goal, 0);
    while (heap.size) {
      const cur = heap.pop();
      const cx = cur % W;
      const cy = (cur - cx) / W;
      const c = this.cost[cur];
      this.expanded++;
      // Costs are symmetric: entering `cur` from a neighbour costs step / speed(cur).
      const sp = nav.speedAt(cls, cx, cy) || 1;
      for (const [dx, dy, step] of DIRS) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (!nav.passable(cls, nx, ny) || cutsCorner(nav, cls, cx, cy, dx, dy)) continue;
        const ni = ny * W + nx;
        const nc = c + step / sp;
        if (nc < this.cost[ni]) {
          this.cost[ni] = nc;
          heap.push(ni, nc);
        }
      }
    }
  }

  /** Best neighbouring tile centre to step towards from tile (x, y), or null at/without a route. */
  next(x: number, y: number): [number, number] | null {
    const W = this.nav.width;
    const here = this.nav.passable(this.cls, x, y) ? this.cost[y * W + x] : Infinity;
    let best: [number, number] | null = null;
    let bestC = here;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= this.nav.height) continue;
      if (cutsCorner(this.nav, this.cls, x, y, dx, dy)) continue;
      const c = this.cost[ny * W + nx];
      if (c < bestC) {
        bestC = c;
        best = [nx + 0.5, ny + 0.5];
      }
    }
    return best;
  }

  reachableFrom(x: number, y: number) {
    return Number.isFinite(this.cost[y * this.nav.width + x]) || this.next(x, y) !== null;
  }
}
