// Unit movement: per-unit A* paths, shared flow fields for big groups, local separation,
// and stranding/flood handling (spec §4.8, §10.4).
import { T } from '../map';
import { lineWalkable } from '../path/astar';
import { PathService } from '../path/pathing';
import type { MoveClass } from '../path/navgrid';
import type { Entity } from '../types';
import type { World } from '../world';

const ARRIVE = 0.12;
const FLOW_DIRECT_RADIUS = 4;
const GROUP_FLOW_THRESHOLD = 8;
const SLOT_SPACING: Record<MoveClass, number> = { foot: 0.75, small_craft: 1.5, ship: 2.4 };

export function isMoving(e: Entity) {
  return e.goalX !== undefined;
}

export function clearMove(world: World, e: Entity) {
  e.goalX = e.goalY = undefined;
  e.path = null;
  e.pathIdx = 0;
  e.flowKey = null;
  e.pathPending = false;
  e.stuck = 0;
  e.chasing = false;
  world.paths.cancel(e.id);
}

/** Sends a single unit towards (x, y) using A*. */
export function moveUnitTo(world: World, e: Entity, x: number, y: number) {
  clearMove(world, e);
  e.goalX = x;
  e.goalY = y;
  if (lineWalkable(world.nav, e.moveClass!, e.x, e.y, x, y) && Math.hypot(x - e.x, y - e.y) < 12) {
    e.path = [x, y];
    return;
  }
  e.pathPending = true;
  world.paths.request({
    id: e.id,
    cls: e.moveClass!,
    sx: Math.floor(e.x),
    sy: Math.floor(e.y),
    gx: Math.floor(x),
    gy: Math.floor(y),
  });
}

/** Formation slots around a target: rings of passable points, nearest first. */
export function formationSlots(world: World, cls: MoveClass, x: number, y: number, n: number): [number, number][] {
  const spacing = SLOT_SPACING[cls];
  const slots: [number, number][] = [];
  if (world.nav.passable(cls, Math.floor(x), Math.floor(y))) slots.push([x, y]);
  for (let ring = 1; slots.length < n && ring < 40; ring++) {
    const pts: [number, number, number][] = [];
    for (let iy = -ring; iy <= ring; iy++)
      for (let ix = -ring; ix <= ring; ix++) {
        if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) continue;
        const sx = x + ix * spacing;
        const sy = y + iy * spacing;
        if (!world.nav.passable(cls, Math.floor(sx), Math.floor(sy))) continue;
        pts.push([sx, sy, ix * ix + iy * iy]);
      }
    pts.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    for (const p of pts) if (slots.length < n) slots.push([p[0], p[1]]);
  }
  while (slots.length < n) slots.push([x, y]);
  return slots;
}

/** Group move: assigns formation slots; >8 units of one class share a flow field. */
export function moveGroup(world: World, units: Entity[], x: number, y: number) {
  const byClass = new Map<MoveClass, Entity[]>();
  for (const u of units) {
    const list = byClass.get(u.moveClass!) ?? [];
    list.push(u);
    byClass.set(u.moveClass!, list);
  }
  for (const [cls, group] of [...byClass.entries()].sort()) {
    const slots = formationSlots(world, cls, x, y, group.length);
    // Units nearest the target take the nearest slots; ties by id.
    const order = [...group].sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) || a.id - b.id);
    const taken = new Uint8Array(slots.length);
    const flow = group.length > GROUP_FLOW_THRESHOLD ? world.paths.flow(cls, Math.floor(x), Math.floor(y)) : null;
    for (const u of order) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < slots.length; i++) {
        if (taken[i]) continue;
        const d = (slots[i][0] - u.x) ** 2 + (slots[i][1] - u.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      taken[best] = 1;
      const [sx, sy] = slots[best];
      if (flow) {
        clearMove(world, u);
        u.goalX = sx;
        u.goalY = sy;
        u.flowKey = PathService.key(flow);
      } else moveUnitTo(world, u, sx, sy);
    }
  }
}

/** Terrain speed multiplier for a unit at its current tile. */
export function terrainSpeed(world: World, e: Entity): number {
  const tx = Math.floor(e.x);
  const ty = Math.floor(e.y);
  const cls = e.moveClass!;
  let s = world.nav.speedAt(cls, tx, ty);
  // Leaving a tile that just became impassable (e.g. flooded flats): wade out slowly.
  if (s <= 0) s = 0.5;
  if (cls === 'small_craft' && world.map.terrain[ty * world.map.width + tx] === T.shallow)
    s *= (world.rules.naval.smallCraftShallowSpeedMul as Record<string, number>)[e.owner] ?? 1;
  return s;
}

export type SpeedModifier = (world: World, e: Entity) => number;
/** Extra multipliers (morale, auras, territory bonuses) registered by later systems. */
export const speedModifiers: SpeedModifier[] = [];

function nextWaypoint(world: World, e: Entity): [number, number] | null {
  const gx = e.goalX!;
  const gy = e.goalY!;
  if (e.flowKey) {
    if (Math.hypot(gx - e.x, gy - e.y) < FLOW_DIRECT_RADIUS && lineWalkable(world.nav, e.moveClass!, e.x, e.y, gx, gy))
      return [gx, gy];
    const flow = world.paths.flowByKey(e.flowKey);
    const n = flow?.next(Math.floor(e.x), Math.floor(e.y));
    if (n) return n;
    return lineWalkable(world.nav, e.moveClass!, e.x, e.y, gx, gy) ? [gx, gy] : null;
  }
  if (!e.path) return null;
  while (e.pathIdx! * 2 < e.path.length) {
    const wx = e.path[e.pathIdx! * 2];
    const wy = e.path[e.pathIdx! * 2 + 1];
    const last = (e.pathIdx! + 1) * 2 >= e.path.length;
    if (!last && Math.hypot(wx - e.x, wy - e.y) < 0.35) {
      e.pathIdx!++;
      continue;
    }
    return [wx, wy];
  }
  return null;
}

function arrive(world: World, e: Entity) {
  const chasing = e.chasing;
  clearMove(world, e);
  if (e.order?.type === 'move' && !chasing) e.order = { type: 'idle' };
}

export function movementSystem(world: World) {
  // Resolve queued path requests within this tick's budget.
  world.paths.run((req, res) => {
    const e = world.get(req.id);
    if (!e || !e.pathPending) return;
    e.pathPending = false;
    e.path = res.path.length ? res.path : null;
    e.pathIdx = 0;
    if (!e.path) {
      // Unreachable, or already as close as we can get.
      arrive(world, e);
      return;
    }
    // A* targets the nearest passable tile; keep the exact goal only if it is reachable.
    if (res.complete && e.goalX !== undefined) {
      const lx = e.path[e.path.length - 2];
      const ly = e.path[e.path.length - 1];
      if (Math.floor(lx) === Math.floor(e.goalX) && Math.floor(ly) === Math.floor(e.goalY!)) {
        e.path[e.path.length - 2] = e.goalX;
        e.path[e.path.length - 1] = e.goalY!;
      }
    }
  });

  const hz = world.ticksPerSecond;
  for (const e of world.all()) {
    if (e.kind !== 'unit' || e.insideOf) continue;
    e.px = e.x;
    e.py = e.y;
    if (!isMoving(e) || e.stranded || e.pathPending) continue;
    const wp = nextWaypoint(world, e);
    if (!wp) {
      arrive(world, e);
      continue;
    }
    const def = world.data.units.get(e.type)!;
    let speed = def.speed * terrainSpeed(world, e);
    for (const m of speedModifiers) speed *= m(world, e);
    const step = speed / hz;
    const dx = wp[0] - e.x;
    const dy = wp[1] - e.y;
    const dist = Math.hypot(dx, dy);
    const isGoal = wp[0] === e.goalX && wp[1] === e.goalY;
    if (dist <= step) {
      tryStep(world, e, wp[0], wp[1]);
      if (isGoal) arrive(world, e);
      else if (e.path) e.pathIdx!++;
    } else {
      e.facing = Math.atan2(dy, dx);
      tryStep(world, e, e.x + (dx / dist) * step, e.y + (dy / dist) * step);
    }
    if (isMoving(e) && Math.hypot(e.goalX! - e.x, e.goalY! - e.y) < ARRIVE) arrive(world, e);
  }

  separation(world);

  // Stuck handling: units that are blocked (usually by a crowd at the goal) give up when close,
  // otherwise re-path.
  for (const e of world.all()) {
    if (e.kind !== 'unit' || !isMoving(e) || e.pathPending) continue;
    const progress = Math.hypot(e.x - e.px, e.y - e.py);
    e.stuck = progress < 0.005 ? (e.stuck ?? 0) + 1 : Math.max(0, (e.stuck ?? 0) - 2);
    const left = Math.hypot(e.goalX! - e.x, e.goalY! - e.y);
    if (e.stuck > 20 && left < 2.5) arrive(world, e);
    else if (e.stuck > 60) {
      if (left < 6) arrive(world, e);
      else moveUnitTo(world, e, e.goalX!, e.goalY!);
    }
  }
}

/** Moves to (x, y) if the destination tile is enterable; returns whether it moved. */
function tryStep(world: World, e: Entity, x: number, y: number): boolean {
  const cls = e.moveClass!;
  const fx = Math.floor(e.x);
  const fy = Math.floor(e.y);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if ((tx !== fx || ty !== fy) && !world.nav.passable(cls, tx, ty)) {
    // Blocked mid-path (tide or new building): re-plan.
    if (!e.flowKey && e.goalX !== undefined) moveUnitTo(world, e, e.goalX, e.goalY!);
    return false;
  }
  e.x = x;
  e.y = y;
  return true;
}

/** Pushes overlapping units apart (same layer: land vs water). Deterministic, ascending id. */
function separation(world: World) {
  world.rebuildSpatial();
  for (const a of world.all()) {
    if (a.kind !== 'unit' || a.insideOf || a.stranded) continue;
    const aNaval = a.moveClass !== 'foot';
    for (const b of world.unitsNear(a.x, a.y, a.radius + 1.0)) {
      if (b.id <= a.id || b.stranded || (b.moveClass !== 'foot') !== aNaval) continue;
      const min = a.radius + b.radius;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) {
        // Coincident: separate along a direction derived from the ids.
        const ang = ((a.id * 7919 + b.id * 104729) % 628) / 100;
        dx = Math.cos(ang);
        dy = Math.sin(ang);
        d = 1;
      }
      const push = (min - Math.min(d, min)) * 0.5;
      const nx = dx / d;
      const ny = dy / d;
      // Moving units shove idle ones more than the reverse.
      const aw = isMoving(a) && !isMoving(b) ? 0.2 : isMoving(b) && !isMoving(a) ? 0.8 : 0.5;
      nudge(world, a, -nx * push * 2 * aw, -ny * push * 2 * aw);
      nudge(world, b, nx * push * 2 * (1 - aw), ny * push * 2 * (1 - aw));
    }
  }
}

function nudge(world: World, e: Entity, dx: number, dy: number) {
  const nx = e.x + dx;
  const ny = e.y + dy;
  const fx = Math.floor(e.x);
  const fy = Math.floor(e.y);
  if ((Math.floor(nx) !== fx || Math.floor(ny) !== fy) && !world.nav.passable(e.moveClass!, Math.floor(nx), Math.floor(ny))) return;
  e.x = nx;
  e.y = ny;
}
