// Declarative scenario triggers (spec §7.1): `when` conditions → `do` actions.
import { findRegion, objectCenter, regionContains } from '../map';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { armyPop } from '../ai/common';
import { enableAi } from '../ai';
import { killEntity } from '../systems/combat';
import { changeFavor, ensureParties } from '../systems/diplomacy';
import { fogOf } from '../systems/fog';
import { changeCastleMorale } from '../systems/morale';
import { scheduleTyphoon } from '../systems/weather';
import { moveGroup } from '../systems/movement';
import { spawnFleet, spawnGroup, spawnRelief } from './setup';
import type { FleetSpec, UnitSpec } from './types';

export type Rating = 'victory' | 'historical' | 'defeat';

export type Condition =
  | { type: 'time_elapsed'; seconds: number }
  | { type: 'game_day'; day: number }
  | { type: 'unit_hp_below'; unitTag: string; ratio: number }
  | { type: 'unit_dead'; unitTag: string; atLeast?: number }
  | { type: 'building_captured'; building: string; by?: Owner }
  | { type: 'area_entered'; region: string; owner: Owner; pop?: number; unitTag?: string }
  | { type: 'favor_reached'; party: string; faction: Owner; value: number; below?: boolean }
  | { type: 'tide_state'; phase: string }
  | { type: 'resource_below'; owner: Owner; resource: string; value: number }
  | { type: 'all_of'; conditions: Condition[] }
  | { type: 'any_of'; conditions: Condition[] }
  | { type: 'not'; condition: Condition }
  | { type: 'castle_morale_below'; value: number }
  | { type: 'army_pop_below'; owner: Owner; pop: number }
  | { type: 'losses_since'; owner: Owner; pop: number; mark: string }
  | { type: 'units_lost'; owner: Owner; unitType: string; count: number }
  | { type: 'building_hp_below'; building: string; ratio: number }
  | { type: 'flag'; name: string; value?: number | boolean | string }
  | { type: 'timer_expired'; id: string }
  | { type: 'stranded_in_range'; unitTag: string; seconds: number; enemy: Owner }
  | { type: 'outcome'; faction: Owner; rating?: Rating }
  | { type: 'is_ai'; faction: Owner }
  | { type: 'building_dead'; building: string }
  | { type: 'building_built'; building: string; owner: Owner; region?: string }
  | { type: 'held_for'; id: string; seconds: number; condition: Condition };

export type Action =
  | { type: 'show_message'; textKey: string; kind?: 'info' | 'warn' | 'good'; to?: Owner; params?: Record<string, string | number> }
  | { type: 'show_cutscene'; id: string }
  | { type: 'spawn_units'; units?: UnitSpec[]; fleet?: FleetSpec; relief?: boolean }
  | { type: 'kill_unit'; unitTag: string; effect?: string }
  | { type: 'set_objective'; id: string; faction: Owner; textKey: string; primary?: boolean }
  | { type: 'complete_objective'; id: string; faction: Owner; failed?: boolean }
  | { type: 'fail_mission'; faction: Owner; reasonKey: string; keepOpen?: boolean }
  | { type: 'win_mission'; faction: Owner; rating?: Rating; reasonKey: string; keepOpen?: boolean }
  | { type: 'modify_morale'; faction: Owner; delta: number; reason?: string }
  | { type: 'modify_favor'; party: string; faction: Owner; delta: number }
  | { type: 'set_stage'; faction: Owner; stage: number }
  | { type: 'start_timer'; id: string; seconds: number }
  | { type: 'trigger_weather'; weather: 'typhoon'; inSeconds?: number }
  | { type: 'reveal_area'; region?: string; around?: string; radius?: number; faction: Owner }
  | { type: 'set_ai_plan'; faction: Owner; plans: string[] }
  | { type: 'set_flag'; name: string; value: number | boolean | string }
  | { type: 'mark_army'; owner: Owner; mark: string }
  | { type: 'move_units'; unitTag: string; region: string };

export interface Trigger {
  id: string;
  when: Condition;
  once?: boolean;
  /** Only for one side (e.g. tutorial hints for the player of that faction). */
  for?: Owner;
  do: Action[];
}

export interface Objective {
  id: string;
  faction: Owner;
  textKey: string;
  primary: boolean;
  status: 'active' | 'done' | 'failed';
}

// --- helpers -------------------------------------------------------------------------------------

function tagged(world: World, tag: string): Entity[] {
  return [...world.all()].filter((e) => e.tag === tag);
}

function flags(world: World) {
  return world.ext.flags;
}

export function objectives(world: World): Objective[] {
  return (world.ext.flags.objectives ? JSON.parse(world.ext.flags.objectives as string) : []) as Objective[];
}
function saveObjectives(world: World, list: Objective[]) {
  world.ext.flags.objectives = JSON.stringify(list);
}

export function outcomeOf(world: World, faction: Owner): Rating | undefined {
  return world.ext.flags[`outcome:${faction}`] as Rating | undefined;
}

/**
 * Records a side's result and ends the chapter, deriving the other side's result unless it is
 * already decided. `keepOpen` records only this side (used when a second action sets the other).
 */
export function setOutcome(world: World, faction: Owner, rating: Rating, reasonKey: string, keepOpen = false) {
  if (outcomeOf(world, faction)) return;
  world.ext.flags[`outcome:${faction}`] = rating;
  world.ext.flags[`outcomeReason:${faction}`] = reasonKey;
  world.emit({ type: 'mission_outcome', faction, rating, reasonKey });
  if (keepOpen) return;
  const other = world.enemyOf(faction);
  if (!outcomeOf(world, other)) {
    // A side that loses the way history went earns "historical" rather than "defeat".
    const historicalLoser = world.scenario?.historicalLoser as Owner | undefined;
    const r: Rating = rating === 'defeat' ? 'victory' : other === historicalLoser ? 'historical' : 'defeat';
    world.ext.flags[`outcome:${other}`] = r;
    world.ext.flags[`outcomeReason:${other}`] = reasonKey;
    world.emit({ type: 'mission_outcome', faction: other, rating: r, reasonKey });
  }
  world.ext.flags.missionOver = true;
}

/** Pop of units of a type lost so far, per owner (from death events). */
function lostCount(world: World, owner: Owner, type: string): number {
  return Number(world.ext.flags[`lost:${owner}:${type}`] ?? 0);
}

/**
 * Population of an owner's units standing in a region (each unit counts at least 1). Civilians
 * (族人) only count when asked for by tag.
 */
export function regionPop(world: World, region: string, owner: Owner, unitTag?: string): number {
  const r = findRegion(world.map, region);
  let pop = 0;
  for (const e of world.all()) {
    if (e.kind !== 'unit' || e.owner !== owner || e.insideOf || (unitTag && e.tag !== unitTag)) continue;
    if (!regionContains(r, Math.floor(e.x), Math.floor(e.y))) continue;
    const def = world.data.units.get(e.type)!;
    if (!unitTag && def.traits.includes('civilian')) continue;
    pop += Math.max(1, def.pop);
  }
  return pop;
}

// --- conditions ---------------------------------------------------------------------------------

export function evaluate(world: World, c: Condition): boolean {
  const s = world.tick / world.ticksPerSecond;
  switch (c.type) {
    case 'time_elapsed':
      return s >= c.seconds;
    case 'game_day':
      return world.day >= c.day;
    case 'unit_hp_below':
      return tagged(world, c.unitTag).some((e) => e.hp < e.maxHp * c.ratio);
    case 'unit_dead': {
      const alive = tagged(world, c.unitTag).length;
      const spawned = Number(flags(world)[`spawned:${c.unitTag}`] ?? 0);
      return spawned > 0 && spawned - alive >= (c.atLeast ?? spawned);
    }
    case 'building_captured':
      return world.buildings().some((b) => (b.type === c.building || b.tag === c.building) && (c.by ? b.owner === c.by : b.owner !== world.ext.flags[`origOwner:${b.id}`]));
    case 'area_entered':
      return regionPop(world, c.region, c.owner, c.unitTag) >= (c.pop ?? 1);
    case 'favor_reached': {
      const v = ensureParties(world)[c.party]?.favor[c.faction] ?? 0;
      return c.below ? v < c.value : v >= c.value;
    }
    case 'tide_state':
      return world.tidePhaseId === c.phase;
    case 'resource_below':
      return ((world.faction(c.owner)?.resources as Record<string, number> | undefined)?.[c.resource] ?? 0) < c.value;
    case 'all_of':
      return c.conditions.every((x) => evaluate(world, x));
    case 'any_of':
      return c.conditions.some((x) => evaluate(world, x));
    case 'not':
      return !evaluate(world, c.condition);
    case 'castle_morale_below':
      return (world.faction('faction_voc')?.castleMorale ?? 100) < c.value;
    case 'army_pop_below':
      return armyPop(world, c.owner) < c.pop;
    case 'losses_since': {
      const m = flags(world)[`mark:${c.owner}:${c.mark}`];
      return typeof m === 'number' && m - armyPop(world, c.owner) > c.pop;
    }
    case 'units_lost':
      return lostCount(world, c.owner, c.unitType) >= c.count;
    case 'building_hp_below':
      return world.buildings().some((b) => (b.type === c.building || b.tag === c.building) && b.hp < b.maxHp * c.ratio);
    case 'flag':
      return c.value === undefined ? !!flags(world)[c.name] : flags(world)[c.name] === c.value;
    case 'timer_expired': {
      const end = flags(world)[`timer:${c.id}`];
      return typeof end === 'number' && world.tick >= end;
    }
    case 'stranded_in_range': {
      const key = `stranded:${c.unitTag}`;
      const ship = tagged(world, c.unitTag)[0];
      const exposed =
        !!ship?.stranded &&
        [...world.all()].some((e) => e.kind === 'unit' && e.owner === c.enemy && !e.insideOf && Math.hypot(e.x - ship.x, e.y - ship.y) <= world.data.units.get(e.type)!.range + 2);
      if (!exposed) {
        delete flags(world)[key];
        return false;
      }
      if (flags(world)[key] === undefined) flags(world)[key] = world.tick;
      return world.tick - (flags(world)[key] as number) >= c.seconds * world.ticksPerSecond;
    }
    case 'held_for': {
      // True once the inner condition has held without a break for `seconds`.
      const key = `heldSince:${c.id}`;
      if (!evaluate(world, c.condition)) {
        delete flags(world)[key];
        return false;
      }
      if (typeof flags(world)[key] !== 'number') flags(world)[key] = world.tick;
      return world.tick - (flags(world)[key] as number) >= c.seconds * world.ticksPerSecond;
    }
    case 'outcome':
      return c.rating ? outcomeOf(world, c.faction) === c.rating : !!outcomeOf(world, c.faction);
    case 'is_ai':
      return !!world.ext.ai[c.faction];
    case 'building_dead': {
      const existed = Number(flags(world)[`spawnedB:${c.building}`] ?? 0);
      return existed > 0 && !world.buildings().some((b) => b.tag === c.building || b.type === c.building);
    }
    case 'building_built': {
      const r = c.region ? findRegion(world.map, c.region) : null;
      return world.buildings().some((b) => b.type === c.building && b.owner === c.owner && (b.built ?? 1) >= 1 && (!r || regionContains(r, Math.floor(b.x), Math.floor(b.y))));
    }
  }
}

// --- actions ------------------------------------------------------------------------------------------

export function act(world: World, a: Action) {
  const hz = world.ticksPerSecond;
  switch (a.type) {
    case 'show_message':
      world.emit({ type: 'message', textKey: a.textKey, kind: a.kind ?? 'info', to: a.to, params: a.params });
      break;
    case 'show_cutscene':
      world.emit({ type: 'cutscene', id: a.id });
      break;
    case 'spawn_units':
      if (a.relief && world.scenario) noteSpawn(world, spawnRelief(world, world.scenario));
      for (const u of a.units ?? []) noteSpawn(world, spawnGroup(world, u));
      if (a.fleet) noteSpawn(world, spawnFleet(world, a.fleet));
      break;
    case 'kill_unit':
      for (const e of tagged(world, a.unitTag)) {
        if (a.effect) world.emit({ type: 'explosion', x: e.x, y: e.y, size: a.effect === 'explosion_large' ? 'large' : 'small' });
        killEntity(world, e);
      }
      break;
    case 'set_objective': {
      const list = objectives(world).filter((o) => !(o.id === a.id && o.faction === a.faction));
      list.push({ id: a.id, faction: a.faction, textKey: a.textKey, primary: a.primary ?? true, status: 'active' });
      saveObjectives(world, list);
      world.emit({ type: 'objective', id: a.id, faction: a.faction, status: 'active' });
      break;
    }
    case 'complete_objective': {
      const list = objectives(world);
      const o = list.find((x) => x.id === a.id && x.faction === a.faction);
      if (o && o.status === 'active') {
        o.status = a.failed ? 'failed' : 'done';
        saveObjectives(world, list);
        world.emit({ type: 'objective', id: a.id, faction: a.faction, status: o.status });
      }
      break;
    }
    case 'fail_mission':
      setOutcome(world, a.faction, 'defeat', a.reasonKey, a.keepOpen);
      break;
    case 'win_mission':
      setOutcome(world, a.faction, a.rating ?? 'victory', a.reasonKey, a.keepOpen);
      break;
    case 'modify_morale':
      changeCastleMorale(world, a.faction, a.delta, a.reason ?? 'scenario');
      break;
    case 'modify_favor': {
      const p = ensureParties(world)[a.party];
      if (p) changeFavor(world, p, a.faction, a.delta, 'scenario');
      break;
    }
    case 'set_stage': {
      const f = world.faction(a.faction);
      if (f) f.stage = a.stage;
      break;
    }
    case 'start_timer':
      world.ext.flags[`timer:${a.id}`] = world.tick + a.seconds * hz;
      break;
    case 'trigger_weather':
      scheduleTyphoon(world, world.tick + (a.inSeconds ?? 30) * hz);
      break;
    case 'reveal_area': {
      const fog = fogOf(world, a.faction);
      if (!fog) break;
      const W = world.map.width;
      if (a.region) {
        const r = findRegion(world.map, a.region);
        for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) fog.explored[y * W + x] = 1;
      }
      if (a.around) {
        const b = world.buildings().find((x) => x.type === a.around || x.tag === a.around);
        const R = a.radius ?? 12;
        if (b)
          for (let y = Math.max(0, Math.floor(b.y - R)); y < Math.min(world.map.height, b.y + R); y++)
            for (let x = Math.max(0, Math.floor(b.x - R)); x < Math.min(W, b.x + R); x++) if (Math.hypot(x - b.x, y - b.y) <= R) fog.explored[y * W + x] = 1;
      }
      break;
    }
    case 'set_ai_plan': {
      const ai = world.ext.ai[a.faction];
      if (ai) {
        ai.plans = [...a.plans];
        ai.planIdx = 0;
        ai.stepIdx = 0;
        ai.stepStart = world.tick;
        ai.step = {};
      } else if (world.scenario?.ai?.[a.faction] && world.ext.flags.player !== a.faction) {
        enableAi(world, a.faction, { ...world.scenario.ai[a.faction], plans: a.plans });
      }
      break;
    }
    case 'move_units': {
      const list = tagged(world, a.unitTag);
      if (!list.length) break;
      const [x, y] = objectCenter(findRegion(world.map, a.region));
      // Applied directly (not as a command) so replays of a save do not issue it twice.
      for (const u of list) u.order = { type: 'move', x, y };
      moveGroup(world, list, x, y);
      break;
    }
    case 'set_flag':
      world.ext.flags[a.name] = a.value;
      break;
    case 'mark_army':
      world.ext.flags[`mark:${a.owner}:${a.mark}`] = armyPop(world, a.owner);
      break;
  }
}

function noteSpawn(world: World, es: Entity[]) {
  for (const e of es) if (e.tag) world.ext.flags[`spawned:${e.tag}`] = Number(world.ext.flags[`spawned:${e.tag}`] ?? 0) + 1;
}

/** Records how many tagged units exist at scenario start, and each building's original owner. */
export function initTriggers(world: World) {
  for (const e of world.all()) {
    if (e.kind === 'unit' && e.tag) world.ext.flags[`spawned:${e.tag}`] = Number(world.ext.flags[`spawned:${e.tag}`] ?? 0) + 1;
    if (e.kind === 'building') {
      world.ext.flags[`origOwner:${e.id}`] = e.owner;
      for (const k of [e.tag, e.type]) if (k) world.ext.flags[`spawnedB:${k}`] = Number(world.ext.flags[`spawnedB:${k}`] ?? 0) + 1;
    }
  }
}

/** Counts unit losses by owner and type (for `units_lost`). */
export function noteDeath(world: World, ev: { owner: Owner; unitType: string; kind: string }) {
  if (ev.kind !== 'unit') return;
  const k = `lost:${ev.owner}:${ev.unitType}`;
  world.ext.flags[k] = Number(world.ext.flags[k] ?? 0) + 1;
}

export function runTriggers(world: World, triggers: Trigger[]) {
  const player = world.ext.flags.player as Owner | undefined;
  for (const t of triggers) {
    const key = `fired:${t.id}`;
    if (t.once !== false && world.ext.flags[key]) continue;
    if (t.for && player && t.for !== player) continue;
    if (!evaluate(world, t.when)) continue;
    world.ext.flags[key] = true;
    for (const a of t.do) act(world, a);
  }
}
