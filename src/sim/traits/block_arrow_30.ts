// 藤牌兵: arrows have a 30% chance to be blocked entirely (spec §5.2).
import type { TraitHandler } from './types';

export const block_arrow_30: TraitHandler = {
  incomingMul(ctx) {
    if (ctx.atkType !== 'arrow') return 1;
    return ctx.world.rng.chance(ctx.world.rules.combat.traits.block_arrow_30.chance) ? 0 : 1;
  },
};
