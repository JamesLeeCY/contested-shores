// Applies a scenario's starting state to a fresh world.
import type { Entity } from '../types';
import type { World } from '../world';
import { formationSlots } from '../systems/movement';
import { applyTech } from '../systems/production';
import { ensureParties, evaluate } from '../systems/diplomacy';
import { loadInto } from '../systems/transport';
import type { CampaignState, FleetSpec, Scenario, UnitSpec } from './types';
import { initTriggers } from './triggers';

export function spawnGroup(world: World, spec: UnitSpec, at?: [number, number]): Entity[] {
  const p = at ?? spec.at;
  if (!p) throw new Error(`scenario: no position for ${spec.type}`);
  const cls = world.moveClassOf(spec.type);
  const slots = formationSlots(world, cls, p[0], p[1], spec.count);
  // Heroes are tagged with their type so triggers can follow them (e.g. 鄭成功 陣亡).
  const hero = world.data.units.get(spec.type)!.traits.includes('hero');
  return slots.map(([x, y]) => {
    const u = world.spawnUnit(spec.type, spec.owner, x, y, spec.tag ?? (hero ? spec.type : undefined));
    if (spec.hp !== undefined) u.hp = Math.max(1, Math.round(u.maxHp * spec.hp));
    return u;
  });
}

/** Ships in formation with their cargo loaded in order, filling each ship before the next. */
export function spawnFleet(world: World, fleet: FleetSpec, at?: [number, number]): Entity[] {
  const ships = spawnGroup(world, { type: fleet.ship, owner: fleet.owner, count: fleet.count, tag: fleet.tag }, at ?? fleet.at);
  let i = 0;
  for (const c of fleet.cargo)
    for (let k = 0; k < c.count; k++) {
      const hero = world.data.units.get(c.type)!.traits.includes('hero');
      const u = world.spawnUnit(c.type, c.owner, ships[0].x, ships[0].y, c.tag ?? (hero ? c.type : undefined));
      while (i < ships.length && !loadInto(world, ships[i], u)) i++;
      if (i >= ships.length) {
        world.remove(u.id);
        break;
      }
    }
  return ships;
}

export function applyScenario(world: World, sc: Scenario, campaign: CampaignState = {}) {
  world.chapter = sc.chapter;
  world.scenario = sc;
  for (const [path, value] of Object.entries(sc.rules ?? {})) {
    const keys = path.split('.');
    let o = world.rules as unknown as Record<string, unknown>;
    for (const k of keys.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>;
    o[keys[keys.length - 1]] = value;
  }
  world.ext.flags.scenario = sc.id;
  // The map object is shared between worlds: replace the list, never push into it.
  if (sc.regions?.length) world.map.regions = [...world.map.regions, ...sc.regions];
  for (const [owner, stage] of Object.entries(sc.stage)) {
    const f = world.faction(owner);
    if (f) f.stage = stage;
  }
  for (const [owner, res] of Object.entries(sc.resources)) {
    const f = world.faction(owner);
    if (f) Object.assign(f.resources, { grain: 0, wood: 0, powder: 0, deerskin: 0, ...res });
  }
  const voc = world.faction('faction_voc');
  if (voc) {
    let m = sc.castleMorale === 'carry' ? (campaign.castleMorale ?? world.rules.morale.castle.start) : sc.castleMorale;
    if (sc.castleMoraleMin !== undefined) m = Math.max(sc.castleMoraleMin, m);
    voc.castleMorale = m;
  }
  for (const o of sc.ownership ?? []) for (const b of world.buildings()) if (b.type === o.type) b.owner = o.owner;
  for (const b of sc.buildings ?? []) {
    if (b.line) {
      const [[x0, y0], [x1, y1]] = b.line;
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        if (!world.occupancy[y * world.map.width + x]) world.spawnBuilding(b.type, b.owner, x, y, b.built ?? 1, b.tag);
      }
    } else if (b.at) world.spawnBuilding(b.type, b.owner, b.at[0], b.at[1], b.built ?? 1, b.tag);
  }
  for (const u of sc.units ?? []) spawnGroup(world, u);
  for (const c of sc.carry ?? [])
    if (c.if.reasons.includes(campaign.reasons?.[c.if.scenario]?.[c.if.faction] ?? '')) for (const u of c.units) spawnGroup(world, u);
  for (const f of sc.fleets ?? []) spawnFleet(world, f);
  for (const g of sc.garrisons ?? []) {
    const host = world.buildings().find((b) => b.type === g.in);
    if (!host) continue;
    for (let i = 0; i < g.count; i++) {
      const u = world.spawnUnit(g.type, g.owner, host.x, host.y, g.tag);
      u.insideOf = host.id;
      host.garrisoned!.push(u.id);
    }
  }
  for (const [owner, techs] of Object.entries(sc.techs ?? {})) for (const t of techs) applyTech(world, owner, t);
  ensureParties(world);
  // Favour carries over between chapters.
  for (const [id, favor] of Object.entries(campaign.favor ?? {})) {
    const p = world.ext.parties[id];
    if (p) Object.assign(p.favor, favor);
  }
  for (const id of Object.keys(world.ext.parties).sort()) evaluate(world, world.ext.parties[id]);
  world.ext.flags.timerTicks = sc.timerMinutes * 60 * world.ticksPerSecond;
  if (sc.wind) world.ext.wind = { from: sc.wind.from, strength: sc.wind.strength };
  initTriggers(world);
}

/** Spawns the scenario's relief fleet (chapter 3). */
export function spawnRelief(world: World, sc: Scenario): Entity[] {
  const r = sc.relief;
  if (!r) return [];
  const out: Entity[] = [];
  let y = r.at[1] - 2;
  for (const s of r.ships) out.push(...spawnGroup(world, s, [r.at[0], (y += 1.5)]));
  out.push(...spawnFleet(world, { ...r.fleet, owner: r.owner, cargo: r.fleet.cargo }, [r.at[0] + 4, r.at[1]]));
  world.emit({ type: 'relief_arrived', owner: r.owner, n: out.length });
  return out;
}
