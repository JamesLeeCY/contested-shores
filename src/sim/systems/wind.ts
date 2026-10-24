// Wind (1683 Penghu scenarios): a global wind that can shift at scripted times. Sailing ships go
// faster running before it and slower beating against it. Directions follow sailors' usage: a
// "north wind" comes from the north. Map +x is east, +y is south.
import type { Entity } from '../types';
import type { World } from '../world';
import { speedModifiers } from './movement';

export interface WindState {
  /** Compass bearing the wind blows from (degrees, 0 = north, 90 = east). */
  from: number;
  /** 0..1: how strongly it helps or hinders a ship (see rules.wind). */
  strength: number;
}

/** Unit vector (map coordinates) the wind blows towards. */
export function windVector(from: number): [number, number] {
  const r = (from * Math.PI) / 180;
  return [-Math.sin(r), Math.cos(r)];
}

/** Speed multiplier for a ship heading `facing` (radians, map space) in the current wind. */
export function windSpeedMul(world: World, facing: number): number {
  const w = world.ext.wind;
  if (!w) return 1;
  const [vx, vy] = windVector(w.from);
  const along = Math.cos(facing) * vx + Math.sin(facing) * vy;
  const { minMul, maxMul } = world.rules.wind;
  return Math.max(minMul, Math.min(maxMul, 1 + w.strength * along));
}

/** Applies the scenario's scripted wind shifts. */
export function windSystem(world: World) {
  const shifts = world.scenario?.wind?.shifts;
  if (!shifts || !world.ext.wind) return;
  const s = world.tick / world.ticksPerSecond;
  for (const [i, sh] of shifts.entries()) {
    const key = `windShift:${i}`;
    if (world.ext.flags[key] || s < sh.atSeconds) continue;
    world.ext.flags[key] = true;
    world.ext.wind = { from: sh.from, strength: sh.strength ?? world.ext.wind.strength };
    world.emit({ type: 'wind_shift', from: sh.from });
  }
}

speedModifiers.push((world: World, e: Entity) => (e.moveClass && e.moveClass !== 'foot' ? windSpeedMul(world, e.facing ?? 0) : 1));
