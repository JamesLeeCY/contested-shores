// Fixed 20 Hz simulation step and a wall-clock accumulator for the client (spec §10.3).
import { executeCommand } from './commands';
import { movementSystem } from './systems/movement';
import { tideSystem } from './systems/tide';
import type { World } from './world';

export type System = (world: World) => void;

/** Ordered systems run every tick after commands. Later stages insert theirs via `addSystem`. */
const systems: { name: string; fn: System; order: number }[] = [
  { name: 'tide', fn: tideSystem, order: 10 },
  { name: 'movement', fn: movementSystem, order: 20 },
];

export function addSystem(name: string, fn: System, order: number) {
  if (systems.some((s) => s.name === name)) return;
  systems.push({ name, fn, order });
  systems.sort((a, b) => a.order - b.order);
}

export function systemNames() {
  return systems.map((s) => s.name);
}

/** Advances the world by exactly one tick. */
export function step(world: World) {
  world.events = [];
  const cmds = world.pending;
  world.pending = [];
  for (const c of cmds) executeCommand(world, c);
  for (const s of systems) s.fn(world);
  world.tick++;
}

/**
 * Converts elapsed real time into whole ticks. Game speed scales how many ticks run per frame,
 * never the step length.
 */
export class FixedStepper {
  private acc = 0;
  speed = 1;
  paused = false;
  /** Avoid spiral of death after a long frame (e.g. tab in background). */
  maxTicksPerFrame = 8;

  constructor(readonly tickMs: number) {}

  /** Returns how many ticks to run for `elapsedMs` of real time. */
  advance(elapsedMs: number): number {
    if (this.paused) return 0;
    this.acc += elapsedMs * this.speed;
    let n = Math.floor(this.acc / this.tickMs);
    this.acc -= n * this.tickMs;
    if (n > this.maxTicksPerFrame) {
      n = this.maxTicksPerFrame;
      this.acc = 0;
    }
    return n;
  }

  /** 0..1 progress between the last and next tick, for render interpolation. */
  get alpha() {
    return this.acc / this.tickMs;
  }
}
