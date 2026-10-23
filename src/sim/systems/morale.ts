// Unit morale and rout; VOC castle morale (spec §4.6). Hero auras (spec §3).
import type { Entity } from '../types';
import type { World } from '../world';
import { deathHooks, hitHooks } from './combat';
import { distToEntity } from '../geometry';
import { clearMove, moveUnitTo } from './movement';

export function maxMorale(world: World, e: Entity): number {
  return Math.min(world.rules.morale.unitMax, (world.rules.morale.unitMaxByFaction as Record<string, number>)[e.owner] ?? world.rules.morale.unitMax);
}

/** Coyett: −30% morale loss for VOC units within 8 tiles (and the castle while he lives). */
function lossMul(world: World, e: Entity): number {
  const aura = world.rules.heroes.aura_coyett;
  for (const h of world.heroes())
    if (h.owner === e.owner && h.type === 'coyett' && Math.hypot(h.x - e.x, h.y - e.y) <= aura.radius) return aura.castleMoraleLossMul;
  return 1;
}

export function changeMorale(world: World, e: Entity, delta: number) {
  if (e.kind !== 'unit' || e.morale === undefined) return;
  const d = delta < 0 ? delta * lossMul(world, e) : delta;
  e.morale = Math.max(0, Math.min(maxMorale(world, e), e.morale + d));
}

/** VOC castle morale (0–100). Losses are softened while Coyett lives. */
export function changeCastleMorale(world: World, owner: string, delta: number, reason: string) {
  const f = world.faction(owner);
  if (!f || owner !== 'faction_voc') return;
  let d = delta;
  if (d < 0 && world.heroes().some((h) => h.owner === owner && h.type === 'coyett')) d *= world.rules.heroes.aura_coyett.castleMoraleLossMul;
  f.castleMorale = Math.max(0, Math.min(100, f.castleMorale + d));
  world.emit({ type: 'castle_morale', owner, delta: d, value: f.castleMorale, reason });
}

// Bombardment of the main castle wears down the garrison's will to hold (see DECISIONS.md).
hitHooks.push((world, attacker, target, atkType) => {
  if (target.type === 'zeelandia_castle' && atkType === 'cannon' && world.isPlayable(attacker.owner) && attacker.owner !== target.owner)
    changeCastleMorale(world, target.owner, world.rules.morale.castle.bombardHit, 'bombardment');
});

deathHooks.push((world, dead, killer) => {
  if (dead.kind !== 'unit') return;
  const m = world.rules.morale;
  for (const u of world.unitsNear(dead.x, dead.y, m.allyDeath.radius))
    if (u.owner === dead.owner && u.id !== dead.id) changeMorale(world, u, m.allyDeath.delta);
  if (killer?.kind === 'unit') changeMorale(world, killer, m.kill);
});

function nearestFriendlyBuilding(world: World, u: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const b of world.buildingsOf(u.owner)) {
    if ((b.built ?? 1) < 1 || !b.blocks) continue;
    const d = distToEntity(u.x, u.y, b);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}

export function moraleSystem(world: World) {
  const m = world.rules.morale;
  const hz = world.ticksPerSecond;
  const heroes = world.heroes();
  const auraCfg = world.rules.heroes as Record<string, { radius: number; moraleRegenMul?: number }>;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.morale === undefined || u.insideOf) continue;
    // Hero auras: +1/s (鄭成功: +50%).
    let aura = 0;
    for (const h of heroes) {
      if (h.owner !== u.owner || h.id === u.id) continue;
      for (const tr of world.data.units.get(h.type)!.traits) {
        const cfg = auraCfg[tr];
        if (cfg && Math.hypot(h.x - u.x, h.y - u.y) <= cfg.radius) aura = Math.max(aura, m.heroAuraPerSecond * (cfg.moraleRegenMul ?? 1));
      }
    }
    if (aura) changeMorale(world, u, aura / hz);
    // Slow recovery towards the resting value once out of combat for a while.
    const calm = world.tick - Math.max(u.lastHit ?? -1e9, u.lastCombat ?? -1e9) > m.regen.calmSeconds * hz;
    if (calm && u.morale < m.regen.target) u.morale = Math.min(m.regen.target, u.morale + m.regen.perSecond / hz);

    const o = u.order;
    if (o?.type === 'rout') {
      if (world.tick >= o.until) {
        u.order = { type: 'idle' };
        u.morale = Math.max(u.morale, m.afterRout);
        clearMove(world, u);
      }
      continue;
    }
    const lowest = m.bands[m.bands.length - 1] as { min: number; rout?: boolean };
    const routBelow = m.bands[m.bands.length - 2].min;
    if (lowest.rout && u.morale < routBelow && !world.data.units.get(u.type)!.traits.includes('hero')) {
      u.order = { type: 'rout', until: world.tick + m.routSeconds * hz };
      u.attackTarget = undefined;
      const b = nearestFriendlyBuilding(world, u);
      if (b) moveUnitTo(world, u, b.x, b.y);
      else clearMove(world, u);
      world.emit({ type: 'rout', id: u.id, owner: u.owner });
    }
  }
}

/** Speed multiplier from morale (10–29: −10%). */
export function moraleSpeedMul(world: World, e: Entity): number {
  if (e.morale === undefined) return 1;
  for (const b of world.rules.morale.bands) if (e.morale >= b.min) return b.speedMul;
  return 1;
}
