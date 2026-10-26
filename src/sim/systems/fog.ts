// Fog of war (spec §4.13): unexplored / explored / visible per faction, updated every 5 ticks.
// Forests block line of sight (except for elevated observers); 社戰士 in forest stay hidden
// unless an enemy is within 2 tiles (forest_stealth).
import { T, TERRAIN_IDS } from '../map';
import { unitStat } from '../stats';
import type { Entity, Owner } from '../types';
import type { World } from '../world';

export interface FogState {
  /** 1 where currently visible. */
  visible: Uint8Array;
  /** 1 where ever seen. */
  explored: Uint8Array;
}

const fogs = new WeakMap<World, Map<Owner, FogState>>();
const sightBlockers = new WeakMap<World, Uint8Array>();

export function fogOf(world: World, owner: Owner): FogState | undefined {
  if (world.opts.noFog || !world.isPlayable(owner)) return undefined;
  let m = fogs.get(world);
  if (!m) fogs.set(world, (m = new Map()));
  let f = m.get(owner);
  if (!f) {
    const n = world.map.width * world.map.height;
    m.set(owner, (f = { visible: new Uint8Array(n), explored: new Uint8Array(n) }));
  }
  return f;
}

function blockers(world: World): Uint8Array {
  let b = sightBlockers.get(world);
  if (!b) {
    b = new Uint8Array(world.map.terrain.length);
    sightBlockers.set(world, b);
  }
  const types = world.rules.terrain.types as Record<string, { blocksSight?: boolean }>;
  // Terrain can change (forests felled), so refresh each update; cheap.
  for (let i = 0; i < b.length; i++) b[i] = types[TERRAIN_IDS[world.map.terrain[i]]].blocksSight ? 1 : 0;
  return b;
}

function sightLine(blk: Uint8Array, W: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i < n; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / n);
    const y = Math.round(y0 + ((y1 - y0) * i) / n);
    if (blk[y * W + x]) return false;
  }
  return true;
}

function reveal(world: World, fog: FogState, blk: Uint8Array, cx: number, cy: number, r: number, elevated: boolean) {
  const W = world.map.width;
  const H = world.map.height;
  const sx = Math.floor(cx);
  const sy = Math.floor(cy);
  const R = Math.ceil(r);
  for (let y = Math.max(0, sy - R); y <= Math.min(H - 1, sy + R); y++)
    for (let x = Math.max(0, sx - R); x <= Math.min(W - 1, sx + R); x++) {
      if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r) continue;
      const i = y * W + x;
      if (fog.visible[i]) continue;
      if (!elevated && !sightLine(blk, W, sx, sy, x, y)) continue;
      fog.visible[i] = 1;
      fog.explored[i] = 1;
    }
}

export function sightOf(world: World, e: Entity): number {
  const mul = world.weather.sightMul;
  if (e.kind === 'building') return world.data.buildings.get(e.type)!.sight * mul;
  let s = unitStat(world, e, 'sight');
  if (world.map.terrain[Math.floor(e.y) * world.map.width + Math.floor(e.x)] === T.hill) s += world.rules.fog.hillSightBonus;
  return s * mul;
}

export function updateFog(world: World) {
  const blk = blockers(world);
  for (const owner of world.factions.keys()) {
    const fog = fogOf(world, owner);
    if (!fog) continue;
    fog.visible.fill(0);
    for (const e of world.all()) {
      if (e.owner !== owner || e.kind === 'resource') continue;
      if (e.kind === 'unit' && e.insideOf) {
        const host = world.get(e.insideOf);
        // Garrisons on walls see further; cargo and tuntian farmers add nothing.
        if (host?.kind === 'building' && host.type !== 'tuntian')
          reveal(world, fog, blk, host.x, host.y, sightOf(world, e) + world.rules.fog.garrisonSightBonus + host.w! / 2, true);
        continue;
      }
      const elevated = e.kind === 'building' || world.map.terrain[Math.floor(e.y) * world.map.width + Math.floor(e.x)] === T.hill;
      reveal(world, fog, blk, e.x, e.y, sightOf(world, e) + (e.kind === 'building' ? e.w! / 2 : 0), elevated);
    }
    // 何斌海圖: shallow channels are permanently charted (explored).
    const f = world.faction(owner)!;
    if (f.revealTerrain.length) {
      const ids = f.revealTerrain.map((t) => TERRAIN_IDS.indexOf(t as (typeof TERRAIN_IDS)[number]));
      for (let i = 0; i < world.map.terrain.length; i++) if (ids.includes(world.map.terrain[i])) fog.explored[i] = 1;
    }
  }
}

/** Mines detected by counter-mining, per faction. */
export const detectedMines = new WeakMap<World, Map<Owner, Set<number>>>();

export function isVisibleTo(world: World, owner: Owner, e: Entity): boolean {
  if (e.owner === owner) return true;
  if (visibilityHook.allied?.(world, owner, e.owner)) return true;
  if (e.type === 'mine') return !!detectedMines.get(world)?.get(owner)?.has(e.id);
  const fog = fogOf(world, owner);
  if (!fog) return true;
  const W = world.map.width;
  if (e.kind === 'building') {
    // Buildings stay known (and targetable) once any part of them has been seen.
    for (let y = e.ty!; y < e.ty! + e.h!; y++) for (let x = e.tx!; x < e.tx! + e.w!; x++) if (fog.explored[y * W + x]) return true;
    return false;
  }
  if (e.insideOf) return false;
  const i = Math.floor(e.y) * W + Math.floor(e.x);
  if (!fog.visible[i]) return false;
  const tr = world.map.terrain[i];
  const traits = world.data.units.get(e.type)?.traits ?? [];
  // 森林隱匿; 排灣族 also vanish into hills and mountain slopes they know.
  if ((tr === T.forest && traits.includes('forest_stealth')) || ((tr === T.forest || tr === T.hill || tr === T.mountain) && traits.includes('mountain_stealth'))) {
    const cfg = (world.rules.combat.traits as unknown as Record<string, { revealDistance: number; smokeSpotDistance?: number }>)[
      traits.includes('mountain_stealth') ? 'mountain_stealth' : 'forest_stealth'
    ];
    // Gun smoke betrays the shooter: in the mountains only to someone close enough to make out where it
    // rose (smokeSpotDistance), in the forest to anyone who can see the spot (forest_stealth has none).
    const smoking = (e.revealedUntil ?? -1) > world.tick;
    if (smoking && cfg.smokeSpotDistance === undefined) return true;
    const spot = smoking ? Math.max(cfg.revealDistance, cfg.smokeSpotDistance!) : cfg.revealDistance;
    return world.unitsNear(e.x, e.y, spot + 0.5).some((o) => o.owner === owner);
  }
  return true;
}

/** Lets diplomacy share vision with allies. */
export const visibilityHook: { allied: ((world: World, viewer: Owner, owner: Owner) => boolean) | null } = { allied: null };

export function fogSystem(world: World) {
  if (world.tick % world.rules.sim.fogUpdateTicks === 0) updateFog(world);
}
