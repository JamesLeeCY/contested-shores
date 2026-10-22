// Building placement and construction (spec §4.12, §5.3, §6.2).
import type { BuildingDef } from '../../data/schema';
import { ownedUnits, registerCommand } from '../commands';
import { closestPointOnRect, distToEntity } from '../geometry';
import { TERRAIN_IDS } from '../map';
import { nearestPassable } from '../path/astar';
import { canAfford, pay } from '../stats';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { clearMove, isMoving, moveUnitTo } from './movement';

export type PlacementError =
  | 'unknown'
  | 'faction'
  | 'stage'
  | 'cost'
  | 'bounds'
  | 'terrain'
  | 'occupied'
  | 'water'
  | 'units';

/** Stage at which a faction may build `id` (default 1). */
export function buildingStage(world: World, owner: Owner, id: string): number {
  const table = world.rules.stages.buildings as Record<string, Record<string, number>>;
  return table[owner]?.[id] ?? 1;
}

/** Buildings a faction's workers can construct right now (ignoring cost). */
export function buildableList(world: World, owner: Owner): BuildingDef[] {
  const f = world.faction(owner);
  if (!f) return [];
  return [...world.data.buildings.values()].filter(
    (b) => !b.preset && (b.faction === owner || b.faction === 'any') && buildingStage(world, owner, b.id) <= f.stage,
  );
}

export function checkPlacement(world: World, owner: Owner, id: string, tx: number, ty: number, ignoreCost = false): PlacementError | null {
  const def = world.data.buildings.get(id);
  const f = world.faction(owner);
  if (!def || !f || def.preset) return 'unknown';
  if (def.faction !== owner && def.faction !== 'any') return 'faction';
  if (buildingStage(world, owner, id) > f.stage) return 'stage';
  if (!ignoreCost && !canAfford(f, def.cost)) return 'cost';
  const { width, height } = world.map;
  const s = def.size;
  if (tx < 0 || ty < 0 || tx + s > width || ty + s > height) return 'bounds';
  const types = world.rules.terrain.types as Record<string, { buildable: boolean; onlyBuild?: string[] }>;
  for (let y = ty; y < ty + s; y++)
    for (let x = tx; x < tx + s; x++) {
      const i = y * width + x;
      const tr = types[TERRAIN_IDS[world.map.terrain[i]]];
      if (tr.onlyBuild ? !tr.onlyBuild.includes(id) : !tr.buildable) return 'terrain';
      if (world.occupancy[i] || world.nav.blocked[i]) return 'occupied';
    }
  if ((def as { needsWater?: boolean }).needsWater) {
    let water = false;
    for (let y = ty - 1; y <= ty + s && !water; y++)
      for (let x = tx - 1; x <= tx + s && !water; x++)
        if ((x < tx || y < ty || x >= tx + s || y >= ty + s) && world.nav.passable('small_craft', x, y, true)) water = true;
    if (!water) return 'water';
  }
  return null;
}

/** Pushes units out of a newly blocking footprint to the nearest free tile. */
function evictUnits(world: World, b: Entity) {
  if (!b.blocks) return;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.insideOf || u.moveClass !== 'foot') continue;
    if (u.x < b.tx! || u.y < b.ty! || u.x >= b.tx! + b.w! || u.y >= b.ty! + b.h!) continue;
    const p = nearestPassable(world.nav, 'foot', Math.floor(u.x), Math.floor(u.y), 8);
    if (p) {
      u.x = u.px = p[0] + 0.5;
      u.y = u.py = p[1] + 0.5;
    }
  }
}

export function placeBuilding(world: World, owner: Owner, id: string, tx: number, ty: number, builders: Entity[]): Entity | null {
  if (checkPlacement(world, owner, id, tx, ty)) return null;
  const def = world.data.buildings.get(id)!;
  pay(world.faction(owner)!, def.cost);
  const b = world.spawnBuilding(id, owner, tx, ty, 0);
  b.hp = Math.max(1, Math.round(b.maxHp * world.rules.build.startHpFraction));
  evictUnits(world, b);
  for (const u of builders) assignBuilder(world, u, b);
  world.emit({ type: 'placed', id: b.id, building: id, owner });
  return b;
}

export function assignBuilder(world: World, u: Entity, b: Entity) {
  if (!world.data.units.get(u.type)!.traits.includes('builder')) return;
  clearMove(world, u);
  u.order = { type: 'build', target: b.id };
}

registerCommand('place', (world, cmd) => {
  const builders = ownedUnits(world, cmd.owner, cmd.builders);
  placeBuilding(world, cmd.owner, cmd.building, cmd.tx, cmd.ty, builders);
});

registerCommand('build', (world, cmd) => {
  const b = world.get(cmd.target);
  if (!b || b.kind !== 'building' || b.owner !== cmd.owner) return;
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) assignBuilder(world, u, b);
});

export function buildSystem(world: World) {
  const hz = world.ticksPerSecond;
  // Count active builders per site first so progress is independent of iteration order.
  const working = new Map<number, number>();
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.order?.type !== 'build') continue;
    const b = world.get(u.order.target);
    if (!b || (b.built ?? 1) >= 1) {
      u.order = { type: 'idle' };
      continue;
    }
    if (distToEntity(u.x, u.y, b) <= world.rules.gather.workRange + u.radius + 0.2) {
      if (isMoving(u)) clearMove(world, u);
      working.set(b.id, (working.get(b.id) ?? 0) + 1);
    } else if (!isMoving(u)) {
      const [px, py] = closestPointOnRect(u.x, u.y, b.tx!, b.ty!, b.w!, b.h!);
      moveUnitTo(world, u, px, py);
    }
  }
  for (const [id, n] of [...working.entries()].sort((a, b) => a[0] - b[0])) {
    const b = world.get(id)!;
    const def = world.data.buildings.get(b.type)!;
    const eff = 1 + (n - 1) * world.rules.build.extraBuilderEfficiency;
    const dp = (eff * world.rules.build.builderSpeedMul) / (Math.max(1, def.buildTime) * hz);
    const before = b.built ?? 0;
    b.built = Math.min(1, before + dp);
    b.hp = Math.min(b.maxHp, b.hp + b.maxHp * (1 - world.rules.build.startHpFraction) * (b.built - before));
    if (b.built >= 1) {
      b.hp = Math.min(b.maxHp, Math.round(b.hp));
      world.emit({ type: 'built', id: b.id, building: b.type, owner: b.owner });
    }
  }
}
