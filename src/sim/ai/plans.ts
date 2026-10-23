// Scenario plans (spec §8.2): each plan in data/ai_plans.json is a list of "verb:arg" steps.
// A step handler returns 'done' (advance), 'running' (call again next decision), or 'persist'
// (advance, and keep calling it every decision as a background behaviour).
import { distToEntity, distToRect } from '../geometry';
import { onBattery } from '../systems/combat';
import { checkPlacement } from '../systems/build';
import { detectedMines, isVisibleTo } from '../systems/fog';
import { mineOrigin } from '../systems/siege';
import { capacityOf, cargoPop } from '../systems/transport';
import { buildingAttack } from '../stats';
import type { Entity } from '../types';
import { isMoving } from '../systems/movement';
import { isElevated } from '../systems/combat';
import {
  army,
  centroid,
  inRegion,
  isGun,
  isHero,
  issue,
  landingPoint,
  nearest,
  regionCenter,
  secondsSince,
  ships,
  targetBuilding,
  units,
  visibleEnemies,
  workers,
  type AiCtx,
} from './common';

export type StepResult = 'done' | 'running' | 'persist';
type Handler = (ctx: AiCtx, arg: string) => StepResult;

const mem = (ctx: AiCtx) => ctx.ai.step as Record<string, unknown>;
const ids = (es: Entity[]) => es.map((e) => e.id);
const alive = (ctx: AiCtx, list: number[]) => list.map((id) => ctx.world.get(id)).filter((e): e is Entity => !!e);
const elapsed = (ctx: AiCtx) => secondsSince(ctx.world, ctx.ai.stepStart);

const planMem = (ctx: AiCtx) => ctx.ai.mem;
const savePlanMem = (_ctx: AiCtx, _data: Record<string, unknown>) => {};

// --- fleet movement ---------------------------------------------------------------------------------

function fleetPoint(ctx: AiCtx, where: string): [number, number] {
  const w = ctx.world;
  if (where === 'heliao') {
    const [x, y] = regionCenter(w, 'heliao');
    return landingPoint(w, 'small_craft', x, y) ?? [x - 2, y];
  }
  return regionCenter(w, where);
}

function loadedFleet(ctx: AiCtx): Entity[] {
  const own = ships(ctx.world, ctx.owner);
  const loaded = own.filter((s) => s.cargo?.length || s.tag === 'armada');
  return loaded.length ? loaded : own.filter((s) => capacityOf(ctx.world, s) > 0);
}

const move_fleet: Handler = (ctx, arg) => {
  const m = mem(ctx);
  const fleet = loadedFleet(ctx);
  if (!fleet.length) return 'done';
  const [x, y] = fleetPoint(ctx, arg);
  if (!m.issued || (elapsed(ctx) % 10 < 1 && fleet.some((s) => !isMoving(s) && Math.hypot(s.x - x, s.y - y) > 6))) {
    issue(ctx, { type: 'move', ids: ids(fleet.filter((s) => !s.stranded)), x, y });
    m.issued = true;
  }
  const near = fleet.filter((s) => Math.hypot(s.x - x, s.y - y) < 7).length;
  return near >= fleet.length * 0.75 || elapsed(ctx) > 150 ? 'done' : 'running';
};

const unload: Handler = (ctx) => {
  const fleet = ships(ctx.world, ctx.owner).filter((s) => s.cargo?.length);
  if (!fleet.length || elapsed(ctx) > 90) return 'done';
  for (const s of fleet) {
    if (isMoving(s)) continue;
    const p = landingPoint(ctx.world, s.moveClass as 'small_craft' | 'ship', s.x, s.y);
    issue(ctx, { type: 'unload', ids: [s.id], ...(p && Math.hypot(p[0] - s.x, p[1] - s.y) > 1.5 ? { x: p[0], y: p[1] } : {}) });
  }
  return 'running';
};

// --- construction ---------------------------------------------------------------------------------------

/** Spiral search for a valid site for `type` near (x, y). */
export function findSite(ctx: AiCtx, type: string, x: number, y: number, maxR = 14): [number, number] | null {
  const size = ctx.world.data.buildings.get(type)!.size;
  const cx = Math.floor(x - size / 2);
  const cy = Math.floor(y - size / 2);
  for (let r = 0; r <= maxR; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!checkPlacement(ctx.world, ctx.owner, type, cx + dx, cy + dy)) return [cx + dx, cy + dy];
      }
  return null;
}

function builders(ctx: AiCtx, n: number, near: [number, number]): Entity[] {
  const ws = workers(ctx.world, ctx.owner).filter((u) => !u.insideOf);
  ws.sort((a, b) => Math.hypot(a.x - near[0], a.y - near[1]) - Math.hypot(b.x - near[0], b.y - near[1]) || a.id - b.id);
  return ws.slice(0, n);
}

/** Ensures one building of `type` exists near `at`; returns it once complete. */
export function ensureBuilding(ctx: AiCtx, type: string, at: [number, number], nBuilders = 5): Entity | 'pending' | 'failed' {
  const w = ctx.world;
  const own = w.buildingsOf(ctx.owner).filter((b) => b.type === type);
  const done = own.find((b) => (b.built ?? 1) >= 1);
  if (done) return done;
  const site = own.find((b) => (b.built ?? 1) < 1);
  if (site) {
    const busy = units(w, ctx.owner, (u) => u.order?.type === 'build' && u.order.target === site.id).length;
    if (busy < Math.min(3, nBuilders)) issue(ctx, { type: 'build', ids: ids(builders(ctx, nBuilders, [site.x, site.y])), target: site.id });
    return 'pending';
  }
  const failKey = `sitefail:${type}`;
  if (w.tick < ((ctx.ai.mem[failKey] as number) ?? -1)) return 'failed';
  const spot = findSite(ctx, type, at[0], at[1]);
  if (!spot) {
    ctx.ai.mem[failKey] = w.tick + 60 * w.ticksPerSecond;
    return 'failed';
  }
  const bs = builders(ctx, nBuilders, at);
  if (!bs.length) return 'failed';
  issue(ctx, { type: 'place', building: type, tx: spot[0], ty: spot[1], builders: ids(bs) });
  return 'pending';
}

const build: Handler = (ctx, arg) => {
  if (arg === 'battery') return buildBatteries(ctx);
  const r = ensureBuilding(ctx, arg, ctx.ai.home);
  return r === 'pending' && elapsed(ctx) < 180 ? 'running' : 'done';
};

// --- ferrying (sortie) -----------------------------------------------------------------------------------

function sortieGroup(ctx: AiCtx): Entity[] {
  const tagged = units(ctx.world, ctx.owner, (u) => u.moveClass === 'foot' && (u.tag === 'sortie' || u.tag === 'pedel'));
  return tagged.length ? tagged : army(ctx.world, ctx.owner).filter((u) => !isGun(ctx.world, u));
}

const embark: Handler = (ctx, arg) => {
  const pm = planMem(ctx);
  if (!pm.group) {
    pm.group = ids(sortieGroup(ctx));
    pm.boats = ids(ships(ctx.world, ctx.owner).filter((s) => s.type === arg && capacityOf(ctx.world, s) > 0));
    savePlanMem(ctx, pm);
  }
  return 'done';
};

/** Ferries the plan group across to `region` with the plan boats, as many trips as needed. */
const move: Handler = (ctx, region) => {
  const w = ctx.world;
  const pm = planMem(ctx);
  const group = alive(ctx, (pm.group as number[]) ?? []);
  const boats = alive(ctx, (pm.boats as number[]) ?? []);
  const [tx, ty] = regionCenter(w, region);
  const across = (u: Entity) => !u.insideOf && inRegion(w, region, u);
  if (!group.length || group.every(across) || elapsed(ctx) > 400) return 'done';
  if (!boats.length) return 'done';
  const drop = landingPoint(w, 'small_craft', tx + 6, ty + 5) ?? [tx, ty + 6];
  const ashore = group.filter((u) => !u.insideOf && !across(u));
  const src = centroid(ashore.length ? ashore : group);
  const pick = landingPoint(w, 'small_craft', src[0], src[1]) ?? src;
  const state = (pm.ferry as Record<string, string>) ?? {};
  const assigned = new Set<number>();
  for (const b of boats) {
    const s = state[b.id] ?? 'load';
    const cap = capacityOf(w, b);
    if (s === 'load') {
      const room = cap - cargoPop(w, b);
      const waiting = ashore.filter((u) => u.order?.type !== 'embark' && !assigned.has(u.id));
      if (room > 0 && waiting.length && Math.hypot(b.x - pick[0], b.y - pick[1]) > 3 && !isMoving(b)) issue(ctx, { type: 'move', ids: [b.id], x: pick[0], y: pick[1] });
      if (room > 0 && waiting.length) {
        const batch = waiting.slice(0, room);
        for (const u of batch) assigned.add(u.id);
        issue(ctx, { type: 'embark', ids: ids(batch), target: b.id });
      }
      const boarding = ashore.some((u) => u.order?.type === 'embark' && u.order.target === b.id);
      if ((room <= 0 || (!waiting.length && !boarding)) && b.cargo?.length) {
        issue(ctx, { type: 'unload', ids: [b.id], x: drop[0], y: drop[1] });
        state[b.id] = 'sail';
      }
    } else if (s === 'sail') {
      if (!b.cargo?.length) {
        state[b.id] = 'load';
        issue(ctx, { type: 'move', ids: [b.id], x: pick[0], y: pick[1] });
      } else if (!isMoving(b) && b.order?.type !== 'unload') issue(ctx, { type: 'unload', ids: [b.id], x: drop[0], y: drop[1] });
    }
  }
  pm.ferry = state;
  savePlanMem(ctx, pm);
  return 'running';
};

const form_line: Handler = (ctx) => {
  const pm = planMem(ctx);
  const group = alive(ctx, (pm.group as number[]) ?? []).filter((u) => !u.insideOf);
  if (!group.length) return 'done';
  const m = mem(ctx);
  if (!m.issued) {
    const enemies = visibleEnemies(ctx.world, ctx.owner, (e) => e.moveClass === 'foot');
    const [cx, cy] = centroid(group);
    const [ex, ey] = enemies.length ? centroid(enemies) : [cx + 8, cy];
    const d = Math.hypot(ex - cx, ey - cy) || 1;
    issue(ctx, { type: 'move', ids: ids(group), x: cx + ((ex - cx) / d) * 3, y: cy + ((ey - cy) / d) * 3 });
    m.issued = true;
  }
  return elapsed(ctx) > 12 ? 'done' : 'running';
};

const advance: Handler = (ctx) => {
  const pm = planMem(ctx);
  const group = alive(ctx, (pm.group as number[]) ?? army(ctx.world, ctx.owner).map((u) => u.id)).filter((u) => !u.insideOf);
  if (!group.length) return 'persist';
  const [cx, cy] = centroid(group);
  const enemies = visibleEnemies(ctx.world, ctx.owner, (e) => e.moveClass === 'foot');
  const t = nearest(enemies, cx, cy);
  const goal: [number, number] = t ? [t.x, t.y] : [cx + 6, cy];
  if (group.some((u) => !isMoving(u) && u.attackTarget === undefined)) issue(ctx, { type: 'attack_move', ids: ids(group), x: goal[0], y: goal[1] });
  return 'persist';
};

// --- naval -------------------------------------------------------------------------------------------------

function warships(ctx: AiCtx): Entity[] {
  return ships(ctx.world, ctx.owner).filter((s) => {
    const d = ctx.world.data.units.get(s.type)!;
    return d.atk > 0 && !d.traits.includes('non_combat') && !d.traits.includes('suicide') && !s.cargo?.length && !(s.tag ?? '').includes('boats');
  });
}

const patrol: Handler = (ctx, region) => {
  const r = regionCenter(ctx.world, region);
  for (const s of warships(ctx)) {
    if (s.order?.type === 'patrol' || s.attackTarget !== undefined || isMoving(s)) continue;
    issue(ctx, { type: 'move', ids: [s.id], x: r[0] - 18, y: r[1] });
    issue(ctx, { type: 'patrol', ids: [s.id], x: r[0] + 14, y: r[1] });
  }
  return 'persist';
};

const intercept: Handler = (ctx) => {
  const enemyShips = visibleEnemies(ctx.world, ctx.owner, (e) => e.moveClass !== 'foot');
  for (const s of warships(ctx)) {
    if (s.order?.type === 'attack') continue;
    const t = nearest(enemyShips, s.x, s.y);
    if (t && Math.hypot(t.x - s.x, t.y - s.y) < 14) issue(ctx, { type: 'attack', ids: [s.id], target: t.id });
  }
  return 'persist';
};

const hide: Handler = (ctx) => {
  const fs = units(ctx.world, ctx.owner, (u) => ctx.world.data.units.get(u.type)!.traits.includes('suicide'));
  if (!fs.length) return 'done';
  const m = mem(ctx);
  if (!m.issued) {
    const [hx, hy] = ctx.world.rules.ai.fireShipHide;
    issue(ctx, { type: 'move', ids: ids(fs), x: hx, y: hy });
    m.issued = true;
  }
  return fs.every((f) => !isMoving(f)) || elapsed(ctx) > 60 ? 'done' : 'running';
};

const strike_when: Handler = (ctx) => {
  const fs = units(ctx.world, ctx.owner, (u) => ctx.world.data.units.get(u.type)!.traits.includes('suicide'));
  const targets = visibleEnemies(ctx.world, ctx.owner, (e) => e.moveClass !== 'foot');
  for (const f of fs) {
    if (f.order?.type === 'attack') continue;
    const r = ctx.world.rules.ai.fireShipStrikeRadius;
    const stranded = targets.filter((t) => t.stranded && Math.hypot(t.x - f.x, t.y - f.y) < r * 2);
    const close = targets.filter((t) => Math.hypot(t.x - f.x, t.y - f.y) < r);
    const t = nearest(stranded.length ? stranded : close, f.x, f.y);
    if (t) issue(ctx, { type: 'attack', ids: [f.id], target: t.id });
    else if (!isMoving(f)) {
      // The plan knows the fleet is out there: close in until it comes into view.
      const known = units(ctx.world, ctx.owner === 'faction_zheng' ? 'faction_voc' : 'faction_zheng', (e) => e.moveClass !== 'foot');
      const k = nearest(known.filter((e) => Math.hypot(e.x - f.x, e.y - f.y) < r), f.x, f.y);
      if (k) issue(ctx, { type: 'move', ids: [f.id], x: k.x, y: k.y });
    }
  }
  return 'persist';
};

const suppress: Handler = (ctx) => {
  const w = ctx.world;
  const guns = visibleEnemies(w, ctx.owner, (e) => isGun(w, e) && onBattery(w, e));
  const bats = w.buildings().filter((b) => b.type === 'battery' && b.owner !== ctx.owner && world_isEnemy(ctx, b));
  const targets = guns.length ? guns : bats;
  if (!targets.length || elapsed(ctx) > 150) return 'done';
  for (const s of warships(ctx)) {
    if (s.order?.type === 'attack' || isMoving(s)) continue;
    const t = nearest(targets, s.x, s.y);
    if (!t) continue;
    if (isVisibleTo(w, ctx.owner, t)) issue(ctx, { type: 'attack', ids: [s.id], target: t.id });
    else {
      // Not yet spotted: sail along the channel towards it until it comes into view.
      const p = landingPoint(w, s.moveClass as 'ship' | 'small_craft', t.x, t.y);
      if (p) issue(ctx, { type: 'attack_move', ids: [s.id], x: p[0], y: p[1] });
    }
  }
  return 'running';
};

function world_isEnemy(ctx: AiCtx, e: Entity) {
  return ctx.world.isPlayable(e.owner) && e.owner !== ctx.owner;
}

const land: Handler = (ctx, region) => {
  const w = ctx.world;
  const boats = ships(w, ctx.owner).filter((s) => s.cargo?.length);
  if (!boats.length) return 'done';
  const castle = w.buildings().find((b) => b.type === 'zeelandia_castle');
  const [x, y] = castle && region === 'tayouan' ? [castle.x - 6, castle.y - 4] : regionCenter(w, region);
  const p = landingPoint(w, 'small_craft', x, y) ?? [x, y];
  for (const b of boats) if (b.order?.type !== 'unload' || !isMoving(b)) issue(ctx, { type: 'unload', ids: [b.id], x: p[0], y: p[1] });
  return elapsed(ctx) > 240 ? 'done' : 'running';
};

// --- sieges ---------------------------------------------------------------------------------------------------

function fortRange(ctx: AiCtx, t: Entity): number {
  const a = buildingAttack(ctx.world, t);
  return a ? a.range + (isElevated(ctx.world, t) ? ctx.world.rules.combat.elevatedRangeBonus : 0) : 0;
}

function gunsOf(ctx: AiCtx): Entity[] {
  return units(ctx.world, ctx.owner, (u) => isGun(ctx.world, u));
}

/** Edge distance from the fort at which our guns on batteries outrange its guns. */
function standoff(ctx: AiCtx, t: Entity): number | null {
  const guns = gunsOf(ctx);
  if (!guns.length) return null;
  const gr = Math.min(...guns.map((g) => ctx.world.data.units.get(g.type)!.range)) + ctx.world.rules.siege.battery.rangeBonus;
  const fr = fortRange(ctx, t);
  if (gr <= fr + 0.4) return null;
  // Battery centre halfway between the two ranges (+ the gun radius); guns then pick the tiles
  // that fall inside the window (see gunTiles).
  return (fr + gr) / 2 + 0.3;
}

/** 2×2 battery sites at the standoff distance, on the side facing home. */
function batterySites(ctx: AiCtx, t: Entity, d: number, n: number): [number, number][] {
  const w = ctx.world;
  const [hx, hy] = ctx.ai.home;
  const out: [number, number][] = [];
  const cands: [number, number, number][] = [];
  const R = Math.ceil(d) + 3;
  for (let y = t.ty! - R; y <= t.ty! + t.h! + R; y++)
    for (let x = t.tx! - R; x <= t.tx! + t.w! + R; x++) {
      // Distance from the battery centre (x+1, y+1) to the fort edge.
      const e = distToRect(x + 1, y + 1, t.tx!, t.ty!, t.w!, t.h!);
      if (Math.abs(e - d) > 0.45) continue;
      if (checkPlacement(w, ctx.owner, 'battery', x, y, true)) continue;
      cands.push([x, y, Math.hypot(x + 1 - hx, y + 1 - hy)]);
    }
  cands.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
  for (const c of cands) {
    if (out.length >= n) break;
    if (out.some(([ox, oy]) => Math.abs(ox - c[0]) < 3 && Math.abs(oy - c[1]) < 3)) continue;
    out.push([c[0], c[1]]);
  }
  return out;
}

/** The two battery tiles whose centres sit best inside (fort range, gun range]. */
function gunTiles(ctx: AiCtx, b: Entity, t: Entity): [number, number][] {
  const guns = gunsOf(ctx);
  const gr = Math.min(...guns.map((g) => ctx.world.data.units.get(g.type)!.range)) + ctx.world.rules.siege.battery.rangeBonus;
  const fr = fortRange(ctx, t);
  const ideal = (fr + gr) / 2 + 0.3;
  const tiles: [number, number][] = [];
  for (let y = b.ty!; y < b.ty! + b.h!; y++) for (let x = b.tx!; x < b.tx! + b.w!; x++) tiles.push([x + 0.5, y + 0.5]);
  const err = ([x, y]: [number, number]) => Math.abs(distToRect(x, y, t.tx!, t.ty!, t.w!, t.h!) - ideal);
  return tiles.sort((a, c) => err(a) - err(c) || a[1] - c[1] || a[0] - c[0]).slice(0, 2);
}

function buildBatteries(ctx: AiCtx): StepResult {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai);
  const guns = gunsOf(ctx);
  if (!t || !guns.length) return 'done';
  const d = standoff(ctx, t);
  const m = mem(ctx);
  if (d === null || elapsed(ctx) > 200) {
    // Cannot outrange (or gave up): guns go to their own maximum range.
    for (const g of guns) if (!isMoving(g) && g.order?.type !== 'attack') issue(ctx, { type: 'attack', ids: [g.id], target: t.id });
    return 'done';
  }
  const need = Math.ceil(guns.length / 2);
  let mine = w.buildingsOf(ctx.owner).filter((b) => b.type === 'battery' && Math.abs(distToRect(b.x, b.y, t.tx!, t.ty!, t.w!, t.h!) - d) < 1.2);
  if (mine.length < need && !m.placed) {
    const sites = batterySites(ctx, t, d, need - mine.length);
    for (const [x, y] of sites) issue(ctx, { type: 'place', building: 'battery', tx: x, ty: y, builders: ids(builders(ctx, 3, [x, y])) });
    m.placed = true;
    return 'running';
  }
  mine = mine.slice(0, need);
  for (const b of mine)
    if ((b.built ?? 1) < 1 && !units(w, ctx.owner, (u) => u.order?.type === 'build' && u.order.target === b.id).length)
      issue(ctx, { type: 'build', ids: ids(builders(ctx, 3, [b.x, b.y])), target: b.id });
  if (mine.length < need && elapsed(ctx) > 20) m.placed = false;
  const ready = mine.filter((b) => (b.built ?? 1) >= 1);
  // Two guns per completed battery, on the tiles best placed between the two ranges.
  let gi = 0;
  for (const b of ready)
    for (const [px, py] of gunTiles(ctx, b, t)) {
      const g = guns[gi++];
      if (!g) break;
      if (Math.floor(g.x) === Math.floor(px) && Math.floor(g.y) === Math.floor(py)) continue;
      if (!isMoving(g)) issue(ctx, { type: 'move', ids: [g.id], x: px, y: py });
    }
  return guns.every((g) => onBattery(w, g)) ? 'done' : 'running';
}

const surround: Handler = (ctx) => {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai);
  if (!t) return 'done';
  // Infantry waits just outside the fort's guns, on the home side.
  const m = mem(ctx);
  if (!m.staged) {
    const [hx, hy] = ctx.ai.home;
    const r = fortRange(ctx, t) + 3 + t.w! / 2;
    const d = Math.hypot(hx - t.x, hy - t.y) || 1;
    const inf = army(w, ctx.owner).filter((u) => !isGun(w, u) && !isHero(w, u));
    issue(ctx, { type: 'move', ids: ids(inf), x: t.x + ((hx - t.x) / d) * r, y: t.y + ((hy - t.y) / d) * r });
    m.staged = true;
  }
  return buildBatteries(ctx);
};

const bombard: Handler = (ctx, arg) => {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai);
  if (!t || t.owner === ctx.owner) return 'done';
  const guns = gunsOf(ctx);
  for (const g of guns) if (g.order?.type !== 'attack' && !isMoving(g)) issue(ctx, { type: 'attack', ids: [g.id], target: t.id });
  const limit = arg && Number.isFinite(Number(arg)) ? Number(arg) : 600;
  const breach = t.hp <= t.maxHp * w.rules.capture.ejectBelowHpFraction;
  return elapsed(ctx) >= limit || breach || !guns.length ? 'done' : 'running';
};

const assault: Handler = (ctx, arg) => {
  const w = ctx.world;
  if (arg && ctx.ai.target !== arg) ctx.ai.target = arg;
  const t = targetBuilding(w, ctx.ai);
  if (!t || t.owner === ctx.owner) return 'done';
  const inf = army(w, ctx.owner).filter((u) => !isGun(w, u) && !isHero(w, u));
  for (const g of gunsOf(ctx)) if (g.order?.type !== 'attack') issue(ctx, { type: 'attack', ids: [g.id], target: t.id });
  // An unbreached fort cannot be taken: keep the infantry out of its guns until it is.
  if (t.hp > t.maxHp * w.rules.capture.maxHpFraction) return 'running';
  const idle = inf.filter((u) => !isMoving(u) && (u.attackTarget === undefined || u.attackTarget === t.id));
  // Clear defenders who block the capture (within reach of the walls), then hold the near side
  // of the fort until it falls. Do not chase troops back towards the main castle.
  const blockRadius = w.rules.capture.defenderRadius + 1;
  const defenders = visibleEnemies(w, ctx.owner, (e) => distToEntity(e.x, e.y, t) <= blockRadius);
  const d = nearest(defenders, t.x, t.y);
  const [hx, hy] = ctx.ai.home;
  const len = Math.hypot(hx - t.x, hy - t.y) || 1;
  // Stand as far out as still counts for the capture (attackers within capture.attackerRadius).
  const out = t.w! / 2 + Math.max(1, w.rules.capture.attackerRadius - 0.7);
  const gate: [number, number] = [t.x + ((hx - t.x) / len) * out, t.y + ((hy - t.y) / len) * out];
  if (idle.length) issue(ctx, { type: 'attack_move', ids: ids(idle), x: d ? d.x : gate[0], y: d ? d.y : gate[1] });
  for (const g of gunsOf(ctx)) if (g.order?.type !== 'attack') issue(ctx, { type: 'attack', ids: [g.id], target: t.id });
  return 'running';
};

const trench_approach: Handler = (ctx) => {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai);
  if (!t) return 'done';
  const d = standoff(ctx, t) ?? 10;
  const trenches = w.buildingsOf(ctx.owner).filter((b) => b.type === 'trench');
  const head = nearest(trenches, t.x, t.y);
  const headD = head ? distToEntity(head.x, head.y, t) : Infinity;
  if (headD <= d + 1.5 || elapsed(ctx) > 300) return 'done';
  const pending = trenches.find((b) => (b.built ?? 1) < 1);
  if (pending) {
    if (!units(w, ctx.owner, (u) => u.order?.type === 'build' && u.order.target === pending.id).length)
      issue(ctx, { type: 'build', ids: ids(builders(ctx, 4, [pending.x, pending.y])), target: pending.id });
    return 'running';
  }
  const from: [number, number] = head ? [head.x, head.y] : ctx.ai.home;
  const len = Math.hypot(t.x - from[0], t.y - from[1]) || 1;
  const nx = Math.floor(from[0] + ((t.x - from[0]) / len) * 1.2);
  const ny = Math.floor(from[1] + ((t.y - from[1]) / len) * 1.2);
  if (checkPlacement(w, ctx.owner, 'trench', nx, ny)) return 'done';
  issue(ctx, { type: 'place', building: 'trench', tx: nx, ty: ny, builders: ids(builders(ctx, 4, [nx, ny])) });
  return 'running';
};

// --- defence --------------------------------------------------------------------------------------------------

const hold: Handler = (ctx) => {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai);
  if (!t || t.owner !== ctx.owner) return 'persist';
  const cap = (w.data.buildings.get(t.type)!.garrison ?? 0) - (t.garrisoned?.length ?? 0);
  const muskets = army(w, ctx.owner).filter((u) => w.data.units.get(u.type)!.atkType === 'musket' && !isHero(w, u) && u.order?.type !== 'garrison');
  if (cap > 0 && muskets.length) issue(ctx, { type: 'garrison', ids: ids(nearestN(muskets, t, cap)), target: t.id });
  // Others stand guard within 6 tiles.
  const guard = army(w, ctx.owner).filter((u) => !isHero(w, u) && u.order?.type === 'idle' && !isMoving(u) && distToEntity(u.x, u.y, t) > 7 && u.tag !== 'sortie_party');
  if (guard.length) issue(ctx, { type: 'attack_move', ids: ids(guard.slice(0, 12)), x: t.x + 3, y: t.y - 4 });
  return 'persist';
};

function nearestN(list: Entity[], t: Entity, n: number) {
  return [...list].sort((a, b) => distToEntity(a.x, a.y, t) - distToEntity(b.x, b.y, t) || a.id - b.id).slice(0, n);
}

const sortie: Handler = (ctx) => {
  const w = ctx.world;
  const t = targetBuilding(w, ctx.ai) ?? w.buildingsOf(ctx.owner).find((b) => b.type === 'zeelandia_castle');
  if (!t) return 'persist';
  const enemyGuns = visibleEnemies(w, ctx.owner, (e) => isGun(w, e) && distToEntity(e.x, e.y, t) < 18);
  const party = units(w, ctx.owner, (u) => u.tag === 'sortie_party');
  const pm = planMem(ctx);
  const cool = (pm.sortieCooldown as number) ?? 0;
  if (!party.length && enemyGuns.length && w.tick >= cool) {
    const pool = army(w, ctx.owner).filter((u) => !isHero(w, u) && !isGun(w, u) && ['pikeman', 'grenadier', 'musketeer_voc'].includes(u.type));
    const picked = nearestN(pool, enemyGuns[0], 8);
    if (picked.length >= 4) {
      for (const p of picked) p.tag = 'sortie_party';
      issue(ctx, { type: 'attack', ids: ids(picked), target: enemyGuns[0].id });
      pm.sortieSize = picked.length;
    }
  } else if (party.length) {
    const target = nearest(enemyGuns, centroid(party)[0], centroid(party)[1]);
    const losing = party.length < ((pm.sortieSize as number) ?? 8) / 2;
    if (!target || losing) {
      for (const p of party) p.tag = undefined;
      issue(ctx, { type: 'move', ids: ids(party), x: t.x, y: t.y - 4 });
      pm.sortieCooldown = w.tick + 60 * w.ticksPerSecond;
    } else if (party.some((p) => p.order?.type !== 'attack')) issue(ctx, { type: 'attack', ids: ids(party), target: target.id });
  }
  savePlanMem(ctx, pm);
  return 'persist';
};

const counter_mine: Handler = (ctx) => {
  const w = ctx.world;
  const f = w.faction(ctx.owner)!;
  const castle = w.buildingsOf(ctx.owner).find((b) => w.data.buildings.get(b.type)!.researches.includes('tech_counter_mine'));
  if (castle && !f.techs.includes('tech_counter_mine') && !castle.queue?.some((q) => q.id === 'tech_counter_mine'))
    issue(ctx, { type: 'research', building: castle.id, tech: 'tech_counter_mine' });
  const mines = w.buildings().filter((b) => b.type === 'mine' && b.owner !== ctx.owner && isMineDetected(ctx, b));
  if (mines.length) {
    const pool = army(w, ctx.owner).filter((u) => !isHero(w, u) && u.order?.type !== 'attack').slice(0, 4);
    if (pool.length) issue(ctx, { type: 'attack', ids: ids(pool), target: mines[0].id });
  }
  return 'persist';
};

function isMineDetected(ctx: AiCtx, b: Entity) {
  return !!detectedMines.get(ctx.world)?.get(ctx.owner)?.has(b.id);
}

/**
 * Sends the field army against enemy foot soldiers in a region whenever they can be reached on
 * foot (e.g. across the lagoon at low tide). Plans know where the enemy landed even if unseen.
 */
const strike: Handler = (ctx, region) => {
  const w = ctx.world;
  const foes = units(w, ctx.owner === 'faction_zheng' ? 'faction_voc' : 'faction_zheng', (e) => e.moveClass === 'foot' && !e.insideOf && inRegion(w, region, e));
  if (!foes.length) return 'persist';
  const [fx, fy] = centroid(foes);
  const force = army(w, ctx.owner).filter((u) => !isGun(w, u) && !isHero(w, u) && u.order?.type !== 'tuntian');
  const ready = force.filter((u) => !isMoving(u) && u.attackTarget === undefined);
  const reachable = ready.filter((u) => w.nav.connected('foot', Math.floor(u.x), Math.floor(u.y), Math.floor(fx), Math.floor(fy)));
  if (reachable.length >= 10) issue(ctx, { type: 'attack_move', ids: ids(reachable), x: fx, y: fy });
  return 'persist';
};

/** Mines the target if guns have not breached it (stage 4 sieges). */
const mine: Handler = (ctx, arg) => {
  const w = ctx.world;
  if (arg && w.data.buildings.has(arg)) ctx.ai.target = arg;
  const t = targetBuilding(w, ctx.ai);
  if (!t || t.owner === ctx.owner || t.hp <= t.maxHp * w.rules.capture.maxHpFraction || elapsed(ctx) > 420) return 'done';
  const digging = units(w, ctx.owner, (u) => u.order?.type === 'dig_mine');
  if (digging.length) return 'running';
  const origin = mineOrigin(w, ctx.owner, t);
  if (typeof origin === 'string') {
    // No trench close enough: extend the trench line first.
    return trench_approach(ctx, '');
  }
  issue(ctx, { type: 'dig_mine', ids: ids(builders(ctx, 4, [origin.x, origin.y])), target: t.id });
  return 'running';
};

export const STEP_HANDLERS: Record<string, Handler> = {
  strike,
  mine,
  wait_tide_high: (ctx) => (ctx.world.tidePhaseId === 'rising' ? 'done' : 'running'),
  move_fleet,
  unload,
  build,
  embark,
  move,
  form_line,
  advance,
  patrol,
  intercept,
  surround,
  bombard,
  assault,
  suppress,
  land,
  hide,
  strike_when,
  trench_approach,
  hold,
  sortie,
  counter_mine,
};
