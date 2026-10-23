// Combat (spec §4.5): targeting, firing, the damage formula, building guns with crossfire,
// powder use, and death handling.
import { ownedUnits, registerCommand } from '../commands';
import { distToEntity, entityDistance } from '../geometry';
import { T } from '../map';
import { buildingAttack, hasTrait, unitStat } from '../stats';
import { traitsOf } from '../traits';
import type { AttackCtx } from '../traits/types';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { ejectAll } from './production';
import { isVisibleTo } from './fog';
import { clearMove, isMoving, moveGroup, moveUnitTo } from './movement';

// --- relations ---------------------------------------------------------------------------------

/** Hostility test; diplomacy (stage 5) extends it for villages via `relations.hook`. */
export const relations: { hook: ((world: World, a: Owner, b: Owner) => boolean | undefined) | null } = { hook: null };

export function isEnemy(world: World, a: Owner, b: Owner): boolean {
  if (a === b) return false;
  const h = relations.hook?.(world, a, b);
  if (h !== undefined) return h;
  return world.isPlayable(a) && world.isPlayable(b);
}

// --- geometry helpers ---------------------------------------------------------------------------

function tileOf(world: World, e: Entity) {
  return world.map.terrain[Math.floor(e.y) * world.map.width + Math.floor(e.x)];
}

export function onBattery(world: World, e: Entity): boolean {
  const b = world.buildingAt(Math.floor(e.x), Math.floor(e.y));
  return !!b && b.type === 'battery' && (b.built ?? 1) >= 1 && b.owner === e.owner;
}

export function inTrench(world: World, e: Entity): boolean {
  if (e.kind !== 'unit' || e.moveClass !== 'foot') return false;
  const b = world.buildingAt(Math.floor(e.x), Math.floor(e.y));
  return !!b && b.type === 'trench' && (b.built ?? 1) >= 1;
}

export function isElevated(world: World, e: Entity): boolean {
  if (e.kind === 'building') return world.map.terrain[(e.ty! + Math.floor(e.h! / 2)) * world.map.width + e.tx! + Math.floor(e.w! / 2)] === T.hill;
  return tileOf(world, e) === T.hill;
}

/** The entity an attacker physically fires from: its garrison building, or itself. */
function firingPlatform(world: World, e: Entity): Entity {
  return e.insideOf ? (world.get(e.insideOf) ?? e) : e;
}

export function hasPowder(world: World, e: Entity): boolean {
  const def = world.data.units.get(e.type);
  if (!def || def.powderPerShot <= 0) return true;
  const f = world.faction(e.owner);
  return !f || f.resources.powder >= def.powderPerShot;
}

/** Effective attack profile, accounting for powder starvation (§4.1: melee at ×0.4). */
export function attackProfile(world: World, e: Entity) {
  const def = world.data.units.get(e.type)!;
  let range = unitStat(world, e, 'range');
  let atk = unitStat(world, e, 'atk');
  let atkType: string = def.atkType;
  if (!hasPowder(world, e)) {
    range = 1;
    atk *= world.rules.powder.noPowderMeleeMul;
    atkType = 'melee';
    return { range, atk, atkType, ranged: false, usesPowder: false };
  }
  const platform = firingPlatform(world, e);
  if (atkType !== 'melee' && atkType !== 'fire') {
    if (isElevated(world, platform)) range += world.rules.combat.elevatedRangeBonus;
    if (platform !== e) range += world.rules.combat.garrisonRangeBonus;
    if (onBattery(world, e)) range += world.rules.siege.battery.rangeBonus;
  }
  return { range, atk, atkType, ranged: atkType !== 'melee', usesPowder: def.powderPerShot > 0 };
}

// --- damage ------------------------------------------------------------------------------------

function heroAuraAtkBonus(world: World, e: Entity): number {
  if (e.kind !== 'unit') return 0;
  let bonus = 0;
  const heroes = world.rules.heroes as Record<string, { radius: number; atkBonus?: number }>;
  for (const h of world.heroes()) {
    if (h.owner !== e.owner) continue;
    for (const t of world.data.units.get(h.type)!.traits) {
      const aura = heroes[t];
      if (aura?.atkBonus && Math.hypot(h.x - e.x, h.y - e.y) <= aura.radius) bonus = Math.max(bonus, aura.atkBonus);
    }
  }
  return bonus;
}

export function moraleMod(world: World, e: Entity): number {
  if (e.kind !== 'unit' || e.morale === undefined) return 1;
  for (const b of world.rules.morale.bands) if (e.morale >= b.min) return b.mod;
  return 1;
}

/** Number of distinct crossfire buildings (bastions) of `owner` that have `target` in range. */
export function crossfireCount(world: World, owner: Owner, target: Entity): number {
  let n = 0;
  for (const b of world.buildingsOf(owner)) {
    if (!(world.data.buildings.get(b.type) as { crossfire?: boolean }).crossfire || (b.built ?? 1) < 1) continue;
    const atk = buildingAttack(world, b);
    if (atk && entityDistance(b, target) <= atk.range + (isElevated(world, b) ? world.rules.combat.elevatedRangeBonus : 0)) n++;
  }
  return n;
}

/**
 * damage = max(1, atk × M[atkType][armorType] − armor) × (1 + Σbonus) × moraleMod   (spec §4.5)
 * Incoming multipliers (cover, battery, stranding, blocks) are applied separately in `takenMul`.
 */
export function computeDamage(ctx: AttackCtx, atkOverride?: number): number {
  const { world, attacker: a, target: t, atkType } = ctx;
  const matrix = world.rules.combat.damageMatrix as Record<string, Record<string, number>>;
  const armorType = t.kind === 'building' ? 'building' : world.data.units.get(t.type)!.armorType;
  const armor = t.kind === 'building' ? world.data.buildings.get(t.type)!.armor : unitStat(world, t, 'armor');
  let atk = atkOverride;
  if (atk === undefined) atk = a.kind === 'building' ? (buildingAttack(world, a)?.atk ?? 0) : attackProfile(world, a).atk;
  const base = Math.max(world.rules.combat.minDamage, atk * matrix[atkType][armorType] - armor);
  let bonus = heroAuraAtkBonus(world, a);
  if (a.kind === 'unit') for (const tr of traitsOf(world.data.units.get(a.type)!.traits)) bonus += tr.damageBonus?.(ctx) ?? 0;
  if (a.kind === 'building' && (world.data.buildings.get(a.type) as { crossfire?: boolean }).crossfire) {
    const c = world.rules.combat.crossfire;
    if (crossfireCount(world, a.owner, t) >= c.minSources) bonus += c.bonus;
  }
  // 烏特勒支堡: once captured, the captor's cannons hit the main castle harder (§5.3).
  if (atkType === 'cannon' && t.type === 'zeelandia_castle') bonus += world.faction(a.owner)?.mainBaseCannonBonus ?? 0;
  return base * (1 + bonus) * moraleMod(world, a);
}

/** Multiplier on damage the target takes from this attack (≤ 1 protects, > 1 exposes). */
export function takenMul(ctx: AttackCtx): number {
  const { world, target: t, atkType } = ctx;
  let m = 1;
  if (t.kind === 'unit') {
    for (const tr of traitsOf(world.data.units.get(t.type)!.traits)) m *= tr.incomingMul?.(ctx) ?? 1;
    if ((atkType === 'arrow' || atkType === 'musket') && inTrench(world, t)) m *= world.rules.combat.trenchCoverMul;
    if (onBattery(world, t)) m *= world.rules.siege.battery.damageTakenMul;
    if (t.stranded) m *= world.rules.tide.strandedDamageTakenMul;
  } else if (t.kind === 'building') {
    const aura = world.rules.heroes.aura_coyett;
    for (const h of world.heroes())
      if (h.owner === t.owner && world.data.units.get(h.type)!.traits.includes('aura_coyett') && distToEntity(h.x, h.y, t) <= aura.radius)
        m *= aura.buildingDamageTakenMul;
  }
  return m;
}

/** Lowers HP and resolves death/capture. Returns the damage actually dealt. */
export function applyDamage(world: World, target: Entity, amount: number, attacker?: Entity): number {
  if (target.dead || amount <= 0) return 0;
  const def = target.kind === 'building' ? (world.data.buildings.get(target.type) as { capturable?: boolean }) : null;
  const floor = def?.capturable ? 1 : 0;
  const before = target.hp;
  target.hp = Math.max(floor, target.hp - amount);
  target.lastHit = world.tick;
  if (attacker && target.kind === 'unit') target.lastAttacker = attacker.id;
  if (target.hp <= 0) killEntity(world, target, attacker);
  return before - target.hp;
}

/** Hooks run when a shot lands (castle morale under bombardment). */
export const hitHooks: ((world: World, attacker: Entity, target: Entity, atkType: string) => void)[] = [];

/** Hooks run when anything dies (morale, scenario triggers). */
export const deathHooks: ((world: World, e: Entity, killer?: Entity) => void)[] = [];

export function killEntity(world: World, e: Entity, killer?: Entity) {
  if (e.dead) return;
  world.emit({ type: 'death', id: e.id, unitType: e.type, owner: e.owner, x: e.x, y: e.y, kind: e.kind, killer: killer?.owner });
  if (e.kind === 'building') ejectAll(world, e);
  // Cargo goes down with the ship.
  for (const id of e.cargo ?? []) {
    const c = world.entities.get(id);
    if (c) {
      c.insideOf = null;
      killEntity(world, c);
    }
  }
  if (e.insideOf) {
    const host = world.get(e.insideOf);
    if (host) {
      host.garrisoned = host.garrisoned?.filter((x) => x !== e.id);
      host.cargo = host.cargo?.filter((x) => x !== e.id);
    }
  }
  for (const h of deathHooks) h(world, e, killer);
  world.remove(e.id);
}

// --- targeting -----------------------------------------------------------------------------------

function canTarget(world: World, a: Entity, t: Entity, melee: boolean): boolean {
  if (t.dead || t.insideOf || t.kind === 'resource') return false;
  if (!isEnemy(world, a.owner, t.owner)) return false;
  if (!isVisibleTo(world, a.owner, t)) return false;
  // Melee units cannot reach ships afloat; ships cannot ram buildings inland except with guns.
  if (melee && t.kind === 'unit' && t.moveClass !== 'foot' && !t.stranded && a.moveClass === 'foot') return false;
  if (t.kind === 'building' && t.type === 'mine' && t.owner !== a.owner && !isVisibleTo(world, a.owner, t)) return false;
  return true;
}

/** Nearest enemy within `radius`, preferring units over buildings (walls and farms last). */
export function acquireTarget(world: World, a: Entity, radius: number, melee: boolean): Entity | null {
  let best: Entity | null = null;
  let bestScore = Infinity;
  const consider = (t: Entity) => {
    if (!canTarget(world, a, t, melee)) return;
    // A breached fort is taken, not destroyed: no point hammering it.
    if (t.kind === 'building' && (world.data.buildings.get(t.type) as { capturable?: boolean }).capturable && t.hp <= t.maxHp * world.rules.capture.maxHpFraction) return;
    const d = entityDistance(a, t);
    if (d > radius) return;
    // Walls, farms, trenches and batteries are only attacked on explicit orders.
    if (t.kind === 'building' && ['lower_town_wall', 'farm', 'trench', 'battery'].includes(t.type)) return;
    const tier = t.kind === 'unit' ? 0 : 1;
    const score = tier * 1000 + d;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  };
  for (const t of world.unitsNear(a.x, a.y, radius + 1.5)) consider(t);
  for (const t of world.buildingsNear(a.x, a.y, radius + 4)) consider(t);
  return best;
}

// --- commands ----------------------------------------------------------------------------------

registerCommand('attack', (world, cmd) => {
  const t = world.get(cmd.target);
  if (!t) return;
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (u.order?.type === 'rout' || hasTrait(world, u, 'non_combat')) continue;
    clearMove(world, u);
    u.order = { type: 'attack', target: t.id };
    u.attackTarget = t.id;
  }
});

registerCommand('attack_move', (world, cmd) => {
  const units = ownedUnits(world, cmd.owner, cmd.ids).filter((u) => u.order?.type !== 'rout' && !u.stranded);
  for (const u of units) {
    u.order = { type: 'move', x: cmd.x, y: cmd.y, attackMove: true };
    u.attackTarget = undefined;
  }
  moveGroup(world, units, cmd.x, cmd.y);
});

registerCommand('attack_ground', (world, cmd) => {
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (u.order?.type === 'rout') continue;
    clearMove(world, u);
    u.order = { type: 'attack_ground', x: cmd.x, y: cmd.y };
  }
});

registerCommand('patrol', (world, cmd) => {
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    if (u.order?.type === 'rout') continue;
    u.order = { type: 'patrol', ax: u.x, ay: u.y, bx: cmd.x, by: cmd.y, toB: true };
    moveUnitTo(world, u, cmd.x, cmd.y);
  }
});

// --- firing ------------------------------------------------------------------------------------

function hitChance(world: World, a: Entity, ctx: AttackCtx, base: number): number {
  if (ctx.atkType !== 'musket' && ctx.atkType !== 'cannon') return 1;
  let p = base;
  if (a.kind === 'unit') for (const tr of traitsOf(world.data.units.get(a.type)!.traits)) p += tr.hitBonus?.(ctx) ?? 0;
  p -= world.weather.rangedHitPenalty;
  return Math.max(0.05, Math.min(1, p));
}

/** One shot from `a` at `t` (already validated in range). */
function fire(world: World, a: Entity, t: Entity, prof: { atk: number; atkType: string; usesPowder: boolean }, hit: number, fromBuilding: boolean) {
  const f = world.faction(a.owner);
  if (prof.usesPowder && f) {
    const cost = a.kind === 'building' ? world.rules.powder.cannonPerShot : world.data.units.get(a.type)!.powderPerShot;
    f.resources.powder = Math.max(0, f.resources.powder - cost);
  }
  const ctx: AttackCtx = { world, attacker: a, target: t, atkType: prof.atkType, fromBuilding };
  const p = hitChance(world, a, ctx, hit);
  const hits = p >= 1 || world.rng.chance(p);
  const src = fromBuilding && a.kind === 'unit' ? firingPlatform(world, a) : a;
  world.emit({ type: 'shot', from: a.id, to: t.id, atkType: prof.atkType, hit: hits, x: src.x, y: src.y, tx: t.x, ty: t.y });
  if (!hits) return;
  const dmg = computeDamage(ctx, prof.atk) * takenMul(ctx);
  const dealt = applyDamage(world, t, dmg, a);
  for (const h of hitHooks) h(world, a, t, prof.atkType);
  const traits = a.kind === 'unit' ? world.data.units.get(a.type)!.traits : (world.faction(a.owner)?.buildingMods[a.type]?.traits ?? []);
  for (const tr of traitsOf(traits.filter((n) => n !== 'suicide'))) tr.afterHit?.(ctx, dealt);
}

function unitCanFire(world: World, u: Entity): boolean {
  for (const tr of traitsOf(world.data.units.get(u.type)!.traits)) if (tr.canFire && !tr.canFire(world, u)) return false;
  return true;
}

function unitCombat(world: World, u: Entity) {
  const def = world.data.units.get(u.type)!;
  if (def.traits.includes('non_combat')) return;
  const hz = world.ticksPerSecond;
  if (def.traits.includes('must_deploy')) u.deployTicks = u.x !== u.px || u.y !== u.py ? 0 : (u.deployTicks ?? 0) + 1;
  if ((u.cooldown ?? 0) > 0) u.cooldown!--;
  const o = u.order ?? { type: 'idle' };
  if (o.type === 'rout') return;
  const garrisoned = !!u.insideOf;
  if (garrisoned) {
    const host = world.get(u.insideOf!);
    if (!host || host.type === 'tuntian' || host.cargo?.includes(u.id) || !world.data.buildings.get(host.type)?.attack) return;
  }
  const prof = attackProfile(world, u);
  const melee = !prof.ranged;
  const sight = unitStat(world, u, 'sight');

  let target: Entity | null = null;
  if (o.type === 'attack') {
    const t = world.get(o.target);
    if (!t || !canTarget(world, u, t, melee)) {
      u.order = { type: 'idle' };
      u.attackTarget = undefined;
      clearMove(world, u);
      return;
    }
    target = t;
  } else if (o.type === 'attack_ground') {
    return groundFire(world, u, o.x, o.y, prof);
  } else {
    const isWorker = def.traits.includes('gatherer');
    const busy = o.type === 'gather' || o.type === 'build' || o.type === 'garrison' || o.type === 'tuntian' || o.type === 'embark' || o.type === 'dig_mine';
    const plainMove = o.type === 'move' && !o.attackMove;
    if (busy || plainMove || (isWorker && !world.rules.combat.autoAcquireWorkers)) {
      u.attackTarget = undefined;
      return;
    }
    // Keep the current auto target while it stays valid and close; otherwise look again.
    const cur = u.attackTarget !== undefined ? world.get(u.attackTarget) : undefined;
    const leash = garrisoned ? prof.range : Math.max(sight, prof.range) + 2;
    // Unit layer (spec §8.1): fight back against whoever just hit us, even from beyond our sight.
    const attacker = u.lastAttacker !== undefined && world.tick - (u.lastHit ?? -1e9) <= world.rules.combat.counterAttackTicks ? world.get(u.lastAttacker) : undefined;
    if (cur && canTarget(world, u, cur, melee) && entityDistance(firingPlatform(world, u), cur) <= leash) target = cur;
    else if (attacker && !isWorker && canTarget(world, u, attacker, melee) && entityDistance(firingPlatform(world, u), attacker) <= leash + 4) target = attacker;
    else if ((world.tick + u.id) % 4 === 0 || cur) target = acquireTarget(world, garrisoned ? firingPlatform(world, u) : u, garrisoned ? prof.range : Math.max(sight, prof.range), melee);
  }
  u.attackTarget = target?.id;
  if (!target) {
    if (o.type === 'move' && o.attackMove && !isMoving(u)) moveUnitTo(world, u, o.x, o.y);
    return;
  }

  const platform = firingPlatform(world, u);
  const dist = entityDistance(platform, target);
  // Fire ships have to touch their victim.
  const reach = def.traits.includes('suicide') ? 0.25 : prof.range;
  if (dist <= reach) {
    if (isMoving(u) && !garrisoned) {
      clearMove(world, u);
      if (def.traits.includes('must_deploy')) u.deployTicks = 0;
    }
    u.facing = Math.atan2(target.y - u.y, target.x - u.x);
    if ((u.cooldown ?? 0) > 0 || !unitCanFire(world, u)) return;
    if (def.traits.includes('suicide')) {
      if (target.kind === 'unit' && target.moveClass !== 'foot') {
        traitsOf(['suicide'])[0].afterHit!({ world, attacker: u, target, atkType: 'fire', fromBuilding: false }, 0);
      }
      return;
    }
    u.cooldown = Math.max(1, Math.round(unitStat(world, u, 'atkInterval') * hz));
    fire(world, u, target, prof, unitStat(world, u, 'hitChance'), garrisoned);
    u.lastCombat = world.tick;
    // Broadside: extra targets in range.
    for (const tr of traitsOf(def.traits)) {
      if (!tr.extraTargets || target.dead) continue;
      const cands = world.unitsNear(u.x, u.y, prof.range + 1).filter((c) => canTarget(world, u, c, melee) && entityDistance(u, c) <= prof.range);
      for (const extra of tr.extraTargets({ world, attacker: u, target, atkType: prof.atkType, fromBuilding: false }, cands))
        if (hasPowder(world, u)) fire(world, u, extra, prof, unitStat(world, u, 'hitChance'), false);
    }
    return;
  }
  // Out of range: chase (garrisoned units and deployed guns hold position unless ordered).
  if (garrisoned) return;
  if (o.type !== 'attack' && def.traits.includes('must_deploy') && !isMoving(u)) {
    // Auto-acquired targets beyond range: guns stay put.
    return;
  }
  const last = u.chaseAt ?? -999;
  if (!isMoving(u) || world.tick - last >= world.rules.combat.repathTicks) {
    u.chaseAt = world.tick;
    moveUnitTo(world, u, target.x, target.y);
    u.chasing = true;
  }
}

function groundFire(world: World, u: Entity, x: number, y: number, prof: ReturnType<typeof attackProfile>) {
  const d = Math.hypot(x - u.x, y - u.y);
  if (d > prof.range + 0.5) {
    if (!isMoving(u)) {
      moveUnitTo(world, u, x, y);
      u.chasing = true;
    }
    return;
  }
  if (isMoving(u)) clearMove(world, u);
  if ((u.cooldown ?? 0) > 0 || !unitCanFire(world, u) || !prof.ranged) return;
  u.cooldown = Math.max(1, Math.round(unitStat(world, u, 'atkInterval') * world.ticksPerSecond));
  // Hits whatever enemy occupies the point: a building footprint, a hidden mine, or units nearby.
  const b = world.buildingAt(Math.floor(x), Math.floor(y));
  const t = b && b.owner !== u.owner ? b : world.unitsNear(x, y, 0.8).find((e) => isEnemy(world, u.owner, e.owner));
  if (!t) {
    world.emit({ type: 'shot', from: u.id, to: 0, atkType: prof.atkType, hit: false, x: u.x, y: u.y, tx: x, ty: y });
    const f = world.faction(u.owner);
    if (prof.usesPowder && f) f.resources.powder = Math.max(0, f.resources.powder - world.data.units.get(u.type)!.powderPerShot);
    return;
  }
  fire(world, u, t, prof, unitStat(world, u, 'hitChance'), false);
}

function buildingCombat(world: World, b: Entity) {
  const atk = buildingAttack(world, b);
  if (!atk || (b.built ?? 1) < 1 || !world.isPlayable(b.owner)) return;
  const hz = world.ticksPerSecond;
  b.gunCooldowns ??= Array.from({ length: atk.guns }, (_, i) => Math.round((i * atk.atkInterval * hz) / atk.guns));
  const range = atk.range + (isElevated(world, b) ? world.rules.combat.elevatedRangeBonus : 0);
  let target: Entity | null = null;
  for (let g = 0; g < b.gunCooldowns.length; g++) {
    if (b.gunCooldowns[g] > 0) {
      b.gunCooldowns[g]--;
      continue;
    }
    const f = world.faction(b.owner);
    if (f && f.resources.powder < world.rules.powder.cannonPerShot) return;
    if (!target || target.dead) target = acquireTarget(world, b, range, false);
    if (!target) return;
    b.gunCooldowns[g] = Math.round(atk.atkInterval * hz);
    fire(world, b, target, { atk: atk.atk, atkType: atk.atkType, usesPowder: true }, atk.hitChance, true);
    b.lastCombat = world.tick;
  }
}

export function combatSystem(world: World) {
  world.rebuildSpatial();
  for (const e of world.all()) {
    if (e.kind === 'unit') unitCombat(world, e);
    else if (e.kind === 'building') buildingCombat(world, e);
  }
  // Patrol legs.
  for (const u of world.all()) {
    const o = u.order;
    if (u.kind !== 'unit' || o?.type !== 'patrol' || isMoving(u) || u.attackTarget !== undefined) continue;
    o.toB = !o.toB;
    moveUnitTo(world, u, o.toB ? o.bx : o.ax, o.toB ? o.by : o.ay);
    u.order = o;
  }
}
