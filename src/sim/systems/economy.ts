// Gathering, carrying and drop-off; daily grain upkeep and starvation; powder mills; deer regrowth;
// tuntian farming (spec §3.1, §4.1–4.3).
import type { ResourceId } from '../../data/schema';
import { ownedUnits, registerCommand } from '../commands';
import { closestPointOnRect, distToEntity } from '../geometry';
import { T } from '../map';
import { nearestPassable } from '../path/astar';
import { isGatherer } from '../stats';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { clearMove, isMoving, moveUnitTo } from './movement';

type GatherOrder = Extract<NonNullable<Entity['order']>, { type: 'gather' }>;

/** AI factions' income multiplier by difficulty (spec §8.3). */
export function incomeMul(world: World, owner: Owner): number {
  const ai = world.ext.ai[owner];
  return ai ? world.rules.difficulty[ai.difficulty].incomeMul : 1;
}

/** Whether a faction may gather from a farm (own, or a farm whose owner is allied — see diplomacy). */
export const farmAccess: { allowed: (world: World, owner: Owner, farm: Entity) => boolean } = {
  allowed: (_world, owner, farm) => farm.owner === owner,
};

function gatherRate(world: World, e: Entity, res: ResourceId): number {
  const rates = (world.rules.gather.rates as Record<string, Partial<Record<ResourceId, number>>>)[e.type];
  return rates?.[res] ?? 0;
}

function farmUsers(world: World, farm: Entity, except?: number): number {
  let n = 0;
  for (const u of world.all())
    if (u.kind === 'unit' && u.id !== except && u.order?.type === 'gather' && u.order.target === farm.id) n++;
  return n;
}

/** Resource type of a gather target (entity or forest tile), or null if not gatherable. */
export function resourceOf(world: World, target: Entity | null, tile: number | null): ResourceId | null {
  if (target?.type === 'farm' && (target.built ?? 1) >= 1) return 'grain';
  if (target?.type === 'deer_herd' && (target.amount ?? 0) > 0) return 'deerskin';
  if (tile !== null && world.map.terrain[tile] === T.forest && world.woodLeft[tile] > 0) return 'wood';
  return null;
}

export function startGather(world: World, u: Entity, target: Entity | null, tile: number | null): boolean {
  const res = resourceOf(world, target, tile);
  if (!res || gatherRate(world, u, res) <= 0) return false;
  if (target?.type === 'farm') {
    if (!farmAccess.allowed(world, u.owner, target)) return false;
    if (farmUsers(world, target, u.id) >= (world.data.buildings.get('farm') as { gatherPoint?: { maxGatherers: number } }).gatherPoint!.maxGatherers)
      return false;
  }
  clearMove(world, u);
  const carrying = u.carrying && u.carrying.resource !== res ? undefined : u.carrying;
  u.carrying = carrying;
  u.order = { type: 'gather', resource: res, target: target?.id, tile: tile ?? undefined, phase: 'to_resource' };
  return true;
}

registerCommand('gather', (world, cmd) => {
  const target = cmd.target !== undefined ? (world.get(cmd.target) ?? null) : null;
  const tile = cmd.tile ?? null;
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) if (isGatherer(world, u)) startGather(world, u, target, tile);
});

function sourcePoint(world: World, o: GatherOrder, u: Entity): [number, number] | null {
  if (o.target !== undefined) {
    const t = world.get(o.target);
    if (!t) return null;
    if (t.kind === 'building') {
      // Spread farm workers across the field.
      const slot = (u.id % 3) - 1;
      return [t.x + slot * 0.8, t.y + slot * 0.4];
    }
    return [t.x, t.y];
  }
  if (o.tile === undefined) return null;
  const x = o.tile % world.map.width;
  const y = Math.floor(o.tile / world.map.width);
  return [x + 0.5, y + 0.5];
}

function distToSource(world: World, o: GatherOrder, u: Entity): number {
  if (o.target !== undefined) {
    const t = world.get(o.target);
    if (!t) return Infinity;
    return t.kind === 'building' ? distToEntity(u.x, u.y, t) : Math.hypot(t.x - u.x, t.y - u.y);
  }
  const x = o.tile! % world.map.width;
  const y = Math.floor(o.tile! / world.map.width);
  const dx = Math.max(x - u.x, 0, u.x - (x + 1));
  const dy = Math.max(y - u.y, 0, u.y - (y + 1));
  return Math.hypot(dx, dy);
}

export function forestEdge(world: World, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && world.nav.passable('foot', x + dx, y + dy)) return true;
  return false;
}

/** Nearest complete own drop-off building (spec §4.2: main base, warehouse, camp). */
export function nearestDropoff(world: World, u: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of world.all()) {
    if (b.kind !== 'building' || b.owner !== u.owner || (b.built ?? 1) < 1) continue;
    if (!world.data.buildings.get(b.type)!.dropoff) continue;
    const d = distToEntity(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

/** A forest tile with wood that touches walkable ground, nearest to `from` (excluding `skip`). */
function nextForestTile(world: World, from: number, skip?: number): number | null {
  const W = world.map.width;
  const fx = from % W;
  const fy = Math.floor(from / W);
  const R = world.rules.gather.autoNextRadius;
  let best: number | null = null;
  let bestD = Infinity;
  for (let y = fy - R; y <= fy + R; y++)
    for (let x = fx - R; x <= fx + R; x++) {
      if (x < 0 || y < 0 || x >= W || y >= world.map.height) continue;
      const i = y * W + x;
      if (i === skip || world.map.terrain[i] !== T.forest || world.woodLeft[i] <= 0) continue;
      if (!forestEdge(world, x, y)) continue;
      const d = (x - fx) ** 2 + (y - fy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
  return best;
}

function nextHerd(world: World, u: Entity, from: Entity | undefined): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  const ox = from?.x ?? u.x;
  const oy = from?.y ?? u.y;
  for (const e of world.all()) {
    if (e.type !== 'deer_herd' || (e.amount ?? 0) < 1) continue;
    const d = Math.hypot(e.x - ox, e.y - oy);
    if (d < bestD && d < 20) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function goIdle(u: Entity) {
  u.order = { type: 'idle' };
}

function gatherTick(world: World, u: Entity, o: GatherOrder) {
  const reach = world.rules.gather.workRange + u.radius;
  const carry = world.rules.gather.carry;
  if (o.phase === 'to_resource') {
    if (u.carrying && u.carrying.amount >= carry) {
      o.phase = 'to_dropoff';
      return;
    }
    const res = resourceOf(world, o.target !== undefined ? (world.get(o.target) ?? null) : null, o.tile ?? null);
    if (!res) return retarget(world, u, o);
    const dist = distToSource(world, o, u);
    if (dist <= reach || (!isMoving(u) && (o.tries ?? 0) > 0 && dist <= reach + 0.8)) {
      clearMove(world, u);
      o.phase = 'gathering';
      o.tries = 0;
      return;
    }
    if (!isMoving(u)) {
      if ((o.tries ?? 0) >= 2) {
        // Could not get close: try another tree, or give up on this source.
        o.tries = 0;
        if (o.tile !== undefined) {
          const next = nextForestTile(world, o.tile, o.tile);
          if (next !== null) {
            o.tile = next;
            return;
          }
        }
        return goIdle(u);
      }
      o.tries = (o.tries ?? 0) + 1;
      const p = sourcePoint(world, o, u);
      if (!p) return goIdle(u);
      if (o.tile !== undefined) {
        const [ax, ay] = nearestPassable(world.nav, 'foot', Math.floor(p[0]), Math.floor(p[1]), 3) ?? [Math.floor(p[0]), Math.floor(p[1])];
        moveUnitTo(world, u, ax + 0.5, ay + 0.5);
      } else moveUnitTo(world, u, p[0], p[1]);
    }
    return;
  }
  if (o.phase === 'gathering') {
    const target = o.target !== undefined ? world.get(o.target) : undefined;
    const rate = gatherRate(world, u, o.resource) / world.ticksPerSecond;
    let got = rate;
    if (o.resource === 'wood') {
      const left = world.woodLeft[o.tile!];
      got = Math.min(rate, left);
      world.woodLeft[o.tile!] = left - got;
      if (world.woodLeft[o.tile!] <= 1e-6) {
        world.woodLeft[o.tile!] = 0;
        world.setTerrain(o.tile!, T.plain);
      }
    } else if (o.resource === 'deerskin') {
      if (!target) return retarget(world, u, o);
      got = Math.min(rate, target.amount ?? 0);
      target.amount = (target.amount ?? 0) - got;
    } else if (!target) return retarget(world, u, o);
    if (!u.carrying || u.carrying.resource !== o.resource) u.carrying = { resource: o.resource, amount: 0 };
    u.carrying.amount = Math.min(carry, u.carrying.amount + got);
    if (u.carrying.amount >= carry - 1e-9) o.phase = 'to_dropoff';
    else if (!resourceOf(world, target ?? null, o.tile ?? null)) {
      if (u.carrying.amount > 0) o.phase = 'to_dropoff';
      else retarget(world, u, o);
    }
    return;
  }
  // to_dropoff
  const drop = (o.dropoff !== undefined && world.get(o.dropoff)) || nearestDropoff(world, u);
  if (!drop) {
    clearMove(world, u);
    return;
  }
  o.dropoff = drop.id;
  if (distToEntity(u.x, u.y, drop) <= reach + 0.2) {
    clearMove(world, u);
    const f = world.faction(u.owner);
    if (f && u.carrying) f.resources[u.carrying.resource] += u.carrying.amount * incomeMul(world, u.owner);
    u.carrying = undefined;
    o.dropoff = undefined;
    o.phase = 'to_resource';
    if (!resourceOf(world, o.target !== undefined ? (world.get(o.target) ?? null) : null, o.tile ?? null)) retarget(world, u, o);
    return;
  }
  if (!isMoving(u)) {
    const [px, py] = closestPointOnRect(u.x, u.y, drop.tx!, drop.ty!, drop.w!, drop.h!);
    moveUnitTo(world, u, px, py);
  }
}

/** Source exhausted: find the next one of the same kind nearby, else go idle (carrying stays). */
function retarget(world: World, u: Entity, o: GatherOrder) {
  if (o.resource === 'wood' && o.tile !== undefined) {
    const next = nextForestTile(world, o.tile);
    if (next !== null) {
      o.tile = next;
      o.phase = u.carrying && u.carrying.amount > 0 ? 'to_dropoff' : 'to_resource';
      return;
    }
  }
  if (o.resource === 'deerskin') {
    const h = nextHerd(world, u, o.target !== undefined ? world.get(o.target) : undefined);
    if (h) {
      o.target = h.id;
      o.phase = u.carrying && u.carrying.amount > 0 ? 'to_dropoff' : 'to_resource';
      return;
    }
  }
  if (u.carrying && u.carrying.amount > 0 && o.phase !== 'to_dropoff') {
    o.phase = 'to_dropoff';
    return;
  }
  goIdle(u);
}

/** Daily settlement at tick 0 of each game day (spec §4.3). */
function dailyUpkeep(world: World) {
  const r = world.rules.upkeep;
  for (const f of world.factions.values()) {
    let need = 0;
    for (const e of world.all())
      if (e.kind === 'unit' && e.owner === f.id) need += isGatherer(world, e) ? r.workerPerDay : r.combatPerDay;
    need *= (r.factionMul as Record<string, number>)[f.id] ?? 1;
    if (f.resources.grain >= need) {
      f.resources.grain -= need;
      continue;
    }
    const shortfall = need - f.resources.grain;
    f.resources.grain = 0;
    const steps = Math.ceil(shortfall / r.starvation.grainPerStep - 1e-9);
    const delta = steps * r.starvation.moralePerStep;
    for (const e of world.all()) if (e.kind === 'unit' && e.owner === f.id) e.morale = Math.max(0, (e.morale ?? 0) + delta);
    f.starvingUntil = world.tick + world.ticksPerSecond * 10;
    world.emit({ type: 'starvation', owner: f.id, shortfall, moraleDelta: delta });
  }
  world.emit({ type: 'day', day: world.day });
}

/** Per-day income/regrowth hooks other systems add (sugar mill, village tributes…). */
export const dailyHooks: ((world: World) => void)[] = [];

export function economySystem(world: World) {
  const hz = world.ticksPerSecond;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.insideOf) continue;
    if (u.order?.type === 'gather') gatherTick(world, u, u.order);
  }

  // Powder mills: 2 wood → 1 powder every 5 s (spec §4.1).
  for (const b of world.all()) {
    if (b.kind !== 'building' || (b.built ?? 1) < 1) continue;
    const conv = (world.data.buildings.get(b.type) as { converter?: { from: Record<string, number>; to: Record<string, number>; seconds: number } }).converter;
    if (!conv) continue;
    const f = world.faction(b.owner);
    if (!f) continue;
    b.cooldown = (b.cooldown ?? 0) + 1;
    if (b.cooldown < conv.seconds * hz) continue;
    b.cooldown = 0;
    const res = f.resources as Record<string, number>;
    if (Object.entries(conv.from).every(([k, v]) => res[k] >= v)) {
      for (const [k, v] of Object.entries(conv.from)) res[k] -= v;
      for (const [k, v] of Object.entries(conv.to)) res[k] += v;
    }
  }

  // Tuntian farmers produce grain continuously (spec §3.1: 2 grain per soldier per day).
  const perTick = world.rules.tuntian.grainPerDay / world.rules.sim.ticksPerDay;
  for (const b of world.all()) {
    if (b.type !== 'tuntian' || !b.garrisoned?.length || (b.built ?? 1) < 1) continue;
    const f = world.faction(b.owner);
    if (f) f.resources.grain += perTick * b.garrisoned.length;
  }

  if (world.tick > 0 && world.tick % world.rules.sim.ticksPerDay === 0) {
    dailyUpkeep(world);
    const herd = world.rules.gather.deerHerd;
    for (const e of world.all())
      if (e.type === 'deer_herd') e.amount = Math.min(e.maxAmount ?? herd.amount, (e.amount ?? 0) + herd.regenPerDay);
    for (const h of dailyHooks) h(world);
  }
}
