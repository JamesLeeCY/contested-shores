// Fort capture and mining (spec §4.12, §5.3).
import { ownedUnits, registerCommand } from '../commands';
import { distToEntity } from '../geometry';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { applyDamage, isEnemy, killEntity } from './combat';
import { detectedMines } from './fog';
import { changeCastleMorale } from './morale';
import { clearMove, isMoving, moveUnitTo } from './movement';
import { ejectAll } from './production';

// --- capture ---------------------------------------------------------------------------------------

/** Hooks fired after a building changes hands (scenario triggers, settlers' favour). */
export const captureHooks: ((world: World, b: Entity, from: Owner, to: Owner) => void)[] = [];

/**
 * A capturable fort (熱蘭遮城, 烏特勒支堡, 普羅民遮城) falls when it is at or below half HP,
 * has no garrison, no defenders within 4 tiles, and enemy foot soldiers stand within 2 tiles
 * for 10 s. Capturable forts never drop below 1 HP.
 */
function captureTick(world: World, b: Entity) {
  const r = world.rules.capture;
  const hz = world.ticksPerSecond;
  let attacker: Owner | null = null;
  let defended = (b.garrisoned?.length ?? 0) > 0;
  for (const u of world.unitsNear(b.x, b.y, b.w! / 2 + r.defenderRadius + 1)) {
    if (u.insideOf || u.kind !== 'unit') continue;
    const d = distToEntity(u.x, u.y, b);
    if (u.owner === b.owner && d <= r.defenderRadius && u.order?.type !== 'rout') defended = true;
    else if (isEnemy(world, u.owner, b.owner) && u.moveClass === 'foot' && d <= r.attackerRadius && u.order?.type !== 'rout')
      attacker ??= u.owner;
  }
  if (!attacker || defended || b.hp > b.maxHp * r.maxHpFraction) {
    b.captureTicks = Math.max(0, (b.captureTicks ?? 0) - 2);
    if (!b.captureTicks) b.captureBy = undefined;
    return;
  }
  if (b.captureBy !== attacker) {
    b.captureBy = attacker;
    b.captureTicks = 0;
  }
  b.captureTicks = (b.captureTicks ?? 0) + 1;
  if (b.captureTicks >= r.seconds * hz) captureBuilding(world, b, attacker);
}

export function captureBuilding(world: World, b: Entity, to: Owner) {
  const from = b.owner;
  ejectAll(world, b);
  b.owner = to;
  b.captureTicks = 0;
  b.captureBy = undefined;
  b.queue = [];
  b.rally = null;
  b.gunCooldowns = undefined;
  const def = world.data.buildings.get(b.type) as { onCapture?: { cannonVsMainBaseBonus?: number; becomesMainBase?: boolean } };
  const bonus = def.onCapture?.cannonVsMainBaseBonus;
  const f = world.faction(to);
  if (bonus && f) f.mainBaseCannonBonus = Math.max(f.mainBaseCannonBonus, bonus);
  if (b.type !== 'zeelandia_castle') changeCastleMorale(world, from, world.rules.morale.castle.outpostLost, 'outpost_lost');
  world.emit({ type: 'captured', id: b.id, building: b.type, from, to });
  for (const h of captureHooks) h(world, b, from, to);
}

// --- mines -------------------------------------------------------------------------------------------

export type MineError = 'stage' | 'faction' | 'no_trench' | 'too_far' | 'target';

/** Nearest own completed trench within mine range of the target, or an error. */
export function mineOrigin(world: World, owner: Owner, target: Entity): Entity | MineError {
  const cfg = world.rules.siege.mine;
  const f = world.faction(owner);
  if (!f) return 'faction';
  if (owner !== 'faction_zheng') return 'faction';
  if (f.stage < cfg.stage) return 'stage';
  if (target.kind !== 'building' || !isEnemy(world, owner, target.owner) || target.type === 'mine') return 'target';
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const t of world.buildingsOf(owner)) {
    if (t.type !== 'trench' || (t.built ?? 1) < 1) continue;
    const d = distToEntity(t.x, t.y, target);
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best) return 'no_trench';
  if (bestD > cfg.maxTiles) return 'too_far';
  return best;
}

registerCommand('dig_mine', (world, cmd) => {
  const target = world.get(cmd.target);
  if (!target) return;
  const origin = mineOrigin(world, cmd.owner, target);
  if (typeof origin === 'string') return;
  const diggers = ownedUnits(world, cmd.owner, cmd.ids).filter((u) => world.data.units.get(u.type)!.traits.includes('builder'));
  if (!diggers.length) return;
  // Reuse an unfinished mine from the same trench at the same target.
  let mine = [...world.all()].find((e) => e.type === 'mine' && e.owner === cmd.owner && e.mineTarget === target.id && e.mineFromX === origin.x && e.mineFromY === origin.y);
  if (!mine) {
    mine = world.spawnBuilding('mine', cmd.owner, origin.tx!, origin.ty!, 1, undefined, 1);
    mine.mineTarget = target.id;
    mine.mineLength = Math.max(1, Math.ceil(distToEntity(origin.x, origin.y, target)));
    mine.mineTicks = 0;
    mine.mineFromX = origin.x;
    mine.mineFromY = origin.y;
  }
  for (const u of diggers) {
    clearMove(world, u);
    u.order = { type: 'dig_mine', target: mine.id };
  }
});

function mineTick(world: World, mine: Entity) {
  const cfg = world.rules.siege.mine;
  const hz = world.ticksPerSecond;
  const target = world.get(mine.mineTarget!);
  if (!target) {
    killEntity(world, mine);
    return;
  }
  let digging = false;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.order?.type !== 'dig_mine' || u.order.target !== mine.id) continue;
    if (Math.hypot(u.x - mine.mineFromX!, u.y - mine.mineFromY!) <= 1.2) {
      if (isMoving(u)) clearMove(world, u);
      digging = true;
    } else if (!isMoving(u)) moveUnitTo(world, u, mine.mineFromX!, mine.mineFromY!);
  }
  if (!digging) return;
  mine.mineTicks = (mine.mineTicks ?? 0) + 1;
  const dug = Math.min(mine.mineLength!, mine.mineTicks / (cfg.secondsPerTile * hz));
  // The mine head advances towards the target (used for counter-mine detection).
  const f = dug / mine.mineLength!;
  const [tx, ty] = [target.x, target.y];
  mine.x = mine.mineFromX! + (tx - mine.mineFromX!) * f * 0.95;
  mine.y = mine.mineFromY! + (ty - mine.mineFromY!) * f * 0.95;
  mine.tx = Math.floor(mine.x);
  mine.ty = Math.floor(mine.y);
  if (dug >= mine.mineLength!) {
    world.emit({ type: 'explosion', x: target.x, y: target.y, size: 'large' });
    world.emit({ type: 'mine_exploded', target: target.id, owner: mine.owner });
    applyDamage(world, target, cfg.wallDamage);
    for (const u of world.all()) if (u.order?.type === 'dig_mine' && u.order.target === mine.id) u.order = { type: 'idle' };
    killEntity(world, mine);
  }
}

/** 反坑道: VOC sees enemy mine heads within the detection radius of its buildings. */
function counterMine(world: World) {
  for (const [owner] of world.factions) {
    const R = owner === 'faction_voc' ? world.rules.siege.counterMineRadius : 0;
    if (!R) continue;
    let m = detectedMines.get(world);
    if (!m) detectedMines.set(world, (m = new Map()));
    let set = m.get(owner);
    if (!set) m.set(owner, (set = new Set()));
    for (const mine of world.all()) {
      if (mine.type !== 'mine' || mine.owner === owner || set.has(mine.id)) continue;
      if (world.buildingsOf(owner).some((b) => b.type !== 'mine' && distToEntity(mine.x, mine.y, b) <= R)) {
        set.add(mine.id);
        world.emit({ type: 'mine_detected', id: mine.id, owner });
      }
    }
  }
}

export function siegeSystem(world: World) {
  for (const e of world.all()) {
    if (e.kind !== 'building') continue;
    if ((world.data.buildings.get(e.type) as { capturable?: boolean }).capturable) captureTick(world, e);
    else if (e.type === 'mine') mineTick(world, e);
  }
  if (world.tick % 10 === 0) counterMine(world);
}
