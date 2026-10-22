// Tactical layer (spec §8.1, every second): focus fire on weakened enemies, pull badly hurt units
// back (hard), keep heroes out of harm's way.
import { attackProfile } from '../systems/combat';
import { entityDistance } from '../geometry';
import type { Entity } from '../types';
import { army, difficultyOf, isHero, issue, visibleEnemies, type AiCtx } from './common';

export function tactical(ctx: AiCtx) {
  const w = ctx.world;
  const diff = difficultyOf(w, ctx.ai);
  const mine = army(w, ctx.owner);
  const enemies = visibleEnemies(w, ctx.owner);
  if (!enemies.length) return;

  if (diff.focusFire) {
    // Ranged units fighting: switch to the weakest enemy they can already reach.
    const retarget = new Map<number, number[]>();
    for (const u of mine) {
      if (u.attackTarget === undefined || u.order?.type === 'rout') continue;
      const prof = attackProfile(w, u);
      if (!prof.ranged) continue;
      const cur = w.get(u.attackTarget);
      let best: Entity | null = null;
      let bestF = cur && cur.kind === 'unit' ? cur.hp / cur.maxHp - 0.2 : 2;
      for (const e of enemies) {
        if (entityDistance(u, e) > prof.range) continue;
        const f = e.hp / e.maxHp;
        if (f < bestF) {
          bestF = f;
          best = e;
        }
      }
      if (best && best.id !== u.attackTarget) {
        const list = retarget.get(best.id) ?? [];
        list.push(u.id);
        retarget.set(best.id, list);
      }
    }
    for (const [target, ids] of [...retarget].sort((a, b) => a[0] - b[0])) issue(ctx, { type: 'attack', ids, target });
  }

  if (diff.pullBack) {
    const hurt = mine.filter((u) => u.hp / u.maxHp < w.rules.ai.pullBackHp && u.attackTarget !== undefined && !isHero(w, u));
    if (hurt.length) issue(ctx, { type: 'move', ids: hurt.map((u) => u.id), x: ctx.ai.home[0], y: ctx.ai.home[1] });
  }

  // Heroes retreat when wounded and enemies are close.
  for (const h of mine.filter((u) => isHero(w, u))) {
    if (h.hp / h.maxHp > 0.5) continue;
    if (enemies.some((e) => Math.hypot(e.x - h.x, e.y - h.y) < 7)) issue(ctx, { type: 'move', ids: [h.id], x: ctx.ai.home[0], y: ctx.ai.home[1] });
  }
}
