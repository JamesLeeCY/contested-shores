// 1895 scenarios: supply lines and night.
//  - Supply line: soldiers of the scenario's supplied side lose morale every second they are farther
//    than `radius` from a supply source (a depot building or a supply cart of their own): the further
//    out the faster, down to a floor above the rout line.
//  - Night: sight is cut to `sightMul` until `untilSeconds` (dawn).
//  - Rain (1885): spells when firearms miss more and sight is cut.
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
  // Rain (1885): muskets and rifles miss more, sight shrinks; the typhoon, if any, keeps its own.
  if (sc.rain && !world.weather.active) {
    const t = world.tick / hz;
    const spell = sc.rain.find((r) => t >= r.fromSeconds && t < r.untilSeconds);
    const pen = spell?.hitPenalty ?? 0;
    if (world.weather.rangedHitPenalty !== pen) {
      world.weather.rangedHitPenalty = pen;
      world.emit({ type: spell ? 'rain_start' : 'rain_end' });
    }
    if (!sc.night || t >= sc.night.untilSeconds) world.weather.sightMul = spell?.sightMul ?? 1;
  }
  const s = sc.supply;
  if (!s || world.tick % hz !== 0) return;
  const sources = [...world.all()].filter((e) => e.owner === s.owner && s.sources.includes(e.type));
  let cut = 0;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.owner !== s.owner || u.moveClass !== 'foot' || u.insideOf) continue;
    const def = world.data.units.get(u.type)!;
    if (s.sources.includes(u.type) || def.traits.includes('hero')) continue;
    let near = Infinity;
    for (const e of sources) near = Math.min(near, Math.hypot(e.x - u.x, e.y - u.y));
    if (near <= s.radius) continue;
    cut++;
    const floor = s.floor ?? 12;
    if ((u.morale ?? 0) <= floor) continue;
    const share = Math.min(1, 0.3 + (0.7 * (near - s.radius)) / (s.ramp ?? 6));
    changeMorale(world, u, -Math.min(s.drainPerSecond * share, (u.morale ?? 0) - floor));
  }
  world.ext.flags.unsupplied = cut;
}
