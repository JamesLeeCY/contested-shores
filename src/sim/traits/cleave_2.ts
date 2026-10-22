// 鐵人軍: melee hits also deal 50% to up to 2 enemies adjacent to the target.
import { applyDamage, isEnemy } from '../systems/combat';
import type { TraitHandler } from './types';

export const cleave_2: TraitHandler = {
  afterHit(ctx, damage) {
    if (ctx.atkType !== 'melee' || damage <= 0) return;
    const r = ctx.world.rules.combat.traits.cleave_2;
    const near = ctx.world
      .unitsNear(ctx.target.x, ctx.target.y, r.radius + ctx.target.radius)
      .filter((e) => e.id !== ctx.target.id && isEnemy(ctx.world, ctx.attacker.owner, e.owner) && !e.insideOf);
    for (const e of near.slice(0, r.maxTargets)) applyDamage(ctx.world, e, damage * r.ratio, ctx.attacker);
  },
};
