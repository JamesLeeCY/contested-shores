// 1895 scenarios: supply lines and night.
//  - Supply line: soldiers of the scenario's supplied side lose morale every second they are farther
//    than `radius` from a supply source (a depot building or a supply cart of their own).
//  - Night: sight is cut to `sightMul` until `untilSeconds` (dawn).
import type { Entity } from '../types';
import type { World } from '../world';
import { changeMorale } from './morale';

/** Is this soldier within reach of one of its side's supply sources? */
export function isSupplied(world: World, u: Entity): boolean {
  const s = world.scenario?.supply;
  if (!s || u.owner !== s.owner) return true;
  for (const e of world.all())
    if (e.owner === s.owner && s.sources.includes(e.type) && Math.hypot(e.x - u.x, e.y - u.y) <= s.radius) return true;
  return false;
}

export function frontlineSystem(world: World) {
  const sc = world.scenario;
  if (!sc) return;
  const hz = world.ticksPerSecond;
  // Night falls at the start and lifts at dawn (a typhoon, if any, keeps its own sight penalty).
  if (sc.night && !world.weather.active) {
    const night = world.tick < sc.night.untilSeconds * hz;
    const mul = night ? sc.night.sightMul : 1;
    if (world.weather.sightMul !== mul) {
      world.weather.sightMul = mul;
      if (!night) world.emit({ type: 'dawn' });
    }
  }
  const s = sc.supply;
  if (!s || world.tick % hz !== 0) return;
  const sources = [...world.all()].filter((e) => e.owner === s.owner && s.sources.includes(e.type));
  let cut = 0;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.owner !== s.owner || u.moveClass !== 'foot' || u.insideOf) continue;
    const def = world.data.units.get(u.type)!;
    if (s.sources.includes(u.type) || def.traits.includes('hero')) continue;
    if (sources.some((e) => Math.hypot(e.x - u.x, e.y - u.y) <= s.radius)) continue;
    changeMorale(world, u, -s.drainPerSecond);
    cut++;
  }
  world.ext.flags.unsupplied = cut;
}
