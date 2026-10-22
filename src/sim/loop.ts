// Fixed 20 Hz simulation step and a wall-clock accumulator for the client (spec §10.3).
import { executeCommand } from './commands';
import { SYSTEMS } from './systems';
import type { World } from './world';

export function systemNames() {
  return SYSTEMS.map((s) => s.name);
}

/** Advances the world by exactly one tick. */
export function step(world: World) {
  world.events = [];
  const cmds = world.pending;
  world.pending = [];
  for (const c of cmds) executeCommand(world, c);
  for (const s of SYSTEMS) s.fn(world);
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
