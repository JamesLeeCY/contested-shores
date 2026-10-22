// 瘴癘 (spec §4.7): each game day, every unit outside a sheltering building may fall ill and be removed.
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { killEntity } from './combat';
import { dailyHooks } from './economy';

/** Today's illness chance for a faction's exposed units. */
export function diseaseChance(world: World, owner: Owner): number {
  const d = world.rules.disease;
  let p = owner === 'faction_zheng' ? d.chanceZheng : owner === 'faction_voc' ? d.chanceVoc : 0;
  if (world.chapter >= d.lateChapterFrom) p *= d.lateChapterMul;
  p *= (d.playerMul as Record<string, number>)[owner] ?? 1;
  return p;
}

function sheltered(world: World, u: Entity): boolean {
  if (!u.insideOf) return false;
  const host = world.get(u.insideOf);
  return !!host && host.kind === 'building' && world.data.buildings.get(host.type)!.diseaseShelter;
}

export function diseaseTick(world: World) {
  const counts = new Map<Owner, number>();
  for (const u of world.all()) {
    if (u.kind !== 'unit' || !world.isPlayable(u.owner)) continue;
    const def = world.data.units.get(u.type)!;
    if (def.naval) continue; // ships are not soldiers; their passengers are checked individually
    if (world.rules.disease.heroesImmune && def.traits.includes('hero')) continue;
    if (sheltered(world, u)) continue;
    if (world.rng.chance(diseaseChance(world, u.owner))) {
      counts.set(u.owner, (counts.get(u.owner) ?? 0) + 1);
      world.emit({ type: 'illness', id: u.id, x: u.x, y: u.y });
      killEntity(world, u);
    }
  }
  for (const owner of [...world.factions.keys()].sort()) world.emit({ type: 'disease', owner, n: counts.get(owner) ?? 0 });
}

dailyHooks.push(diseaseTick);
