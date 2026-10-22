// 長槍兵: +25% damage against 鐵人軍 and 藤牌兵.
import type { TraitHandler } from './types';

export const anti_charge: TraitHandler = {
  damageBonus(ctx) {
    const r = ctx.world.rules.combat.traits.anti_charge;
    return r.targets.includes(ctx.target.type) ? r.bonus : 0;
  },
};
