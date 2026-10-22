// Cannons must spend 4 s setting up after moving before they can fire.
import type { TraitHandler } from './types';

export const must_deploy: TraitHandler = {
  canFire(world, e) {
    return (e.deployTicks ?? 0) >= world.rules.combat.traits.must_deploy.seconds * world.ticksPerSecond;
  },
};
