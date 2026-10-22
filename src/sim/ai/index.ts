// AI entry point: strategic every 3–8 s (difficulty), tactical every second; the unit layer is the
// combat system's auto-targeting (spec §8).
import type { AiSpec } from '../scenario/types';
import type { AiState, Difficulty } from '../state';
import type { Owner } from '../types';
import type { World } from '../world';
import type { AiCtx } from './common';
import { strategic } from './strategic';
import { tactical } from './tactical';

export function enableAi(world: World, owner: Owner, spec: AiSpec, difficulty: Difficulty = 'normal') {
  const ai: AiState = {
    owner,
    difficulty,
    plans: [...spec.plans],
    composition: { ...spec.composition },
    targetArmy: spec.targetArmy,
    home: [...spec.home],
    target: spec.target,
    defensive: spec.defensive,
    siege: spec.siege,
    state: 'ECONOMY',
    prevState: 'ECONOMY',
    planIdx: 0,
    stepIdx: 0,
    stepStart: world.tick,
    step: {},
    background: [],
    mem: {},
    // Stagger the two AIs so they never decide on the same tick.
    lastStrategic: world.tick - (owner === 'faction_voc' ? 50 : 0),
    lastTactical: world.tick,
    armyAtAttack: 0,
    calmSince: world.tick,
  };
  world.ext.ai[owner] = ai;
  return ai;
}

/** Wall-clock cost of AI decisions, measured outside the simulation by the headless runner. */
export const aiTiming = { enabled: false, samples: [] as number[], now: () => 0 };

export function aiSystem(world: World) {
  for (const owner of Object.keys(world.ext.ai).sort()) {
    const ai = world.ext.ai[owner];
    const ctx: AiCtx = { world, ai, owner };
    const hz = world.ticksPerSecond;
    const interval = world.rules.difficulty[ai.difficulty].strategicSeconds * hz;
    const t0 = aiTiming.enabled ? aiTiming.now() : 0;
    if (world.tick - ai.lastStrategic >= interval) {
      ai.lastStrategic = world.tick;
      strategic(ctx);
    }
    if (world.tick - ai.lastTactical >= world.rules.ai.tacticalSeconds * hz) {
      ai.lastTactical = world.tick;
      tactical(ctx);
    }
    if (aiTiming.enabled) {
      const dt = aiTiming.now() - t0;
      if (dt > 0) aiTiming.samples.push(dt);
    }
  }
}
