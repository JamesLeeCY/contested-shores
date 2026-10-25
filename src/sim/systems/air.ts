// Air raids (1930 霧社): the scenario calls in a bombing run on the densest knot of the target
// side's men. A warning ring marks the spot for a few seconds; then the bombs fall on every unit
// of other sides inside the ring, spread over the men hit. Men in forest or on the mountain take far
// less (cover).
import { T } from '../map';
import { army } from '../ai/common';
import type { Owner } from '../types';
import type { World } from '../world';
import { applyDamage } from './combat';

export interface Raid {
  id: number;
  x: number;
  y: number;
  /** Tick the bombs land. */
  at: number;
  owner: Owner;
  r: number;
  dmg: number;
  coverMul: number;
}

/** Picks the spot (the unit with the most comrades within `r`) and schedules the bombs. */
export function callRaid(world: World, owner: Owner, target: Owner, opts: { r: number; dmg: number; warn: number; coverMul: number; region?: { x: number; y: number; w: number; h: number } }) {
  const g = opts.region;
  const men = army(world, target).filter((u) => !g || (u.x >= g.x && u.y >= g.y && u.x < g.x + g.w && u.y < g.y + g.h));
  if (!men.length) return;
  let best = men[0];
  let bestN = -1;
  for (const u of men) {
    const n = men.filter((v) => Math.hypot(v.x - u.x, v.y - u.y) <= opts.r).length;
    if (n > bestN) {
      best = u;
      bestN = n;
    }
  }
  const raids = (world.ext.raids ??= []);
  const id = (Number(world.ext.flags.raidSeq ?? 0) + 1) | 0;
  world.ext.flags.raidSeq = id;
  const raid: Raid = { id, x: best.x, y: best.y, at: world.tick + Math.round(opts.warn * world.ticksPerSecond), owner, r: opts.r, dmg: opts.dmg, coverMul: opts.coverMul };
  raids.push(raid);
  world.emit({ type: 'raid_warn', id, x: raid.x, y: raid.y, r: raid.r, owner });
}

const COVER = new Set<number>([T.forest, T.mountain]);
/** Full damage for up to this many men in the ring; spread thinner beyond. */
const SHARE = 4;

export function airSystem(world: World) {
  const raids = world.ext.raids;
  if (!raids?.length) return;
  const due = raids.filter((r) => world.tick >= r.at);
  if (!due.length) return;
  world.ext.raids = raids.filter((r) => world.tick < r.at);
  for (const r of due) {
    world.emit({ type: 'raid', id: r.id, x: r.x, y: r.y, r: r.r });
    // A spread of bursts across the ring (fixed pattern: the sim stays deterministic).
    for (const [dx, dy] of [[0, 0], [0.6, 0.3], [-0.5, 0.5], [0.2, -0.6], [-0.4, -0.3]])
      world.emit({ type: 'explosion', x: r.x + dx * r.r, y: r.y + dy * r.r, size: 'large' });
    const hit = world.unitsNear(r.x, r.y, r.r + 1).filter((u) => u.kind === 'unit' && u.owner !== r.owner && !u.insideOf && Math.hypot(u.x - r.x, u.y - r.y) <= r.r);
    // A run carries so many bombs: the more men in the ring, the less each one takes (as if four were
    // hit in full), so a packed crowd is hurt but not wiped out in one pass.
    const spread = Math.min(1, SHARE / Math.max(1, hit.length));
    for (const u of hit) {
      const tile = world.map.terrain[Math.floor(u.y) * world.map.width + Math.floor(u.x)];
      applyDamage(world, u, r.dmg * spread * (COVER.has(tile) ? r.coverMul : 1));
    }
  }
}
