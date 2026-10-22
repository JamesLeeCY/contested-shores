// Unit production queues, research and tech effects, rally points, garrisons (spec §4.3, §5.4).
import type { TechDef } from '../../data/schema';
import { ownedUnits, registerCommand } from '../commands';
import { distToEntity } from '../geometry';
import type { MoveClass } from '../path/navgrid';
import { canAfford, pay, popCap, popUsed, refund } from '../stats';
import type { Entity, FactionState, Owner } from '../types';
import type { World } from '../world';
import { clearMove, isMoving, moveUnitTo } from './movement';

// --- tech effects ------------------------------------------------------------------------------

type Effect = TechDef['effects'][number];
/** Handlers for effect types implemented by later systems (e.g. diplomacy's favor_all). */
export const effectHandlers: Partial<Record<Effect['type'], (world: World, owner: Owner, effect: Effect) => void>> = {};

function rulePath(world: World, path: string): [Record<string, number>, string] {
  const parts = path.split('.');
  let obj = world.rules as unknown as Record<string, unknown>;
  for (const p of parts.slice(0, -1)) {
    if (typeof obj[p] !== 'object' || obj[p] === null) throw new Error(`bad rule path ${path}`);
    obj = obj[p] as Record<string, unknown>;
  }
  return [obj as Record<string, number>, parts[parts.length - 1]];
}

export function applyTech(world: World, owner: Owner, techId: string) {
  const tech = world.data.techs.get(techId)!;
  const f = world.faction(owner)!;
  if (f.techs.includes(techId)) return;
  f.techs.push(techId);
  for (const e of tech.effects) applyEffect(world, f, e);
  world.emit({ type: 'researched', owner, tech: techId });
}

function unitMod(f: FactionState, unit: string, stat: string) {
  f.unitMods[unit] ??= {};
  return (f.unitMods[unit][stat] ??= { add: 0 });
}

function applyEffect(world: World, f: FactionState, e: Effect) {
  switch (e.type) {
    case 'set_rule': {
      const [o, k] = rulePath(world, e.path);
      o[k] = e.value;
      break;
    }
    case 'mul_rule': {
      const [o, k] = rulePath(world, e.path);
      o[k] *= e.value;
      break;
    }
    case 'add_rule': {
      const [o, k] = rulePath(world, e.path);
      o[k] += e.value;
      break;
    }
    case 'add_unit_stat':
      for (const u of e.units) unitMod(f, u, e.stat).add += e.value;
      break;
    case 'set_unit_stat':
      for (const u of e.units) unitMod(f, u, e.stat).set = e.value;
      break;
    case 'add_building_attack':
      for (const b of e.buildings) {
        const m = (f.buildingMods[b] ??= { range: 0, atk: 0, traits: [] });
        m.range += e.range;
        m.atk += e.atk;
      }
      break;
    case 'add_building_trait':
      for (const b of e.buildings) (f.buildingMods[b] ??= { range: 0, atk: 0, traits: [] }).traits.push(e.trait);
      break;
    case 'reveal_terrain':
      for (const t of e.terrain) if (!f.revealTerrain.includes(t)) f.revealTerrain.push(t);
      break;
    default: {
      const h = effectHandlers[e.type];
      if (h) h(world, f.id, e);
    }
  }
}

// --- queue commands ----------------------------------------------------------------------------

function ownBuilding(world: World, owner: Owner, id: number): Entity | null {
  const b = world.get(id);
  return b && b.kind === 'building' && b.owner === owner && (b.built ?? 1) >= 1 ? b : null;
}

export type ProduceError = 'building' | 'not_here' | 'stage' | 'queue_full' | 'cost' | 'done';

export function canProduce(world: World, owner: Owner, buildingId: number, unit: string): ProduceError | null {
  const b = ownBuilding(world, owner, buildingId);
  const f = world.faction(owner);
  if (!b || !f) return 'building';
  if (!world.data.buildings.get(b.type)!.produces.includes(unit)) return 'not_here';
  const def = world.data.units.get(unit)!;
  if (!def.producible) return 'not_here';
  if (def.stage > f.stage) return 'stage';
  if ((b.queue?.length ?? 0) >= world.rules.production.maxQueue) return 'queue_full';
  if (!canAfford(f, def.cost)) return 'cost';
  return null;
}

export function canResearch(world: World, owner: Owner, buildingId: number, tech: string): ProduceError | null {
  const b = ownBuilding(world, owner, buildingId);
  const f = world.faction(owner);
  if (!b || !f) return 'building';
  if (!world.data.buildings.get(b.type)!.researches.includes(tech)) return 'not_here';
  const def = world.data.techs.get(tech)!;
  if (f.techs.includes(tech)) return 'done';
  for (const e of world.all()) if (e.owner === owner && e.queue?.some((q) => q.kind === 'tech' && q.id === tech)) return 'done';
  if (def.stage > f.stage) return 'stage';
  if ((b.queue?.length ?? 0) >= world.rules.production.maxQueue) return 'queue_full';
  if (!canAfford(f, def.cost)) return 'cost';
  return null;
}

registerCommand('produce', (world, cmd) => {
  if (canProduce(world, cmd.owner, cmd.building, cmd.unit)) return;
  const def = world.data.units.get(cmd.unit)!;
  const f = world.faction(cmd.owner)!;
  pay(f, def.cost);
  const total = Math.round(def.buildTime * world.ticksPerSecond);
  world.get(cmd.building)!.queue!.push({ kind: 'unit', id: cmd.unit, remaining: total, total, started: false, cost: { ...def.cost } });
});

registerCommand('research', (world, cmd) => {
  if (canResearch(world, cmd.owner, cmd.building, cmd.tech)) return;
  const def = world.data.techs.get(cmd.tech)!;
  pay(world.faction(cmd.owner)!, def.cost);
  const total = Math.round(def.time * world.ticksPerSecond);
  world.get(cmd.building)!.queue!.push({ kind: 'tech', id: cmd.tech, remaining: total, total, started: false, cost: { ...def.cost } });
});

registerCommand('cancel', (world, cmd) => {
  const b = ownBuilding(world, cmd.owner, cmd.building);
  if (!b?.queue || cmd.index < 0 || cmd.index >= b.queue.length) return;
  const [item] = b.queue.splice(cmd.index, 1);
  refund(world.faction(cmd.owner)!, item.cost);
});

registerCommand('rally', (world, cmd) => {
  const b = ownBuilding(world, cmd.owner, cmd.building);
  if (b) b.rally = { x: cmd.x, y: cmd.y };
});

// --- garrison / tuntian ------------------------------------------------------------------------

export function garrisonCapacity(world: World, b: Entity): number {
  const def = world.data.buildings.get(b.type) as { garrison: number; tuntianCapacity?: number };
  return def.tuntianCapacity ?? def.garrison;
}

/** Which units a building accepts: tuntian takes Zheng soldiers; bastions take musketeers; camps take anyone. */
export function canGarrison(world: World, u: Entity, b: Entity): boolean {
  if (u.kind !== 'unit' || u.owner !== b.owner || (b.built ?? 1) < 1 || u.moveClass !== 'foot') return false;
  // A breached fort cannot shelter anyone (see siege capture rules).
  if ((world.data.buildings.get(b.type) as { capturable?: boolean }).capturable && b.hp <= b.maxHp * world.rules.capture.ejectBelowHpFraction)
    return false;
  const def = world.data.units.get(u.type)!;
  if (def.traits.includes('hero')) return false;
  if (b.type === 'tuntian') return def.class === 'infantry' && def.faction === 'faction_zheng';
  if (b.type === 'bastion') return def.atkType === 'musket';
  return garrisonCapacity(world, b) > 0;
}

registerCommand('garrison', (world, cmd) => {
  const b = world.get(cmd.target);
  if (!b || b.kind !== 'building') return;
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (!canGarrison(world, u, b)) continue;
    clearMove(world, u);
    u.order = { type: b.type === 'tuntian' ? 'tuntian' : 'garrison', target: b.id };
  }
});

registerCommand('ungarrison', (world, cmd) => {
  const b = world.get(cmd.building);
  if (!b || b.owner !== cmd.owner || !b.garrisoned?.length) return;
  const delay = b.type === 'tuntian' ? world.rules.tuntian.recallSeconds * world.ticksPerSecond : 0;
  const ids = cmd.ids?.length ? b.garrisoned.filter((id) => cmd.ids!.includes(id)) : [...b.garrisoned];
  for (const id of ids) {
    const u = world.entities.get(id);
    if (u) u.releaseAt = world.tick + delay;
  }
});

/** Places a unit on a free tile next to a building footprint, nearest to `toward`. */
export function spawnNear(world: World, b: Entity, cls: MoveClass, toward?: { x: number; y: number }): [number, number] | null {
  const R = world.rules.production.spawnSearchRadius;
  const tx = toward?.x ?? b.x + b.w! / 2 + 1;
  const ty = toward?.y ?? b.y + b.h! / 2 + 1;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let y = b.ty! - R; y < b.ty! + b.h! + R; y++)
    for (let x = b.tx! - R; x < b.tx! + b.w! + R; x++) {
      if (!world.nav.passable(cls, x, y)) continue;
      const ring = Math.max(b.tx! - x, x - (b.tx! + b.w! - 1), b.ty! - y, y - (b.ty! + b.h! - 1));
      const d = ring * 100 + Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
      if (d < bestD) {
        bestD = d;
        best = [x + 0.5, y + 0.5];
      }
    }
  return best;
}

function releaseUnit(world: World, b: Entity, u: Entity) {
  const p = spawnNear(world, b, 'foot', b.rally ?? undefined);
  b.garrisoned = b.garrisoned!.filter((id) => id !== u.id);
  u.insideOf = null;
  u.releaseAt = undefined;
  u.order = { type: 'idle' };
  if (p) {
    u.x = u.px = p[0];
    u.y = u.py = p[1];
  } else {
    u.x = u.px = b.x;
    u.y = u.py = b.y + b.h! / 2 + 0.5;
  }
}

/** Ejects everyone (building destroyed or captured). */
export function ejectAll(world: World, b: Entity) {
  for (const id of [...(b.garrisoned ?? [])]) {
    const u = world.entities.get(id);
    if (u) releaseUnit(world, b, u);
  }
}

export function productionSystem(world: World) {
  // Garrison approach / entry and timed release.
  for (const u of world.all()) {
    if (u.kind !== 'unit') continue;
    if (u.insideOf) {
      if (u.releaseAt !== undefined && world.tick >= u.releaseAt) {
        const b = world.get(u.insideOf);
        if (b) releaseUnit(world, b, u);
      }
      continue;
    }
    const o = u.order;
    if (o?.type !== 'garrison' && o?.type !== 'tuntian') continue;
    const b = world.get(o.target);
    if (!b || !canGarrison(world, u, b) || (b.garrisoned?.length ?? 0) >= garrisonCapacity(world, b)) {
      u.order = { type: 'idle' };
      clearMove(world, u);
      continue;
    }
    if (distToEntity(u.x, u.y, b) <= u.radius + 0.9) {
      clearMove(world, u);
      u.insideOf = b.id;
      b.garrisoned!.push(u.id);
      world.emit({ type: 'garrisoned', id: u.id, building: b.id });
    } else if (!isMoving(u)) moveUnitTo(world, u, b.x, b.y);
  }

  for (const b of world.all()) {
    if (b.kind !== 'building' || !b.queue?.length || (b.built ?? 1) < 1) continue;
    const item = b.queue[0];
    if (!item.started) {
      if (item.kind === 'unit') {
        const pop = world.data.units.get(item.id)!.pop;
        if (popUsed(world, b.owner) + pop > popCap(world, b.owner)) {
          if (!b.popBlocked) world.emit({ type: 'pop_blocked', owner: b.owner, building: b.id });
          b.popBlocked = true;
          continue;
        }
      }
      b.popBlocked = false;
      item.started = true;
    }
    item.remaining--;
    if (item.remaining > 0) continue;
    b.queue.shift();
    if (item.kind === 'tech') {
      applyTech(world, b.owner, item.id);
      continue;
    }
    const cls = world.moveClassOf(item.id);
    const p = spawnNear(world, b, cls, b.rally ?? undefined);
    if (!p) {
      // No room (e.g. shipyard with no water at low tide): retry next tick.
      item.remaining = 1;
      b.queue.unshift(item);
      continue;
    }
    const u = world.spawnUnit(item.id, b.owner, p[0], p[1]);
    world.emit({ type: 'produced', id: u.id, unit: item.id, owner: b.owner, building: b.id });
    if (b.rally) {
      u.order = { type: 'move', x: b.rally.x, y: b.rally.y };
      moveUnitTo(world, u, b.rally.x, b.rally.y);
    }
  }
}

export function isPopBlocked(b: Entity) {
  return !!b.popBlocked;
}

export function factionCanAffordUnit(world: World, f: FactionState, unit: string) {
  return canAfford(f, world.data.units.get(unit)!.cost);
}
