// Typhoon (spec §4.10): 30 s warning, then 60 s of storm — ships on open water lose 1% max HP per
// second, everyone's sight halves, musket and cannon hit chance drops by 30 points.
import { TERRAIN_IDS } from '../map';
import type { World } from '../world';
import { applyDamage } from './combat';

/** Schedules a typhoon whose storm starts at `startTick` (warning 30 s before). */
export function scheduleTyphoon(world: World, startTick: number) {
  const c = world.rules.typhoon;
  const hz = world.ticksPerSecond;
  world.ext.typhoon = { warnAt: Math.max(world.tick, startTick - c.warnSeconds * hz), startAt: startTick, endAt: startTick + c.durationSeconds * hz };
}

export function typhoonActive(world: World) {
  return world.weather.active;
}

export function weatherSystem(world: World) {
  const t = world.ext.typhoon;
  const c = world.rules.typhoon;
  if (!t) return;
  if (world.tick === t.warnAt) world.emit({ type: 'typhoon_warning', startAt: t.startAt });
  if (world.tick === t.startAt) {
    world.weather = { active: true, sightMul: c.sightMul, rangedHitPenalty: c.rangedHitPenalty };
    world.emit({ type: 'typhoon_start' });
  }
  if (world.tick === t.endAt) {
    world.weather = { active: false, sightMul: 1, rangedHitPenalty: 0 };
    world.ext.typhoon = null;
    world.emit({ type: 'typhoon_end' });
    return;
  }
  if (!world.weather.active || world.tick % world.ticksPerSecond !== 0) return;
  const affected = c.affectedTerrain.map((id) => TERRAIN_IDS.indexOf(id as (typeof TERRAIN_IDS)[number]));
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.moveClass === 'foot' || u.insideOf) continue;
    const terr = world.map.terrain[Math.floor(u.y) * world.map.width + Math.floor(u.x)];
    if (affected.includes(terr)) applyDamage(world, u, u.maxHp * c.shipDamagePctPerSecond);
  }
}
