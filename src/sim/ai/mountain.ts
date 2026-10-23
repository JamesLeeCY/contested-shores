// Mountain-war plan steps for the 1874 scenarios. Step arguments use '/' between parameters
// (the plan runner splits verb and argument at the first ':').
//   Expedition: push:<region>  flank:<region>/<n>  hold_region:<region>  column:<tag>/<region>
//   Both:       evacuate:<tag>/<region>
//   Defenders:  ambush:<region>/<n>/<facing region>  skirmish:<region>/<n>/<facing region>  harass:<region>/<n>  guard:<region>/<n>  fallback:<region>/<enemy region>/<pop>
// Units belong to at most one named group (kept in ai.mem); everyone else is the main body.
import { T, TERRAIN_IDS } from '../map';
import { isMoving } from '../systems/movement';
import type { Entity } from '../types';
import { army, inRegion, isHero, issue, regionCenter, visibleEnemies, type AiCtx } from './common';

type Result = 'done' | 'running' | 'persist';
type Handler = (ctx: AiCtx, arg: string) => Result;

const ids = (es: Entity[]) => es.map((e) => e.id);
const groups = (ctx: AiCtx) => ((ctx.ai.mem.groups ??= {}) as Record<string, number[]>);
const slots = (ctx: AiCtx) => ((ctx.ai.mem.slots ??= {}) as Record<string, [number, number]>);

function members(ctx: AiCtx, key: string): Entity[] {
  const g = groups(ctx);
  const list = (g[key] ?? []).map((id) => ctx.world.get(id)).filter((e): e is Entity => !!e && !e.insideOf);
  g[key] = ids(list);
  return list;
}

function grouped(ctx: AiCtx): Set<number> {
  return new Set(Object.values(groups(ctx)).flat());
}

const isRanged = (ctx: AiCtx, u: Entity) => ctx.world.data.units.get(u.type)!.range > 1.5;
const heightAt = (ctx: AiCtx, x: number, y: number) =>
  (ctx.world.rules.terrain.types[TERRAIN_IDS[ctx.world.map.terrain[y * ctx.world.map.width + x]]] as { height?: number }).height ?? 0;
const dist = (u: Entity, p: [number, number]) => Math.hypot(u.x - p[0], u.y - p[1]);

/** Free units (in no group) sorted nearest-first to a point. */
function free(ctx: AiCtx, pred: (u: Entity) => boolean, near: [number, number]): Entity[] {
  const taken = grouped(ctx);
  return army(ctx.world, ctx.owner)
    .filter((u) => !taken.has(u.id) && pred(u))
    .sort((a, b) => dist(a, near) - dist(b, near) || a.id - b.id);
}

function recruit(ctx: AiCtx, key: string, n: number, pred: (u: Entity) => boolean, near: [number, number]): Entity[] {
  const have = members(ctx, key);
  if (have.length < n) groups(ctx)[key] = [...ids(have), ...ids(free(ctx, pred, near).slice(0, n - have.length))];
  return members(ctx, key);
}

function regionTiles(ctx: AiCtx, region: string): [number, number][] {
  const r = ctx.world.map.regions.find((x) => x.id === region)!;
  const out: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) if (ctx.world.nav.passable('foot', x, y)) out.push([x, y]);
  return out;
}

// --- expedition --------------------------------------------------------------------------------------

/** Main body (everyone outside the climbing detachments) advances on a region, fighting on the way. */
const push: Handler = (ctx, region) => {
  const w = ctx.world;
  const taken = grouped(ctx);
  const main = army(w, ctx.owner).filter((u) => !taken.has(u.id));
  if (!main.length) return 'running';
  const [x, y] = regionCenter(w, region);
  const idle = main.filter((u) => !isMoving(u) && u.attackTarget === undefined && !inRegion(w, region, u));
  if (idle.length) issue(ctx, { type: 'attack_move', ids: ids(idle), x, y });
  const inside = main.filter((u) => inRegion(w, region, u)).length;
  return inside >= Math.max(3, main.length * 0.5) ? 'done' : 'running';
};

/** Defenders' fighters still on a height: the same count the objective panel shows the player. */
export function holdersIn(world: AiCtx['world'], owner: string, region: string): number {
  return army(world, world.enemyOf(owner)).filter((u) => inRegion(world, region, u)).length;
}

/**
 * A climbing detachment (swords first) takes a height and sweeps it in a grid to flush out hidden
 * marksmen. While defenders remain (fewer than `holdBelow` means taken, as in the objective) it
 * keeps a detachment up there; afterwards it lets the climbers rejoin the main body.
 */
const flank: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [region, nArg] = arg.split('/');
  const key = `flank_${region}`;
  const m = ctx.ai.mem;
  const c = regionCenter(w, region);
  const held = holdersIn(w, ctx.owner, region) >= 3;
  let g = members(ctx, key);
  if (!held) {
    if (g.length) delete groups(ctx)[key];
    return 'persist';
  }
  if (g.length < Math.ceil(Number(nArg ?? 8) / 2)) {
    const n = Number(nArg ?? 8);
    recruit(ctx, key, n, (u) => !isHero(w, u) && !isRanged(ctx, u), c);
    g = recruit(ctx, key, n, (u) => !isHero(w, u), c);
  }
  if (!g.length) return 'persist';
  const r = w.map.regions.find((x) => x.id === region)!;
  const grid: [number, number][] = [];
  for (let y = r.y + 1; y < r.y + r.h; y += 3) for (let x = r.x + 1; x < r.x + r.w; x += 3) grid.push([x, y]);
  const there = g.filter((u) => inRegion(w, region, u)).length;
  const idle = g.filter((u) => !isMoving(u) && u.attackTarget === undefined);
  if (idle.length) {
    const wp = ((m[`${key}_wp`] as number) ?? 0) % grid.length;
    const goal = there < g.length / 2 ? c : grid[wp];
    if (there >= g.length / 2) m[`${key}_wp`] = wp + 1;
    issue(ctx, { type: 'attack_move', ids: ids(idle), x: goal[0] + 0.5, y: goal[1] + 0.5 });
  }
  return 'persist';
};

/** Keeps sending idle soldiers of the main body (reinforcements included) to a region. */
const hold_region: Handler = (ctx, region) => {
  const w = ctx.world;
  const taken = grouped(ctx);
  const columns = (ctx.ai.mem.columns ?? []) as string[];
  const [x, y] = regionCenter(w, region);
  const idle = army(w, ctx.owner).filter(
    (u) => !taken.has(u.id) && !columns.includes(u.tag ?? '') && !isMoving(u) && u.attackTarget === undefined && !inRegion(w, region, u),
  );
  if (idle.length) issue(ctx, { type: 'attack_move', ids: ids(idle), x, y });
  return 'persist';
};

/** A tagged column marches on its own objective, fighting on the way, and stays there. */
const column: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [tag, region] = arg.split('/');
  const cols = (ctx.ai.mem.columns ??= []) as string[];
  if (!cols.includes(tag)) cols.push(tag);
  const taken = grouped(ctx);
  const [x, y] = regionCenter(w, region);
  const idle = army(w, ctx.owner).filter((u) => u.tag === tag && !taken.has(u.id) && !isMoving(u) && u.attackTarget === undefined && !inRegion(w, region, u));
  if (idle.length) issue(ctx, { type: 'attack_move', ids: ids(idle), x, y });
  return 'persist';
};

/** Tagged people (族人) walk to a refuge; whoever stops short is sent on again. */
const evacuate: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [tag, region] = arg.split('/');
  const [x, y] = regionCenter(w, region);
  const left = [...w.all()].filter((u) => u.kind === 'unit' && u.owner === ctx.owner && u.tag === tag && !isMoving(u) && !inRegion(w, region, u));
  if (left.length) issue(ctx, { type: 'move', ids: ids(left), x, y });
  return 'persist';
};

// --- defenders ---------------------------------------------------------------------------------------

/**
 * Marksmen take the spots of a height nearest the facing region, one each, and hold there (fire at
 * whatever comes into range, never chase). Losses are refilled from free units. With `skirmish`,
 * anyone (fighters and the chief too) holds the height but slips away into the mountains when the
 * enemy climbs within reach, and comes back once they have moved on.
 */
function post(ctx: AiCtx, arg: string, skirmish: boolean, ring = false): Result {
  const w = ctx.world;
  const [region, nArg, facing] = arg.split('/');
  const key = `${ring ? 'harass' : skirmish ? 'skirmish' : 'ambush'}_${region}`;
  const face = regionCenter(w, facing ?? region);
  const before = new Set(ids(members(ctx, key)));
  const g = recruit(ctx, key, Number(nArg ?? 8), (u) => (skirmish ? true : !isHero(w, u) && isRanged(ctx, u)), regionCenter(w, region));
  const fresh = g.filter((u) => !before.has(u.id));
  if (fresh.length) issue(ctx, { type: 'stance', ids: ids(fresh), hold: true });
  const s = slots(ctx);
  const away = (ctx.ai.mem.away ??= {}) as Record<string, number>;
  const used = new Set(g.map((u) => s[u.id]?.join(',')).filter(Boolean));
  // Only the summit: the slopes below are exposed, and woods would blind the marksman.
  const tiles = (ring ? ringTiles(ctx, region) : regionTiles(ctx, region).filter(([x, y]) => heightAt(ctx, x, y) >= 2))
    .map(([x, y]) => ({ x, y, score: Math.hypot(x - face[0], y - face[1]) }))
    .sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  const reach = (w.rules.ai as { skirmishRetreatDistance?: number }).skirmishRetreatDistance ?? 4;
  for (const u of g) {
    if (!s[u.id]) {
      const t = tiles.find((p) => !used.has(`${p.x},${p.y}`));
      if (!t) continue;
      s[u.id] = [t.x, t.y];
      used.add(`${t.x},${t.y}`);
    }
    if (skirmish) {
      if ((away[u.id] ?? -1) > w.tick) continue;
      // Within reach of the enemy, or already hurt: slip away before the riflemen find the range.
      const close = visibleEnemies(w, ctx.owner, (e) => dist(e, [u.x, u.y]) < (u.hp < u.maxHp * 0.6 ? reach + 3 : reach));
      if (close.length) {
        // Slip away uphill, directly away from the nearest climber.
        const e = close.reduce((a, b) => (dist(a, [u.x, u.y]) <= dist(b, [u.x, u.y]) ? a : b));
        const d = Math.max(0.1, dist(e, [u.x, u.y]));
        const to = escapeTile(ctx, u.x + ((u.x - e.x) / d) * 8, u.y + ((u.y - e.y) / d) * 8);
        if (to) issue(ctx, { type: 'move', ids: [u.id], x: to[0] + 0.5, y: to[1] + 0.5 });
        away[u.id] = w.tick + 25 * w.ticksPerSecond;
        continue;
      }
    }
    const [tx, ty] = s[u.id];
    if (!isMoving(u) && u.attackTarget === undefined && Math.hypot(u.x - tx - 0.5, u.y - ty - 0.5) > 0.8) issue(ctx, { type: 'move', ids: [u.id], x: tx + 0.5, y: ty + 0.5 });
  }
  return 'persist';
}

/** Nearest passable tile to a point (searching outwards a few tiles). */
function escapeTile(ctx: AiCtx, x: number, y: number): [number, number] | null {
  const w = ctx.world;
  const cx = Math.max(0, Math.min(w.map.width - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(w.map.height - 1, Math.floor(y)));
  for (let r = 0; r < 5; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx >= 0 && ty >= 0 && tx < w.map.width && ty < w.map.height && w.nav.passable('foot', tx, ty)) return [tx, ty];
      }
  return null;
}

/** Cover just outside a region (wooded or mountain tiles 1–4 tiles beyond its edge), for harassing it. */
function ringTiles(ctx: AiCtx, region: string): [number, number][] {
  const w = ctx.world;
  const r = w.map.regions.find((x) => x.id === region)!;
  const out: [number, number][] = [];
  for (let y = Math.max(0, r.y - 4); y < Math.min(w.map.height, r.y + r.h + 4); y++)
    for (let x = Math.max(0, r.x - 4); x < Math.min(w.map.width, r.x + r.w + 4); x++) {
      const inside = x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
      const t = w.map.terrain[y * w.map.width + x];
      if (!inside && (t === T.forest || heightAt(ctx, x, y) >= 1) && w.nav.passable('foot', x, y)) out.push([x, y]);
    }
  return out;
}

const ambush: Handler = (ctx, arg) => post(ctx, arg, false);
const skirmish: Handler = (ctx, arg) => post(ctx, arg, true);
/** Skirmishers in the cover round a place (a village the enemy is occupying): shoot, slip away, return. */
const harass: Handler = (ctx, arg) => post(ctx, `${arg}/${arg.split('/')[0]}`, true, true);

/**
 * Close-combat fighters (and the chief, if free) wait on a height and rush whoever reaches it;
 * when the enemy is gone they go back to their post.
 */
const guard: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [region, nArg] = arg.split('/');
  const key = `guard_${region}`;
  const c = regionCenter(w, region);
  const before = new Set(ids(members(ctx, key)));
  const g = recruit(ctx, key, Number(nArg ?? 8), (u) => !isRanged(ctx, u) && !isHero(w, u), c);
  const fresh = g.filter((u) => !before.has(u.id));
  if (fresh.length) issue(ctx, { type: 'stance', ids: ids(fresh), hold: true });
  const r = w.map.regions.find((x) => x.id === region)!;
  // Only climbers who have reached the height (slope or summit): never charge down into the gorge.
  const near = (e: Entity) => e.x >= r.x && e.y >= r.y && e.x < r.x + r.w && e.y < r.y + r.h && heightAt(ctx, Math.floor(e.x), Math.floor(e.y)) >= 1;
  const foes = visibleEnemies(w, ctx.owner, near);
  for (const u of g) {
    if (u.order?.type === 'attack' && w.get(u.order.target)) continue;
    const t = foes.length ? foes.reduce((a, b) => (dist(a, [u.x, u.y]) <= dist(b, [u.x, u.y]) ? a : b)) : null;
    if (t) issue(ctx, { type: 'attack', ids: [u.id], target: t.id });
    else if (!inRegion(w, region, u) && !isMoving(u)) issue(ctx, { type: 'move', ids: [u.id], x: c[0] + ((u.id % 5) - 2), y: c[1] + ((u.id % 3) - 1) });
  }
  return 'persist';
};

/**
 * Waits until the enemy has `pop` soldiers in a region (or our fighters are down to a third), then
 * breaks off every post and falls back to a new line.
 */
const fallback: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [region, enemyRegion, popArg] = arg.split('/');
  const m = ctx.ai.mem;
  const mine = army(w, ctx.owner);
  m.initArmy ??= mine.length;
  const enemy = army(w, w.enemyOf(ctx.owner)).filter((u) => inRegion(w, enemyRegion, u)).length;
  if (enemy < Number(popArg ?? 5) && mine.length > (m.initArmy as number) / 3) return 'running';
  ctx.ai.background = ctx.ai.background.filter((b) => !b.startsWith('ambush:') && !b.startsWith('guard:'));
  ctx.ai.mem.groups = {};
  ctx.ai.mem.slots = {};
  if (mine.length) {
    issue(ctx, { type: 'stance', ids: ids(mine), hold: false });
    const [x, y] = regionCenter(w, region);
    issue(ctx, { type: 'move', ids: ids(mine), x, y });
  }
  return 'done';
};

export const MOUNTAIN_STEPS: Record<string, Handler> = { push, flank, hold_region, column, evacuate, ambush, skirmish, harass, guard, fallback };
