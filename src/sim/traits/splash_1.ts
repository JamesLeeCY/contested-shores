// 擲彈兵 (and 霰彈 building guns): 50% damage to other enemies within 1 tile of the target.
import { applyDamage, isEnemy } from '../systems/combat';
import type { TraitHandler } from './types';

export const splash_1: TraitHandler = {
  afterHit(ctx, damage) {
    if (damage <= 0) return;
    const r = ctx.world.rules.combat.traits.splash_1;
    for (const e of ctx.world.unitsNear(ctx.target.x, ctx.target.y, r.radius + 0.3))
      if (e.id !== ctx.target.id && isEnemy(ctx.world, ctx.attacker.owner, e.owner) && !e.insideOf)
        applyDamage(ctx.world, e, damage * r.ratio, ctx.attacker);
  },
};
