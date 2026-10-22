// Village and settler diplomacy (spec §3.3, §3.4, §4.9) and the Middag northern event (§3.3).
import { registerCommand } from '../commands';
import { regionContains, findRegion } from '../map';
import type { PartyState } from '../state';
import { canAfford, pay } from '../stats';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { deathHooks, relations } from './combat';
import { dailyHooks, farmAccess } from './economy';
import { moveUnitTo, speedModifiers } from './movement';
import { effectHandlers } from './production';
import { captureHooks } from './siege';

const ZHENG = 'faction_zheng';
const VOC = 'faction_voc';
const PLAYABLE = [ZHENG, VOC];
export const SETTLERS = 'settlers';

export type DiploAction = 'gift_grain' | 'gift_deerskin' | 'pacify' | 'request_warriors' | 'raid' | 'requisition';

// --- parties ---------------------------------------------------------------------------------------

export function villageDef(world: World, id: string) {
  return world.data.factions.villages.find((v) => v.id === id);
}

/** Creates party state (and village/settler populations) the first time it is needed. */
export function ensureParties(world: World): Record<string, PartyState> {
  const ext = world.ext;
  if (ext.flags.partiesReady) return ext.parties;
  ext.flags.partiesReady = true;
  const mk = (id: string, owner: Owner, favor: Record<Owner, number>): PartyState => ({
    id,
    owner,
    favor: { ...favor },
    ally: null,
    hostile: [],
    log: [],
    cooldowns: {},
    throttle: {},
    invaded: {},
    lent: [],
    raiders: [],
    raidUntil: 0,
  });
  for (const v of world.data.factions.villages) {
    const center = world.buildings().find((b) => b.type === 'village_center' && b.village === v.id);
    if (!center) continue;
    ext.parties[v.id] = mk(v.id, `village_${v.id}`, v.favor);
    // The village's own people: warriors at home and hunters on the deer grounds.
    const n = v.warriors ?? 4;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      world.spawnUnit('village_warrior', `village_${v.id}`, center.x + Math.cos(a) * 2.6, center.y + Math.sin(a) * 2.6);
    }
    const herds = [...world.all()].filter((e) => e.type === 'deer_herd' && e.village === v.id);
    for (let i = 0; i < world.rules.diplomacy.huntersPerVillage; i++) {
      const h = world.spawnUnit('village_hunter', `village_${v.id}`, center.x + 2.5, center.y + 2.5 + i);
      if (herds.length >= 2) h.order = { type: 'patrol', ax: herds[0].x, ay: herds[0].y, bx: herds[1].x, by: herds[1].y, toB: true };
    }
  }
  const s = world.data.factions.settlers;
  const mill = world.buildings().find((b) => b.type === 'sugar_mill' && b.owner === 'faction_settlers');
  if (mill) {
    ext.parties[SETTLERS] = mk(SETTLERS, 'faction_settlers', s.favor ?? world.rules.settlers.startFavor);
    const farms = world.buildings().filter((b) => b.type === 'farm' && b.owner === 'faction_settlers');
    for (let i = 0; i < Math.min(world.rules.settlers.farmers, farms.length); i++) {
      const f = farms[i];
      const u = world.spawnUnit('settler', 'faction_settlers', f.x, f.y);
      u.order = { type: 'gather', resource: 'grain', target: f.id, phase: 'to_resource' };
    }
  }
  return ext.parties;
}

export function partyOfOwner(world: World, owner: Owner): PartyState | undefined {
  return Object.values(world.ext.parties).find((p) => p.owner === owner);
}

/** The party an entity belongs to (village centre/units, settler buildings/units). */
export function partyOfEntity(world: World, e: Entity): PartyState | undefined {
  return partyOfOwner(world, e.owner);
}

function center(world: World, p: PartyState): Entity | undefined {
  if (p.id === SETTLERS) return world.buildings().find((b) => b.type === 'sugar_mill' && b.owner === 'faction_settlers');
  return world.buildings().find((b) => b.type === 'village_center' && b.village === p.id);
}

/** Whether (x, y) is inside a party's land: 8 tiles around a village centre, or the Saccam region. */
export function inTerritory(world: World, p: PartyState, x: number, y: number): boolean {
  if (p.id === SETTLERS) return regionContains(findRegion(world.map, 'saccam'), Math.floor(x), Math.floor(y));
  const c = center(world, p);
  if (!c) return false;
  return Math.hypot(x - c.x, y - c.y) <= world.rules.diplomacy.territoryRadius;
}

export function partyAt(world: World, x: number, y: number): PartyState | undefined {
  for (const id of Object.keys(world.ext.parties).sort()) {
    const p = world.ext.parties[id];
    if (p.id !== SETTLERS && inTerritory(world, p, x, y)) return p;
  }
  return undefined;
}

// --- favour and state ---------------------------------------------------------------------------

export function changeFavor(world: World, p: PartyState, faction: Owner, delta: number, reason: string) {
  const d = world.rules.diplomacy;
  const before = p.favor[faction] ?? 50;
  const after = Math.max(d.favorMin, Math.min(d.favorMax, before + delta));
  if (after === before && reason === 'drift') return;
  p.favor[faction] = after;
  p.log.unshift({ faction, delta: after - before, reason, tick: world.tick });
  p.log.length = Math.min(p.log.length, 12);
  world.emit({ type: 'favor', party: p.id, faction, delta: after - before, value: after, reason });
  evaluate(world, p);
}

function other(f: Owner) {
  return f === ZHENG ? VOC : ZHENG;
}

/** Join (≥80 and ≥20 ahead), leave (<40), hostile (<20) — spec §3.3. */
export function evaluate(world: World, p: PartyState) {
  const d = world.rules.diplomacy;
  for (const f of PLAYABLE) {
    const v = p.favor[f] ?? 50;
    const hostile = v < d.hostileBelow;
    if (hostile && !p.hostile.includes(f)) {
      p.hostile.push(f);
      world.emit({ type: 'party_hostile', party: p.id, faction: f });
    } else if (!hostile && p.hostile.includes(f)) {
      p.hostile = p.hostile.filter((x) => x !== f);
      world.emit({ type: 'party_neutral', party: p.id, faction: f });
    }
  }
  if (p.ally && (p.favor[p.ally] ?? 0) < d.leaveBelow) leave(world, p);
  if (!p.ally)
    for (const f of PLAYABLE) {
      const v = p.favor[f] ?? 0;
      if (v >= d.joinAt && v >= (p.favor[other(f)] ?? 0) + d.joinMargin) {
        join(world, p, f);
        break;
      }
    }
}

function homeWarriors(world: World, p: PartyState): Entity[] {
  return [...world.all()].filter((e) => e.kind === 'unit' && e.owner === p.owner && e.type === 'village_warrior' && !p.raiders.includes(e.id));
}

/** Hands up to `n` of the village's warriors to its ally. */
export function lendWarriors(world: World, p: PartyState, n: number): number {
  if (!p.ally) return 0;
  const ws = homeWarriors(world, p).slice(0, n);
  for (const w of ws) {
    w.owner = p.ally;
    w.order = { type: 'idle' };
    w.attackTarget = undefined;
    p.lent.push(w.id);
  }
  if (ws.length) world.emit({ type: 'warriors_lent', party: p.id, faction: p.ally, n: ws.length });
  return ws.length;
}

function join(world: World, p: PartyState, f: Owner) {
  p.ally = f;
  p.invaded[f] = 0;
  world.emit({ type: 'party_joined', party: p.id, faction: f });
  const bonus = villageDef(world, p.id)?.allianceBonus as { type: string; count?: number } | undefined;
  if (bonus?.type === 'warriors') lendWarriors(world, p, bonus.count ?? 0);
}

function leave(world: World, p: PartyState) {
  const f = p.ally!;
  p.ally = null;
  world.emit({ type: 'party_left', party: p.id, faction: f });
  const c = center(world, p);
  for (const id of p.lent) {
    const w = world.get(id);
    if (!w) continue;
    w.owner = p.owner;
    w.order = { type: 'idle' };
    w.insideOf = null;
    if (c) moveUnitTo(world, w, c.x + 2, c.y + 2);
  }
  p.lent = [];
}

// --- hooks into other systems --------------------------------------------------------------------

relations.hook = (world, a, b) => {
  const pa = partyOfOwner(world, a);
  const pb = partyOfOwner(world, b);
  if (!pa && !pb) return undefined;
  if (pa && pb) return false;
  const p = (pa ?? pb)!;
  const f = pa ? b : a;
  if (!world.isPlayable(f)) return false;
  if (p.ally === f) return false;
  return p.hostile.includes(f) || (p.invaded[f] ?? 0) > world.tick;
};

farmAccess.allowed = (world, owner, farm) =>
  farm.owner === owner || (farm.owner === 'faction_settlers' && world.ext.parties[SETTLERS]?.ally === owner);

effectHandlers.favor_all = (world, owner, e) => {
  if (e.type !== 'favor_all') return;
  for (const p of Object.values(ensureParties(world))) if (p.id !== SETTLERS) changeFavor(world, p, owner, e.value, 'tech');
};

captureHooks.push((world, b, _from, to) => {
  const s = world.ext.parties[SETTLERS];
  if (b.type === 'provintia_fort' && s) changeFavor(world, s, to, world.rules.settlers.provintiaCapturedBonus, 'capture');
});

// 目加溜灣社: allied units move 20% faster inside its land.
speedModifiers.push((world, e) => {
  const p = world.ext.parties.bakloan;
  if (!p || p.ally !== e.owner) return 1;
  const bonus = villageDef(world, 'bakloan')?.allianceBonus as { type: string; mul?: number } | undefined;
  return bonus?.type === 'territory_speed' && inTerritory(world, p, e.x, e.y) ? (bonus.mul ?? 1) : 1;
});

deathHooks.push((world, dead, killer) => {
  // 保護其免受攻擊: killing an invader on a party's land earns its gratitude.
  if (!killer || !world.isPlayable(killer.owner) || dead.kind !== 'unit') return;
  for (const p of Object.values(world.ext.parties)) {
    if ((p.invaded[dead.owner] ?? 0) <= world.tick || !inTerritory(world, p, dead.x, dead.y)) continue;
    if (dead.owner === killer.owner) continue;
    if (throttled(world, p, `protect:${killer.owner}`, world.rules.diplomacy.protectThrottleSeconds)) continue;
    changeFavor(world, p, killer.owner, world.rules.diplomacy.events.protect, 'protect');
  }
});

function throttled(world: World, p: PartyState, key: string, seconds: number): boolean {
  const last = p.throttle[key];
  if (last !== undefined && world.tick - last < seconds * world.ticksPerSecond) return true;
  p.throttle[key] = world.tick;
  return false;
}

dailyHooks.push((world) => {
  const d = world.rules.diplomacy;
  for (const id of Object.keys(world.ext.parties).sort()) {
    const p = world.ext.parties[id];
    // Drift towards 50.
    for (const f of PLAYABLE) {
      const v = p.favor[f] ?? 50;
      if (v !== d.driftTarget) changeFavor(world, p, f, Math.sign(d.driftTarget - v) * Math.min(d.driftPerDay, Math.abs(d.driftTarget - v)), 'drift');
    }
    if (!p.ally) continue;
    const fs = world.faction(p.ally);
    if (!fs) continue;
    const bonus = villageDef(world, p.id)?.allianceBonus as { type: string; amount?: number } | undefined;
    if (bonus?.type === 'daily_deerskin') fs.resources.deerskin += bonus.amount ?? 0;
    if (p.id === SETTLERS)
      for (const b of world.buildings())
        if (b.owner === 'faction_settlers' && b.type === 'sugar_mill') fs.resources.grain += (world.data.buildings.get('sugar_mill') as { dailyIncome?: { grain: number } }).dailyIncome?.grain ?? 0;
  }
  // Northern settlers sent past the Middag lands farm for their faction.
  for (const [f, n] of Object.entries(world.ext.tatu.northern)) {
    const fs = world.faction(f);
    if (fs) fs.resources.grain += n * world.rules.tatu.grainPerDayEach;
  }
});

// --- commands ---------------------------------------------------------------------------------------

export type DiploError = 'party' | 'unit' | 'cooldown' | 'cost' | 'faction' | 'not_ally' | 'none_left' | 'used';

function hasEnvoy(world: World, p: PartyState, owner: Owner): boolean {
  for (const e of world.all()) if (e.kind === 'unit' && e.owner === owner && !e.insideOf && inTerritory(world, p, e.x, e.y)) return true;
  return false;
}

export function cooldownLeft(world: World, p: PartyState, action: DiploAction, owner: Owner): number {
  return Math.max(0, (p.cooldowns[`${action}:${owner}`] ?? 0) - world.tick);
}

export function diploCost(world: World, action: DiploAction) {
  const d = world.rules.diplomacy;
  const zero = { grain: 0, wood: 0, powder: 0, deerskin: 0 };
  if (action === 'gift_grain') return { ...zero, grain: d.gift.grain };
  if (action === 'gift_deerskin') return { ...zero, deerskin: d.gift.deerskin };
  if (action === 'pacify') return { ...zero, grain: d.pacify.grain, deerskin: d.pacify.deerskin };
  return zero;
}

export function canDiplo(world: World, owner: Owner, partyId: string, action: DiploAction): DiploError | null {
  const p = world.ext.parties[partyId];
  const f = world.faction(owner);
  if (!p || !f) return 'party';
  if (action === 'pacify' && owner !== ZHENG) return 'faction';
  if (action === 'requisition' && (owner !== VOC || partyId !== SETTLERS)) return 'faction';
  if (action === 'requisition' && (world.ext.flags.requisitionUsed || world.chapter !== 1)) return 'used';
  if (action === 'raid' && partyId === SETTLERS) return 'faction';
  if (action === 'request_warriors') {
    if (p.ally !== owner) return 'not_ally';
    if (!homeWarriors(world, p).length) return 'none_left';
  }
  if (!hasEnvoy(world, p, owner)) return 'unit';
  if (cooldownLeft(world, p, action, owner) > 0) return 'cooldown';
  if (!canAfford(f, diploCost(world, action))) return 'cost';
  return null;
}

registerCommand('diplomacy', (world, cmd) => {
  ensureParties(world);
  if (canDiplo(world, cmd.owner, cmd.party, cmd.action)) return;
  const d = world.rules.diplomacy;
  const p = world.ext.parties[cmd.party];
  const f = world.faction(cmd.owner)!;
  const hz = world.ticksPerSecond;
  pay(f, diploCost(world, cmd.action));
  const setCd = (seconds: number) => (p.cooldowns[`${cmd.action}:${cmd.owner}`] = world.tick + Math.round(seconds * hz));
  switch (cmd.action) {
    case 'gift_grain':
    case 'gift_deerskin':
      // The cooldown is per village, shared by both kinds of gift.
      p.cooldowns[`gift_grain:${cmd.owner}`] = p.cooldowns[`gift_deerskin:${cmd.owner}`] = world.tick + d.gift.cooldown * hz;
      changeFavor(world, p, cmd.owner, d.gift.favor + ((d.giftBonus as Record<string, number>)[cmd.owner] ?? 0), 'gift');
      break;
    case 'pacify': {
      setCd(d.pacify.cooldown);
      const mul = villageDef(world, p.id)?.pacifyMul ?? 1;
      changeFavor(world, p, cmd.owner, d.pacify.favor * mul, 'pacify');
      break;
    }
    case 'request_warriors':
      setCd(d.requestWarriors.cooldownDays * world.rules.sim.ticksPerDay / hz);
      lendWarriors(world, p, d.requestWarriors.count);
      break;
    case 'raid':
      setCd(d.raid.cooldownDays * world.rules.sim.ticksPerDay / hz);
      f.resources.grain += d.raid.grain;
      changeFavor(world, p, cmd.owner, d.events.raidGranary, 'raid');
      p.invaded[cmd.owner] = world.tick + d.invadedResponseSeconds * hz;
      break;
    case 'requisition':
      world.ext.flags.requisitionUsed = true;
      f.resources.grain += world.rules.settlers.requisition.grain;
      changeFavor(world, p, cmd.owner, world.rules.settlers.requisition.favor, 'requisition');
      world.emit({ type: 'requisition', owner: cmd.owner, grain: world.rules.settlers.requisition.grain });
      break;
  }
});

// --- per-tick: combat on party land, the Middag event ----------------------------------------------

function onShot(world: World, ev: { from: number; to: number; x: number; y: number }) {
  const shooter = world.entities.get(ev.from);
  const target = world.entities.get(ev.to);
  if (!shooter || !world.isPlayable(shooter.owner)) return;
  const F = shooter.owner;
  const d = world.rules.diplomacy;
  const hz = world.ticksPerSecond;
  for (const p of Object.values(world.ext.parties)) {
    const targetIsParty = target && target.owner === p.owner;
    const onLand = inTerritory(world, p, ev.x, ev.y) || (target ? inTerritory(world, p, target.x, target.y) : false);
    if (!onLand && !targetIsParty) continue;
    if (p.ally === F && !targetIsParty) continue; // allies defending the land are welcome
    if (target?.type === 'village_center' && targetIsParty) {
      if (!throttled(world, p, `center:${F}`, d.attackCenterThrottleSeconds)) changeFavor(world, p, F, d.events.attackVillageCenter, 'attack_center');
    } else if (!throttled(world, p, `fight:${F}`, d.fightThrottleSeconds)) changeFavor(world, p, F, d.events.fightInTerritory, 'fight');
    if (p.id !== SETTLERS && p.ally !== F) p.invaded[F] = world.tick + d.invadedResponseSeconds * hz;
  }
}

function tatuTick(world: World) {
  const t = world.ext.tatu;
  const cfg = world.rules.tatu;
  if (!t.enabled) return;
  const region = world.map.regions.find((r) => r.id === cfg.region);
  if (!region) return;
  for (const u of world.all()) {
    if (u.kind !== 'unit' || u.owner !== ZHENG || u.moveClass !== 'foot' || u.insideOf) continue;
    const def = world.data.units.get(u.type)!;
    if (def.traits.includes('hero') || def.traits.includes('gatherer')) continue;
    if (!regionContains(region, Math.floor(u.x), Math.floor(u.y))) continue;
    // The soldier marches off the map to farm in the north.
    t.batch++;
    t.lastEnter = world.tick;
    world.remove(u.id);
  }
  if (t.batch > 0 && world.tick - t.lastEnter >= cfg.batchGapSeconds * world.ticksPerSecond) {
    const n = t.batch;
    t.batch = 0;
    if (n > cfg.minSoldiers && world.rng.chance(cfg.chance)) world.emit({ type: 'tatu_ambush', owner: ZHENG, n });
    else {
      t.northern[ZHENG] = (t.northern[ZHENG] ?? 0) + n;
      world.emit({ type: 'tatu_safe', owner: ZHENG, n });
    }
  }
}

export function diplomacySystem(world: World) {
  ensureParties(world);
  for (const ev of world.events) if (ev.type === 'shot') onShot(world, ev as unknown as { from: number; to: number; x: number; y: number });
  // Lent warriors that died are forgotten.
  for (const p of Object.values(world.ext.parties)) {
    p.lent = p.lent.filter((id) => world.get(id));
    p.raiders = p.raiders.filter((id) => world.get(id));
  }
  tatuTick(world);
}
