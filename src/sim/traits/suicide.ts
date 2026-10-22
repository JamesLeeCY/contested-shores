// 火船: on contact with an enemy ship it explodes, dealing its attack value as fire damage to
// everything within 1 tile, and is removed.
import { applyDamage, computeDamage, isEnemy, killEntity } from '../systems/combat';
import type { TraitHandler } from './types';

export const suicide: TraitHandler = {
  afterHit(ctx) {
    const { world, attacker } = ctx;
    const r = world.rules.combat.traits.suicide.radius;
    for (const e of world.unitsNear(attacker.x, attacker.y, r + attacker.radius + 1.5)) {
      if (e.id === attacker.id || !isEnemy(world, attacker.owner, e.owner) || e.insideOf) continue;
      if (Math.hypot(e.x - attacker.x, e.y - attacker.y) - e.radius - attacker.radius > r) continue;
      applyDamage(world, e, computeDamage({ ...ctx, target: e }), attacker);
    }
    world.emit({ type: 'explosion', x: attacker.x, y: attacker.y, size: 'large' });
    killEntity(world, attacker);
  },
};
