// Neutral village AI (spec §8.4): defend the land when invaded, raid factions it is hostile to,
// otherwise stay home. Hunters walk between the village's deer herds.
import { distToEntity } from '../geometry';
import type { PartyState } from '../state';
import type { Entity } from '../types';
import type { World } from '../world';
import { SETTLERS, inTerritory } from '../systems/diplomacy';
import { clearMove, isMoving, moveUnitTo } from '../systems/movement';

const THINK_TICKS = 20;

function villageCenter(world: World, p: PartyState): Entity | undefined {
  return world.buildings().find((b) => b.type === 'village_center' && b.village === p.id);
}

function warriorsOf(world: World, p: PartyState): Entity[] {
  return [...world.all()].filter((e) => e.kind === 'unit' && e.owner === p.owner && e.type === 'village_warrior');
}

function nearestEnemyOnLand(world: World, p: PartyState, faction: string, from: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.all()) {
    if (e.owner !== faction || e.insideOf || e.kind === 'resource') continue;
    if (!inTerritory(world, p, e.x, e.y)) continue;
    const d = Math.hypot(e.x - from.x, e.y - from.y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Raid target: the hostile faction's nearest tuntian, farm, or gatherer to the village. */
function raidTarget(world: World, faction: string, c: Entity): Entity | null {
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const e of world.all()) {
    if (e.owner !== faction || e.insideOf) continue;
    const ok =
      (e.kind === 'building' && (e.type === 'tuntian' || e.type === 'farm')) ||
      (e.kind === 'unit' && world.data.units.get(e.type)!.traits.includes('gatherer'));
    if (!ok) continue;
    const d = distToEntity(c.x, c.y, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

function goHome(world: World, u: Entity, c: Entity) {
  u.order = { type: 'idle' };
  u.attackTarget = undefined;
  if (Math.hypot(u.x - c.x, u.y - c.y) > 3.5) moveUnitTo(world, u, c.x + ((u.id % 5) - 2) * 0.8, c.y + 2.5);
  else clearMove(world, u);
}

export function villageAiSystem(world: World) {
  if (world.tick % THINK_TICKS !== 0) return;
  const d = world.rules.diplomacy;
  const hz = world.ticksPerSecond;
  const dayStart = world.tick > 0 && world.tick % world.rules.sim.ticksPerDay === 0;
  for (const id of Object.keys(world.ext.parties).sort()) {
    const p = world.ext.parties[id];
    if (p.id === SETTLERS) continue;
    const c = villageCenter(world, p);
    if (!c) continue;
    const warriors = warriorsOf(world, p);
    const home = warriors.filter((w) => !p.raiders.includes(w.id));

    // Invaded: every warrior at home answers, for as long as the invasion timer runs.
    const invaders = Object.entries(p.invaded)
      .filter(([, until]) => until > world.tick)
      .map(([f]) => f)
      .sort();
    let defending = false;
    for (const f of invaders) {
      for (const w of home) {
        const cur = w.order?.type === 'attack' ? world.get(w.order.target) : undefined;
        if (cur && cur.owner === f && inTerritory(world, p, cur.x, cur.y)) continue;
        const t = nearestEnemyOnLand(world, p, f, w);
        if (t) {
          w.order = { type: 'attack', target: t.id };
          w.attackTarget = t.id;
          defending = true;
        }
      }
    }

    // Hostile: every 2 days send up to 4 warriors after the faction's farms and workers.
    if (dayStart && world.day % d.hostileRaid.everyDays === 0 && !p.raiders.length)
      for (const f of [...p.hostile].sort()) {
        const target = raidTarget(world, f, c);
        if (!target) continue;
        const raiders = home.slice(0, d.hostileRaid.warriors);
        for (const w of raiders) {
          w.order = { type: 'attack', target: target.id };
          w.attackTarget = target.id;
          p.raiders.push(w.id);
        }
        p.raidUntil = world.tick + d.raidRetreatSeconds * hz;
        world.emit({ type: 'village_raid', party: p.id, faction: f, n: raiders.length });
        break;
      }
    if (p.raiders.length && world.tick >= p.raidUntil) {
      for (const id of p.raiders) {
        const w = world.get(id);
        if (w) goHome(world, w, c);
      }
      p.raiders = [];
    }

    // Everyone else drifts back home.
    if (!defending)
      for (const w of home.filter((x) => !p.raiders.includes(x.id))) {
        if (w.order?.type === 'attack' && !invaders.length) goHome(world, w, c);
        else if (!isMoving(w) && w.order?.type !== 'attack' && Math.hypot(w.x - c.x, w.y - c.y) > 6) goHome(world, w, c);
      }
  }
}
