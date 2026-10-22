// Path request queue with a deterministic per-tick budget (spec §10.4: requests over budget
// wait for the next tick). The budget is counted in expanded nodes, not wall-clock time,
// so that replays stay identical on any machine.
import { findPath, nearestPassable, type PathResult } from './astar';
import { FlowField } from './flowfield';
import type { MoveClass, NavGrids } from './navgrid';

export interface PathRequest {
  id: number;
  cls: MoveClass;
  sx: number;
  sy: number;
  gx: number;
  gy: number;
}

export const NODE_BUDGET_PER_TICK = 60000;

export class PathService {
  private queue: PathRequest[] = [];
  private flows = new Map<string, FlowField>();
  expandedThisTick = 0;

  constructor(readonly nav: NavGrids) {}

  request(r: PathRequest) {
    // A newer request for the same entity replaces the old one.
    this.queue = this.queue.filter((q) => q.id !== r.id);
    this.queue.push(r);
  }

  cancel(id: number) {
    this.queue = this.queue.filter((q) => q.id !== id);
  }

  get pendingCount() {
    return this.queue.length;
  }

  /** Processes queued requests in FIFO order until the budget is spent. */
  run(apply: (req: PathRequest, res: PathResult) => void) {
    this.expandedThisTick = 0;
    while (this.queue.length && this.expandedThisTick < NODE_BUDGET_PER_TICK) {
      const req = this.queue.shift()!;
      const goal = nearestPassable(this.nav, req.cls, req.gx, req.gy) ?? [req.gx, req.gy];
      const res = findPath(this.nav, req.cls, req.sx, req.sy, goal[0], goal[1], NODE_BUDGET_PER_TICK);
      this.expandedThisTick += res.expanded;
      apply(req, res);
    }
  }

  /** Shared flow field towards a goal tile; recomputed when the nav grids change. */
  flow(cls: MoveClass, gx: number, gy: number): FlowField {
    const goal = nearestPassable(this.nav, cls, gx, gy) ?? [gx, gy];
    const key = `${cls}:${goal[0]},${goal[1]}`;
    let f = this.flows.get(key);
    if (!f || f.version !== this.nav.version) {
      f = new FlowField(this.nav, cls, goal[0], goal[1], this.nav.version);
      this.expandedThisTick += f.expanded;
      this.flows.set(key, f);
      if (this.flows.size > 32) this.flows.delete(this.flows.keys().next().value!);
    }
    return f;
  }

  flowByKey(key: string): FlowField | undefined {
    const f = this.flows.get(key);
    if (!f) return undefined;
    return f.version === this.nav.version ? f : this.flow(f.cls, f.gx, f.gy);
  }

  static key(f: FlowField) {
    return `${f.cls}:${f.gx},${f.gy}`;
  }
}
