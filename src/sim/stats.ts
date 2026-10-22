// Effective unit/building stats: data definition + per-faction tech modifiers.
import type { BuildingDef, UnitDef } from '../data/schema';
import type { Entity, FactionState, Resources } from './types';
import type { World } from './world';

type NumericUnitStat = 'hp' | 'atk' | 'atkInterval' | 'armor' | 'range' | 'sight' | 'speed' | 'hitChance';

export function unitDef(world: World, e: Entity): UnitDef {
  return world.data.units.get(e.type)!;
}

export function buildingDef(world: World, e: Entity): BuildingDef {
  return world.data.buildings.get(e.type)!;
}

export function unitStat(world: World, e: Entity, stat: NumericUnitStat): number {
  const def = world.data.units.get(e.type)!;
  let v = def[stat];
  const mod = world.faction(e.owner)?.unitMods[e.type]?.[stat];
  if (mod) {
    if (mod.set !== undefined) v = mod.set;
    v += mod.add;
  }
  return v;
}

export function hasTrait(world: World, e: Entity, trait: string): boolean {
  if (e.kind === 'unit') return world.data.units.get(e.type)!.traits.includes(trait as never);
  if (e.kind === 'building') return !!world.faction(e.owner)?.buildingMods[e.type]?.traits.includes(trait);
  return false;
}

/** Building gun stats including tech bonuses (range/atk) — null if unarmed. */
export function buildingAttack(world: World, e: Entity) {
  const def = world.data.buildings.get(e.type)!;
  if (!def.attack) return null;
  const mod = world.faction(e.owner)?.buildingMods[e.type];
  return { ...def.attack, range: def.attack.range + (mod?.range ?? 0), atk: def.attack.atk + (mod?.atk ?? 0) };
}

export function canAfford(f: FactionState, cost: Resources) {
  return f.resources.grain >= cost.grain && f.resources.wood >= cost.wood && f.resources.powder >= cost.powder && f.resources.deerskin >= cost.deerskin;
}

export function pay(f: FactionState, cost: Resources) {
  f.resources.grain -= cost.grain;
  f.resources.wood -= cost.wood;
  f.resources.powder -= cost.powder;
  f.resources.deerskin -= cost.deerskin;
}

export function refund(f: FactionState, cost: Resources) {
  f.resources.grain += cost.grain;
  f.resources.wood += cost.wood;
  f.resources.powder += cost.powder;
  f.resources.deerskin += cost.deerskin;
}

/** Population cap: faction base + completed own buildings (spec §4.3). */
export function popCap(world: World, owner: string): number {
  const f = world.faction(owner);
  if (!f) return 0;
  let cap = f.basePopCap;
  for (const e of world.all())
    if (e.kind === 'building' && e.owner === owner && (e.built ?? 1) >= 1) cap += world.data.buildings.get(e.type)!.popCap;
  return cap;
}

/** Population in use: living units plus units currently being trained. */
export function popUsed(world: World, owner: string): number {
  let n = 0;
  for (const e of world.all()) {
    if (e.owner !== owner) continue;
    if (e.kind === 'unit') n += world.data.units.get(e.type)!.pop;
    else if (e.kind === 'building' && e.queue?.length) {
      const head = e.queue[0];
      if (head.kind === 'unit' && head.started) n += world.data.units.get(head.id)!.pop;
    }
  }
  return n;
}

export function isGatherer(world: World, e: Entity) {
  return e.kind === 'unit' && world.data.units.get(e.type)!.traits.includes('gatherer');
}
