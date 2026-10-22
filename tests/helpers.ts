import { loadGameData } from '../src/data/load';
import { loadMap } from '../src/data/map';
import { step } from '../src/sim/loop';
import { World, type WorldOptions } from '../src/sim/world';

export const DATA = loadGameData();
export const MAP = loadMap();

export function makeWorld(opts: Partial<WorldOptions> = {}) {
  return new World(DATA, MAP, { seed: 1, ...opts });
}

export function run(world: World, ticks: number) {
  for (let i = 0; i < ticks; i++) step(world);
}

/** Forces the tide state (and nav grids) without waiting for the cycle. */
export function setTide(world: World, phase: 'rising' | 'high' | 'falling' | 'low') {
  world.tidePhase = world.rules.tide.phases.findIndex((p) => p.id === phase);
  world.tideTick = 0;
  world.nav.setTide(world.tideHigh);
}
