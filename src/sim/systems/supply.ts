// VOC sea supply (spec §3.2, §4.11): every 3 game days a supply ship enters from the open sea and
// sails the main channel to the Zeelandia dock, unless Zheng ships or shore batteries cover the route.
import { findPath } from '../path/astar';
import type { Entity } from '../types';
import type { World } from '../world';
import { attackProfile, onBattery } from './combat';
import { dailyHooks } from './economy';
import { changeCastleMorale } from './morale';
import { isMoving, moveUnitTo } from './movement';

const VOC = 'faction_voc';
const ZHENG = 'faction_zheng';

function dock(world: World): Entity | undefined {
  return world.buildings().find((b) => b.type === 'dock_voc' && b.owner === VOC);
}

/** Water tile next to the dock where the supply ship unloads. */
function berth(world: World, d: Entity): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let y = d.ty! - 2; y <= d.ty! + d.h! + 1; y++)
    for (let x = d.tx! - 2; x <= d.tx! + d.w! + 1; x++) {
      if (!world.nav.passable('ship', x, y)) continue;
      const dist = Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y);
      if (dist < bestD) {
        bestD = dist;
        best = [x + 0.5, y + 0.5];
      }
    }
  return best;
}

/** Tiles of the supply route from the open sea to the berth. */
export function supplyRoute(world: World): number[] {
  const d = dock(world);
  if (!d) return [];
  const b = berth(world, d);
  if (!b) return [];
  const [sx, sy] = world.rules.supply.spawn;
  const res = findPath(world.nav, 'ship', Math.floor(sx), Math.floor(sy), Math.floor(b[0]), Math.floor(b[1]), 100000);
  // Densify the smoothed waypoints into tiles.
  const tiles: number[] = [];
  let px = sx;
  let py = sy;
  for (let i = 0; i < res.path.length; i += 2) {
    const nx = res.path[i];
    const ny = res.path[i + 1];
    const n = Math.ceil(Math.hypot(nx - px, ny - py) * 2);
    for (let k = 0; k <= n; k++) {
      const t = Math.floor(py + ((ny - py) * k) / n) * world.map.width + Math.floor(px + ((nx - px) * k) / n);
      if (tiles[tiles.length - 1] !== t) tiles.push(t);
    }
    px = nx;
    py = ny;
  }
  return tiles;
}

/** A Zheng ship, or a Zheng gun on a battery, whose fire covers any tile of the route. */
export function routeBlockaded(world: World): Entity | null {
  const route = supplyRoute(world);
  if (!route.length) return null;
  const W = world.map.width;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.owner !== ZHENG || u.insideOf) continue;
    const def = world.data.units.get(u.type)!;
    const armed = def.atk > 0 && !def.traits.includes('non_combat') && !def.traits.includes('suicide');
    if (!armed || !(def.naval || onBattery(world, u))) continue;
    const r = attackProfile(world, u).range + u.radius;
    for (const t of route) {
      const x = (t % W) + 0.5;
      const y = Math.floor(t / W) + 0.5;
      if ((x - u.x) ** 2 + (y - u.y) ** 2 <= r * r) return u;
    }
  }
  return null;
}

export function dispatchSupply(world: World): 'dispatched' | 'blocked' | 'no_dock' {
  const d = dock(world);
  if (!d) return 'no_dock';
  world.ext.supply.lastDispatchDay = world.day;
  const blocker = routeBlockaded(world);
  if (blocker) {
    world.emit({ type: 'supply_blocked', owner: VOC, by: blocker.id });
    return 'blocked';
  }
  const [sx, sy] = world.rules.supply.spawn;
  const ship = world.spawnUnit(world.rules.supply.shipType, VOC, sx, sy, 'supply_ship');
  const b = berth(world, d)!;
  moveUnitTo(world, ship, b[0], b[1]);
  world.ext.supply.ship = ship.id;
  world.emit({ type: 'supply_dispatched', owner: VOC, id: ship.id });
  return 'dispatched';
}

dailyHooks.push((world) => {
  const every = world.rules.supply.everyDays;
  if (world.day > 0 && world.day % every === 0 && world.ext.flags.supplyEnabled !== false) dispatchSupply(world);
});

export function supplySystem(world: World) {
  const id = world.ext.supply.ship;
  if (id === null) return;
  const ship = world.get(id);
  if (!ship) {
    world.ext.supply.ship = null;
    world.emit({ type: 'supply_sunk', owner: VOC });
    return;
  }
  const d = dock(world);
  if (ship.tag === 'supply_ship' && d && Math.hypot(ship.x - d.x, ship.y - d.y) - d.w! / 2 <= world.rules.supply.deliverRange) {
    const f = world.faction(VOC)!;
    f.resources.grain += world.rules.supply.grain;
    f.resources.powder += world.rules.supply.powder;
    changeCastleMorale(world, VOC, world.rules.morale.castle.supplyArrived, 'supply');
    world.emit({ type: 'supply_arrived', owner: VOC, grain: world.rules.supply.grain, powder: world.rules.supply.powder });
    ship.tag = 'supply_leaving';
    const [sx, sy] = world.rules.supply.spawn;
    moveUnitTo(world, ship, sx, sy);
    return;
  }
  if (ship.tag === 'supply_leaving' && !isMoving(ship)) {
    world.remove(ship.id);
    world.ext.supply.ship = null;
  }
  if (ship.tag === 'supply_ship' && !isMoving(ship) && d) {
    const b = berth(world, d);
    if (b) moveUnitTo(world, ship, b[0], b[1]);
  }
}

/** Seconds until the next scheduled supply ship (for the VOC HUD). */
export function supplySecondsLeft(world: World): number {
  const every = world.rules.supply.everyDays * world.rules.sim.ticksPerDay;
  return (every - (world.tick % every)) / world.ticksPerSecond;
}
