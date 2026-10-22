// 大船: fires at up to 2 targets in range per volley.
import type { TraitHandler } from './types';

export const broadside: TraitHandler = {
  extraTargets(ctx, candidates) {
    const n = ctx.world.rules.combat.traits.broadside.maxTargets - 1;
    return candidates.filter((c) => c.id !== ctx.target.id).slice(0, n);
  },
};
