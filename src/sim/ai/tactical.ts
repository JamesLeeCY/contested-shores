// Tactical layer (spec §8.1, every second): focus fire on weakened enemies, pull badly hurt units
// back and send idle men to help comrades in a fight (hard), keep heroes out of harm's way.
import { attackProfile } from '../systems/combat';
import { entityDistance } from '../geometry';
import type { Entity } from '../types';
import { army, difficultyOf, isHero, issue, passablePoint, visibleEnemies, type AiCtx } from './common';
import { isMoving } from '../systems/movement';

/** A spot `d` tiles further from the nearest enemy (a step back, not a march home across the map). */
function stepBack(ctx: AiCtx, u: Entity, enemies: Entity[], d = 6): [number, number] {
  const near = enemies.reduce((a, b) => (Math.hypot(a.x - u.x, a.y - u.y) <= Math.hypot(b.x - u.x, b.y - u.y) ? a : b));
  const len = Math.hypot(u.x - near.x, u.y - near.y) || 1;
  const x = u.x + ((u.x - near.x) / len) * d;
  const y = u.y + ((u.y - near.y) / len) * d;
  return passablePoint(ctx.world, 'foot', x, y, 4) ?? ctx.ai.home;
}

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
    // Scripted chapters keep their lines: a hurt man steps back out of the fight; the old way (march
    // home) is kept for the 1661 economy AI, whose home is its base.
    const hurt = mine.filter((u) => u.hp / u.maxHp < w.rules.ai.pullBackHp && u.attackTarget !== undefined && !isHero(w, u));
    for (const u of hurt) {
      const [x, y] = ctx.ai.scripted ? stepBack(ctx, u, enemies) : ctx.ai.home;
      issue(ctx, { type: 'move', ids: [u.id], x, y });
    }
  }

  if (diff.assist) {
    // Idle men join comrades fighting within 8 tiles.
    const fighting = mine.filter((u) => u.attackTarget !== undefined);
    const idle = mine.filter((u) => u.attackTarget === undefined && !isMoving(u) && (u.order?.type ?? 'idle') === 'idle' && !isHero(w, u) && !u.hold);
    for (const u of idle) {
      const mate = fighting.find((f) => Math.hypot(f.x - u.x, f.y - u.y) <= 8);
      const foe = mate && w.get(mate.attackTarget!);
      if (foe) issue(ctx, { type: 'attack_move', ids: [u.id], x: foe.x, y: foe.y });
    }
  }

  // Heroes retreat when wounded and enemies are close.
  for (const h of mine.filter((u) => isHero(w, u))) {
    if (h.hp / h.maxHp > 0.5) continue;
    if (enemies.some((e) => Math.hypot(e.x - h.x, e.y - h.y) < 7)) issue(ctx, { type: 'move', ids: [h.id], x: ctx.ai.home[0], y: ctx.ai.home[1] });
  }
}
