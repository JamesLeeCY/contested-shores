// Six precomputed passability grids: {foot, small_craft, ship} × {high, low tide} (spec §10.4).
import { TERRAIN_IDS, type GameMap } from '../map';

export type MoveClass = 'foot' | 'small_craft' | 'ship';
export const MOVE_CLASSES: MoveClass[] = ['foot', 'small_craft', 'ship'];

interface TerrainRule {
  foot: { high: number; low: number };
  smallCraft: { high: boolean; low: boolean };
  ship: { high: boolean; low: boolean };
  buildable: boolean;
}
export interface TerrainRules {
  order: string[];
  types: Record<string, TerrainRule & Record<string, unknown>>;
}

export class NavGrids {
  readonly width: number;
  readonly height: number;
  /** speed multiplier per tile; 0 = impassable. Index: [class][tideHigh ? 0 : 1]. */
  private readonly grids: Record<MoveClass, [Float32Array, Float32Array]>;
  /** Tiles occupied by buildings/walls (impassable for everyone). */
  readonly blocked: Uint8Array;
  /** Incremented whenever any grid that pathing depends on changes. */
  version = 0;
  tideHigh = true;

  constructor(
    readonly map: GameMap,
    terrainRules: TerrainRules,
  ) {
    this.width = map.width;
    this.height = map.height;
    const n = map.width * map.height;
    const mk = (): [Float32Array, Float32Array] => [new Float32Array(n), new Float32Array(n)];
    this.grids = { foot: mk(), small_craft: mk(), ship: mk() };
    this.blocked = new Uint8Array(n);
    for (let i = 0; i < n; i++) this.writeTile(i, terrainRules);
  }

  private writeTile(i: number, terrainRules: TerrainRules) {
    const id = TERRAIN_IDS[this.map.terrain[i]];
    const r = terrainRules.types[id];
    if (!r) throw new Error(`rules.terrain missing ${id}`);
    this.grids.foot[0][i] = r.foot.high;
    this.grids.foot[1][i] = r.foot.low;
    this.grids.small_craft[0][i] = r.smallCraft.high ? 1 : 0;
    this.grids.small_craft[1][i] = r.smallCraft.low ? 1 : 0;
    this.grids.ship[0][i] = r.ship.high ? 1 : 0;
    this.grids.ship[1][i] = r.ship.low ? 1 : 0;
  }

  /** Recomputes one tile after a terrain change. */
  updateTile(i: number, terrainRules: TerrainRules) {
    this.writeTile(i, terrainRules);
    this.version++;
  }

  setTide(high: boolean) {
    if (this.tideHigh !== high) {
      this.tideHigh = high;
      this.version++;
    }
  }

  grid(cls: MoveClass, tideHigh = this.tideHigh): Float32Array {
    return this.grids[cls][tideHigh ? 0 : 1];
  }

  /** Speed multiplier at a tile for a move class (0 when blocked or out of bounds). */
  speedAt(cls: MoveClass, x: number, y: number, tideHigh = this.tideHigh): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    const i = y * this.width + x;
    if (this.blocked[i]) return 0;
    return this.grid(cls, tideHigh)[i];
  }

  passable(cls: MoveClass, x: number, y: number, tideHigh = this.tideHigh): boolean {
    return this.speedAt(cls, x, y, tideHigh) > 0;
  }

  private comps: Partial<Record<MoveClass, { version: number; high: boolean; label: Int32Array }>> = {};

  /** Connected-component label of a tile for a move class at the current tide (0 = impassable). */
  component(cls: MoveClass, x: number, y: number): number {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
    let c = this.comps[cls];
    if (!c || c.version !== this.version || c.high !== this.tideHigh) {
      c = { version: this.version, high: this.tideHigh, label: this.label(cls) };
      this.comps[cls] = c;
    }
    return c.label[y * this.width + x];
  }

  /** Whether two tiles are mutually reachable (8-way, no corner cutting is ignored here). */
  connected(cls: MoveClass, ax: number, ay: number, bx: number, by: number): boolean {
    const a = this.component(cls, ax, ay);
    return a !== 0 && a === this.component(cls, bx, by);
  }

  private label(cls: MoveClass): Int32Array {
    const { width: W, height: H } = this;
    const out = new Int32Array(W * H);
    const stack: number[] = [];
    let next = 1;
    for (let i = 0; i < W * H; i++) {
      if (out[i] || !this.passable(cls, i % W, (i / W) | 0)) continue;
      out[i] = next;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop()!;
        const x = j % W;
        const y = (j - x) / W;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const k = ny * W + nx;
            if (out[k] || !this.passable(cls, nx, ny)) continue;
            out[k] = next;
            stack.push(k);
          }
      }
      next++;
    }
    return out;
  }

  setBlocked(x: number, y: number, w: number, h: number, value: boolean) {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++)
        if (xx >= 0 && yy >= 0 && xx < this.width && yy < this.height) this.blocked[yy * this.width + xx] = value ? 1 : 0;
    this.version++;
  }
}

/** Breadth-first reachability on a move-class grid. `allow` can further restrict tiles. */
export function reachable(
  nav: NavGrids,
  cls: MoveClass,
  tideHigh: boolean,
  from: [number, number],
  to: (x: number, y: number) => boolean,
  allow: (x: number, y: number) => boolean = () => true,
): boolean {
  const { width, height } = nav;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const [fx, fy] = from;
  if (!nav.passable(cls, fx, fy, tideHigh)) return false;
  queue.push(fy * width + fx);
  seen[fy * width + fx] = 1;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const x = i % width;
    const y = (i - x) / width;
    if (to(x, y)) return true;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (seen[j] || !nav.passable(cls, nx, ny, tideHigh) || !allow(nx, ny)) continue;
        // No corner cutting between two blocked orthogonal neighbours.
        if (dx && dy && !nav.passable(cls, x + dx, y, tideHigh) && !nav.passable(cls, x, y + dy, tideHigh)) continue;
        seen[j] = 1;
        queue.push(j);
      }
  }
  return false;
}
