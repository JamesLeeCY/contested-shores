// 火槍兵: 3+ musketeers of the same type within 2 tiles shooting the same target → +15% hit.
import type { TraitHandler } from './types';

export const volley: TraitHandler = {
  hitBonus(ctx) {
    const r = ctx.world.rules.combat.traits.volley;
    const { attacker: a, target } = ctx;
    let n = 0;
    for (const e of ctx.world.unitsNear(a.x, a.y, r.radius))
      if (e.type === a.type && e.owner === a.owner && e.attackTarget === target.id) n++;
    return n >= r.minUnits ? r.hitBonus : 0;
  },
};
