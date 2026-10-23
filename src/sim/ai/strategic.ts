// Strategic layer (spec §8.1): economy upkeep, production by composition, the ECONOMY / BUILDUP /
// ATTACK / DEFEND / REGROUP / SIEGE state machine, and the scenario plan runner.
import { distToEntity } from '../geometry';
import { buildingAttack } from '../stats';
import { isElevated } from '../systems/combat';
import type { AiStateName } from '../state';
import { canAfford } from '../stats';
import type { Entity } from '../types';
import { T } from '../map';
import { canGarrison, canProduce, canResearch } from '../systems/production';
import { isMoving } from '../systems/movement';
import { resourceOf } from '../systems/economy';
import { farmAccess, forestEdge } from '../systems/economy';

function adjacentComponent(w: import('../world').World, x: number, y: number, comp: number) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (w.nav.component('foot', x + dx, y + dy) === comp) return true;
  return false;
}
import {
  army,
  armyPop,
  centroid,
  difficultyOf,
  isGun,
  isHero,
  issue,
  nearest,
  targetBuilding,
  units,
  visibleEnemies,
  workers,
  type AiCtx,
} from './common';
import { ensureBuilding, STEP_HANDLERS } from './plans';

function setState(ctx: AiCtx, s: AiStateName) {
  if (ctx.ai.state === s) return;
  ctx.ai.prevState = ctx.ai.state;
  ctx.ai.state = s;
  ctx.world.emit({ type: 'ai_state', owner: ctx.owner, state: s });
}

// --- economy ---------------------------------------------------------------------------------------

/** Nearest harvestable forest tile within 20 tiles that is reachable even at high tide. */
function nearestForestTile(ctx: AiCtx, x: number, y: number): number | null {
  const w = ctx.world;
  const W = w.map.width;
  const home = w.nav.component('foot', Math.floor(x), Math.floor(y + 3));
  for (let r = 1; r < 20; r++) {
    let best: number | null = null;
    let bestD = Infinity;
    for (let ty = Math.floor(y) - r; ty <= Math.floor(y) + r; ty++)
      for (let tx = Math.floor(x) - r; tx <= Math.floor(x) + r; tx++) {
        if (Math.max(Math.abs(tx - Math.floor(x)), Math.abs(ty - Math.floor(y))) !== r) continue;
        if (tx < 0 || ty < 0 || tx >= W || ty >= w.map.height) continue;
        const i = ty * W + tx;
        if (w.map.terrain[i] !== T.forest || w.woodLeft[i] <= 0 || !forestEdge(w, tx, ty)) continue;
        if (w.tideHigh && home && !adjacentComponent(w, tx, ty, home)) continue;
        const d = Math.hypot(tx - x, ty - y);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    if (best !== null) return best;
  }
  return null;
}

function economy(ctx: AiCtx) {
  const w = ctx.world;
  const f = w.faction(ctx.owner)!;
  const idle = workers(w, ctx.owner).filter((u) => !u.insideOf && (u.order?.type ?? 'idle') === 'idle' && !isMoving(u));
  if (idle.length) {
    const drop = w.buildingsOf(ctx.owner).filter((b) => w.data.buildings.get(b.type)!.dropoff && (b.built ?? 1) >= 1);
    const base = nearest(drop, ctx.ai.home[0], ctx.ai.home[1]);
    if (base) {
      const farms = w.buildings().filter((b) => b.type === 'farm' && (b.built ?? 1) >= 1 && farmAccess.allowed(w, ctx.owner, b));
      const farmLoad = (b: Entity) => units(w, ctx.owner, (u) => u.order?.type === 'gather' && u.order.target === b.id).length;
      // One forest search per decision; remember "none nearby" for 30 s.
      const noneUntil = (ctx.ai.mem.noForestUntil as number) ?? -1;
      let tile: number | null = null;
      if (w.tick >= noneUntil) {
        tile = nearestForestTile(ctx, base.x, base.y);
        if (tile === null) ctx.ai.mem.noForestUntil = w.tick + 30 * w.ticksPerSecond;
      }
      for (const u of idle) {
        const wantGrain = f.resources.grain < 400;
        const farm = farms.find((b) => farmLoad(b) < 3 && distToEntity(base.x, base.y, b) < 25);
        if (wantGrain && farm) {
          issue(ctx, { type: 'gather', ids: [u.id], target: farm.id });
          continue;
        }
        if (tile !== null && resourceOf(w, null, tile)) issue(ctx, { type: 'gather', ids: [u.id], tile });
      }
    }
  }
  // Keep the worker count up.
  const target = (w.rules.ai.workerTarget as Record<string, number>)[ctx.owner] ?? 8;
  if (workers(w, ctx.owner).length < target)
    for (const b of w.buildingsOf(ctx.owner)) {
      const def = w.data.buildings.get(b.type)!;
      const wt = def.produces.find((p) => w.data.units.get(p)!.traits.includes('gatherer'));
      if (wt && !b.queue?.length && !canProduce(w, ctx.owner, b.id, wt)) {
        issue(ctx, { type: 'produce', building: b.id, unit: wt });
        break;
      }
    }
}

// --- production -----------------------------------------------------------------------------------

function produce(ctx: AiCtx) {
  const w = ctx.world;
  const goal = ctx.ai.targetArmy * difficultyOf(w, ctx.ai).armyMul;
  let enough = false;
  timed('produce.armyPop', () => (enough = armyPop(w, ctx.owner) >= goal));
  if (enough) return;
  const counts = new Map<string, number>();
  for (const u of army(w, ctx.owner, true)) counts.set(u.type, (counts.get(u.type) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
  // Most under-represented type first.
  const wanted = Object.entries(ctx.ai.composition).sort((a, b) => (counts.get(a[0]) ?? 0) / total - a[1] - ((counts.get(b[0]) ?? 0) / total - b[1]) || a[0].localeCompare(b[0]));
  for (const b of w.buildingsOf(ctx.owner)) {
    if ((b.queue?.length ?? 0) >= 2 || (b.built ?? 1) < 1) continue;
    const def = w.data.buildings.get(b.type)!;
    for (const [type] of wanted)
      if (def.produces.includes(type) && !canProduce(w, ctx.owner, b.id, type)) {
        issue(ctx, { type: 'produce', building: b.id, unit: type });
        break;
      }
  }
  // A barracks if we have none and can afford it.
  const barracks = ctx.owner === 'faction_zheng' ? 'barracks_zheng' : 'barracks_voc';
  if (!w.buildingsOf(ctx.owner).some((b) => b.type === barracks) && canAfford(w.faction(ctx.owner)!, w.data.buildings.get(barracks)!.cost))
    timed('produce.barracks', () => void ensureBuilding(ctx, barracks, ctx.ai.home, 3));
}

function research(ctx: AiCtx) {
  const w = ctx.world;
  const prefs = ctx.owner === 'faction_zheng' ? ['tech_herbal', 'tech_siege_drill', 'tech_iron_scale', 'tech_tuntian_ext'] : ['tech_drill_voc', 'tech_bastion_guns', 'tech_rationing'];
  for (const t of prefs) {
    const def = w.data.techs.get(t)!;
    const at = w.buildingsOf(ctx.owner).find((b) => b.type === def.researchedAt && !b.queue?.length);
    if (at && !canResearch(w, ctx.owner, at.id, t)) {
      issue(ctx, { type: 'research', building: at.id, tech: t });
      return;
    }
  }
}

/** Zheng sieges: keep up to 10 soldiers farming in a tuntian to feed the army. */
function tuntian(ctx: AiCtx) {
  const w = ctx.world;
  if (ctx.owner !== 'faction_zheng' || w.faction(ctx.owner)!.stage < 2) return;
  const t = ensureBuilding(ctx, 'tuntian', [ctx.ai.home[0] + 4, ctx.ai.home[1] + 4], 2);
  if (typeof t === 'string') return;
  const room = 10 - (t.garrisoned?.length ?? 0) - units(w, ctx.owner, (u) => u.order?.type === 'tuntian').length;
  if (room <= 0 || w.faction(ctx.owner)!.resources.grain > 1500) return;
  const spare = army(w, ctx.owner).filter((u) => u.type === 'shield_soldier' && (u.order?.type ?? 'idle') === 'idle' && canGarrison(w, u, t));
  if (spare.length > 20) issue(ctx, { type: 'garrison', ids: spare.slice(0, room).map((u) => u.id), target: t.id });
}

// --- defence -----------------------------------------------------------------------------------------

function threats(ctx: AiCtx): Entity[] {
  const w = ctx.world;
  const r = w.rules.ai.defendRadius;
  // Only the base around home is defended by the field army; outposts rely on their garrison.
  const [hx, hy] = ctx.ai.home;
  const mine = w
    .buildingsOf(ctx.owner)
    .filter((b) => !w.rules.ai.defendIgnore.includes(b.type) && Math.hypot(b.x - hx, b.y - hy) <= w.rules.ai.baseRadius);
  return visibleEnemies(w, ctx.owner, (e) => e.moveClass === 'foot').filter((e) => mine.some((b) => distToEntity(e.x, e.y, b) <= r));
}

function defend(ctx: AiCtx, enemies: Entity[]) {
  const w = ctx.world;
  const [ex, ey] = centroid(enemies);
  const idle = army(w, ctx.owner).filter((u) => (u.order?.type ?? 'idle') === 'idle' && !isMoving(u) && !isHero(w, u) && u.tag !== 'sortie_party');
  // Firearms take cover in bastions first.
  const bastions = w.buildingsOf(ctx.owner).filter((b) => b.type === 'bastion' && (b.garrisoned?.length ?? 0) < 6);
  for (const b of bastions) {
    const shooters = idle.filter((u) => canGarrison(w, u, b)).slice(0, 6 - (b.garrisoned?.length ?? 0));
    if (shooters.length) issue(ctx, { type: 'garrison', ids: shooters.map((u) => u.id), target: b.id });
    for (const s of shooters) idle.splice(idle.indexOf(s), 1);
  }
  if (idle.length) issue(ctx, { type: 'attack_move', ids: idle.map((u) => u.id), x: ex, y: ey });
}

/**
 * Siege armies hold their lines: units that wandered off chasing (beyond the base while calm, or
 * far beyond the fight while defending) walk back, and heroes stay home. Plan-led assault troops
 * are exempt while the assault step is running.
 */
function leash(ctx: AiCtx, defending: boolean) {
  const w = ctx.world;
  const [hx, hy] = ctx.ai.home;
  const plan = w.data.aiPlans?.get(ctx.ai.plans[ctx.ai.planIdx] ?? '');
  const step = plan?.steps[ctx.ai.stepIdx] ?? '';
  if (step.startsWith('assault')) return;
  const limit = w.rules.ai.leashRadius + (defending ? w.rules.ai.defendRadius : 0);
  // Enemy forts' gun reach (+1): no lingering there outside an assault.
  const forts = w.buildings().flatMap((b) => {
    const a = b.owner !== ctx.owner && w.isPlayable(b.owner) ? buildingAttack(w, b) : null;
    return a ? [{ b, r: a.range + (isElevated(w, b) ? w.rules.combat.elevatedRangeBonus : 0) + 1 }] : [];
  });
  const underGuns = (u: Entity) => forts.some(({ b, r }) => distToEntity(u.x, u.y, b) <= r);
  const strays = army(w, ctx.owner).filter(
    (u) =>
      !isGun(w, u) &&
      u.order?.type !== 'tuntian' &&
      u.order?.type !== 'garrison' &&
      (isHero(w, u) ? Math.hypot(u.x - hx, u.y - hy) > 6 : Math.hypot(u.x - hx, u.y - hy) > limit || underGuns(u)),
  );
  if (strays.length) issue(ctx, { type: 'move', ids: strays.map((u) => u.id), x: hx, y: hy });
}

/** Heroes stay near home (their death loses the chapter). */
function guardHeroes(ctx: AiCtx) {
  const w = ctx.world;
  const [hx, hy] = ctx.ai.home;
  // Heroes leading a plan group (e.g. 拔鬼仔's sortie) go with their men.
  const group = new Set((ctx.ai.mem.group as number[] | undefined) ?? []);
  const far = army(w, ctx.owner).filter((u) => isHero(w, u) && !group.has(u.id) && !isMoving(u) && Math.hypot(u.x - hx, u.y - hy) > 6);
  if (far.length) issue(ctx, { type: 'move', ids: far.map((u) => u.id), x: hx, y: hy });
}

/** Empty transports with nothing to do sail to a safe anchorage (data: rules.ai.anchorage). */
function stowTransports(ctx: AiCtx) {
  const w = ctx.world;
  const spot = (w.rules.ai.anchorage as unknown as Record<string, [number, number]>)[ctx.owner];
  if (!spot) return;
  const idle = units(w, ctx.owner, (u) => u.moveClass !== 'foot' && !u.cargo?.length && w.data.units.get(u.type)!.traits.some((t) => t.startsWith('transport_')) && !isMoving(u) && (u.order?.type ?? 'idle') === 'idle' && Math.hypot(u.x - spot[0], u.y - spot[1]) > 8);
  if (idle.length && (w.tick / w.ticksPerSecond) > 60) issue(ctx, { type: 'move', ids: idle.map((u) => u.id), x: spot[0], y: spot[1] });
}

// --- plan runner -------------------------------------------------------------------------------------

/** Runs background behaviours, then the current plan step. Returns true while a plan is active. */
function runPlans(ctx: AiCtx): boolean {
  const w = ctx.world;
  const ai = ctx.ai;
  for (const b of ai.background) {
    const [verb, arg = ''] = b.split(':');
    STEP_HANDLERS[verb]?.(ctx, arg);
  }
  while (ai.planIdx < ai.plans.length) {
    const plan = w.data.aiPlans?.get(ai.plans[ai.planIdx]);
    if (!plan || ai.stepIdx >= plan.steps.length) {
      ai.planIdx++;
      ai.stepIdx = 0;
      ai.stepStart = w.tick;
      ai.step = {};
      continue;
    }
    const step = plan.steps[ai.stepIdx];
    const [verb, arg = ''] = step.split(':');
    // Siege steps name their target building (e.g. trench_approach:zeelandia_castle).
    if (arg && ['trench_approach', 'surround', 'bombard', 'assault'].includes(verb) && w.data.buildings.has(arg)) ai.target = arg;
    const handler = STEP_HANDLERS[verb];
    const r = handler ? handler(ctx, arg) : 'done';
    if (r === 'running') return true;
    if (r === 'persist' && !ai.background.includes(step)) ai.background.push(step);
    ai.stepIdx++;
    ai.stepStart = w.tick;
    ai.step = {};
    w.emit({ type: 'ai_step', owner: ctx.owner, plan: plan.id, step, result: r });
  }
  return false;
}

/** Optional per-section timing for dev profiling (clock injected from outside the sim). */
export const sectionTiming: { now: (() => number) | null; log: Record<string, number> } = { now: null, log: {} };
function timed(label: string, fn: () => void) {
  if (!sectionTiming.now) return fn();
  const t = sectionTiming.now();
  fn();
  sectionTiming.log[label] = sectionTiming.now() - t;
}

export function strategic(ctx: AiCtx) {
  const w = ctx.world;
  const ai = ctx.ai;
  sectionTiming.log = {};
  timed('economy', () => economy(ctx));
  timed('research', () => research(ctx));
  if (ai.siege) timed('tuntian', () => tuntian(ctx));

  let danger: Entity[] = [];
  timed('threats', () => (danger = threats(ctx)));
  if (danger.length) {
    if (ai.state !== 'DEFEND') setState(ctx, 'DEFEND');
    ai.calmSince = w.tick;
    timed('defend', () => defend(ctx, danger));
  } else if (ai.state === 'DEFEND' && w.tick - ai.calmSince > w.rules.ai.defendCalmSeconds * w.ticksPerSecond) setState(ctx, ai.prevState === 'DEFEND' ? 'BUILDUP' : ai.prevState);

  let planActive = false;
  timed('plans', () => (planActive = runPlans(ctx)));
  timed('leash', () => (ai.siege ? leash(ctx, ai.state === 'DEFEND') : guardHeroes(ctx)));
  timed('stow', () => stowTransports(ctx));
  timed('produce', () => produce(ctx));
  if (planActive || ai.state === 'DEFEND') return;

  // Free play state machine once plans are exhausted.
  const pop = armyPop(w, ctx.owner);
  const goal = ai.targetArmy * difficultyOf(w, ai).armyMul;
  switch (ai.state) {
    case 'ECONOMY':
      if (pop >= goal * w.rules.ai.economyReadyFraction) setState(ctx, 'BUILDUP');
      break;
    case 'BUILDUP':
      if (pop < goal * w.rules.ai.economyReadyFraction) setState(ctx, 'ECONOMY');
      else if (pop >= goal) {
        if (ai.siege) setState(ctx, 'SIEGE');
        else if (!ai.defensive) {
          ai.armyAtAttack = pop;
          setState(ctx, 'ATTACK');
        }
      }
      break;
    case 'ATTACK': {
      if (pop < ai.armyAtAttack * (1 - w.rules.ai.regroupLossFraction)) {
        setState(ctx, 'REGROUP');
        break;
      }
      const t = targetBuilding(w, ai) ?? nearest(w.buildings().filter((b) => b.owner !== ctx.owner && w.isPlayable(b.owner) && b.type !== 'trench'), ai.home[0], ai.home[1]);
      if (!t || t.owner === ctx.owner) {
        setState(ctx, 'BUILDUP');
        break;
      }
      const idle = army(w, ctx.owner).filter((u) => !isMoving(u) && u.attackTarget === undefined && !isHero(w, u));
      if (idle.length) issue(ctx, { type: 'attack_move', ids: idle.map((u) => u.id), x: t.x, y: t.y });
      break;
    }
    case 'REGROUP': {
      const away = army(w, ctx.owner).filter((u) => Math.hypot(u.x - ai.home[0], u.y - ai.home[1]) > 8 && !isMoving(u));
      if (away.length) issue(ctx, { type: 'move', ids: away.map((u) => u.id), x: ai.home[0], y: ai.home[1] });
      if (pop >= goal * w.rules.ai.regroupReadyFraction) {
        ai.armyAtAttack = pop;
        setState(ctx, 'ATTACK');
      }
      break;
    }
    case 'SIEGE': {
      // Guns keep bombarding whatever fort is in reach; infantry stays home.
      const forts = w.buildings().filter((b) => b.owner !== ctx.owner && w.isPlayable(b.owner) && w.data.buildings.get(b.type)!.attack);
      for (const g of units(w, ctx.owner, (u) => isGun(w, u) && u.order?.type !== 'attack')) {
        const t = nearest(forts, g.x, g.y);
        if (t) issue(ctx, { type: 'attack', ids: [g.id], target: t.id });
      }
      break;
    }
  }
}
