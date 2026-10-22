// Ship transport (transport_N: carries N population of foot units).
import { ownedUnits, registerCommand } from '../commands';
import { nearestPassable } from '../path/astar';
import type { Entity } from '../types';
import type { World } from '../world';
import { clearMove, isMoving, moveUnitTo } from './movement';

export function capacityOf(world: World, ship: Entity): number {
  for (const t of world.data.units.get(ship.type)?.traits ?? []) {
    const m = /^transport_(\d+)$/.exec(t);
    if (m) return Number(m[1]);
  }
  return 0;
}

export function cargoPop(world: World, ship: Entity): number {
  return (ship.cargo ?? []).reduce((s, id) => s + (world.data.units.get(world.entities.get(id)?.type ?? '')?.pop ?? 0), 0);
}

/** Puts a unit straight into a ship (scenario setup, or on arrival). Returns false if full. */
export function loadInto(world: World, ship: Entity, u: Entity): boolean {
  const pop = world.data.units.get(u.type)!.pop;
  if (cargoPop(world, ship) + pop > capacityOf(world, ship)) return false;
  clearMove(world, u);
  ship.cargo ??= [];
  ship.cargo.push(u.id);
  u.insideOf = ship.id;
  u.order = { type: 'idle' };
  u.x = u.px = ship.x;
  u.y = u.py = ship.y;
  return true;
}

/** Drops all cargo on free land within reach of the ship. Returns how many came ashore. */
export function unloadAll(world: World, ship: Entity): number {
  const R = world.rules.transport.unloadRange;
  let n = 0;
  for (const id of [...(ship.cargo ?? [])]) {
    const u = world.entities.get(id);
    if (!u) continue;
    const p = nearestPassable(world.nav, 'foot', Math.floor(ship.x), Math.floor(ship.y), Math.ceil(R) + 1);
    if (!p || Math.hypot(p[0] + 0.5 - ship.x, p[1] + 0.5 - ship.y) > R + 1) break;
    ship.cargo = ship.cargo!.filter((c) => c !== id);
    u.insideOf = null;
    // Spread the landing party a little so they do not stack on one point.
    const jx = ((n % 3) - 1) * 0.35;
    const jy = ((Math.floor(n / 3) % 3) - 1) * 0.35;
    const fx = world.nav.passable('foot', Math.floor(p[0] + 0.5 + jx), Math.floor(p[1] + 0.5 + jy)) ? jx : 0;
    const fy = world.nav.passable('foot', Math.floor(p[0] + 0.5 + fx), Math.floor(p[1] + 0.5 + jy)) ? jy : 0;
    u.x = u.px = p[0] + 0.5 + fx;
    u.y = u.py = p[1] + 0.5 + fy;
    u.order = { type: 'idle' };
    n++;
  }
  if (n) world.emit({ type: 'unloaded', ship: ship.id, count: n, owner: ship.owner });
  return n;
}

function nearShore(world: World, ship: Entity): boolean {
  const R = world.rules.transport.unloadRange;
  const p = nearestPassable(world.nav, 'foot', Math.floor(ship.x), Math.floor(ship.y), Math.ceil(R) + 1);
  return !!p && Math.hypot(p[0] + 0.5 - ship.x, p[1] + 0.5 - ship.y) <= R + 1;
}

registerCommand('embark', (world, cmd) => {
  const ship = world.get(cmd.target);
  if (!ship || ship.owner !== cmd.owner || !capacityOf(world, ship)) return;
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (u.moveClass !== 'foot') continue;
    clearMove(world, u);
    u.order = { type: 'embark', target: ship.id };
  }
});

registerCommand('unload', (world, cmd) => {
  for (const ship of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (!ship.cargo?.length) continue;
    if (cmd.x === undefined || cmd.y === undefined) {
      unloadAll(world, ship);
      continue;
    }
    ship.order = { type: 'unload', x: cmd.x, y: cmd.y };
    // Sail to the water tile nearest the landing point.
    const w = nearestPassable(world.nav, ship.moveClass!, Math.floor(cmd.x), Math.floor(cmd.y), 12);
    if (w) moveUnitTo(world, ship, w[0] + 0.5, w[1] + 0.5);
  }
});

export function transportSystem(world: World) {
  const R = world.rules.transport.embarkRange;
  for (const u of world.all()) {
    if (u.kind !== 'unit') continue;
    const o = u.order;
    if (o?.type === 'embark' && !u.insideOf) {
      const ship = world.get(o.target);
      if (!ship) {
        u.order = { type: 'idle' };
        continue;
      }
      if (Math.hypot(ship.x - u.x, ship.y - u.y) <= R + ship.radius) {
        if (!loadInto(world, ship, u)) u.order = { type: 'idle' };
        continue;
      }
      if (!isMoving(u) || (world.tick + u.id) % 20 === 0) {
        const p = nearestPassable(world.nav, 'foot', Math.floor(ship.x), Math.floor(ship.y), 6);
        if (p) moveUnitTo(world, u, p[0] + 0.5, p[1] + 0.5);
      }
    } else if (o?.type === 'unload' && u.cargo?.length) {
      const close = Math.hypot(o.x - u.x, o.y - u.y) < 6;
      if ((close || !isMoving(u)) && nearShore(world, u)) {
        clearMove(world, u);
        unloadAll(world, u);
        u.order = { type: 'idle' };
      } else if (!isMoving(u)) u.order = { type: 'idle' };
    }
    // Cargo rides along.
    if (u.cargo?.length) for (const id of u.cargo) {
      const c = world.entities.get(id);
      if (c) {
        c.x = c.px = u.x;
        c.y = c.py = u.y;
      }
    }
  }
}
