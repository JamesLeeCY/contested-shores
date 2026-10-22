// Shared helpers for the AI layers. The AI only acts through commands (world.enqueue), so its
// decisions are replayed exactly like a player's.
import type { Command } from '../commands';
import { distToEntity } from '../geometry';
import { findRegion, regionContains } from '../map';
import { nearestPassable } from '../path/astar';
import type { AiState } from '../state';
import type { Entity, Owner } from '../types';
import type { World } from '../world';
import { isEnemy } from '../systems/combat';
import { isVisibleTo } from '../systems/fog';

export interface AiCtx {
  world: World;
  ai: AiState;
  owner: Owner;
}

/** Command minus its owner, distributed over the union. */
export type OwnerlessCommand = Command extends infer C ? (C extends Command ? Omit<C, 'owner'> : never) : never;

export function issue(ctx: AiCtx, cmd: OwnerlessCommand) {
  ctx.world.enqueue({ ...cmd, owner: ctx.owner } as Command);
}

export function difficultyOf(world: World, ai: AiState) {
  return world.rules.difficulty[ai.difficulty];
}

const isWorkerType = (world: World, type: string) => world.data.units.get(type)!.traits.includes('gatherer');

export function units(world: World, owner: Owner, pred: (e: Entity) => boolean = () => true): Entity[] {
  const out: Entity[] = [];
  for (const e of world.all()) if (e.kind === 'unit' && e.owner === owner && pred(e)) out.push(e);
  return out;
}

export function workers(world: World, owner: Owner) {
  return units(world, owner, (e) => isWorkerType(world, e.type));
}

/** Foot soldiers, guns and heroes (not workers, not ships). */
export function army(world: World, owner: Owner, includeInside = false) {
  return units(world, owner, (e) => e.moveClass === 'foot' && !isWorkerType(world, e.type) && (includeInside || !e.insideOf));
}

export function ships(world: World, owner: Owner) {
  return units(world, owner, (e) => e.moveClass !== 'foot');
}

export function armyPop(world: World, owner: Owner) {
  return army(world, owner, true).reduce((s, e) => s + world.data.units.get(e.type)!.pop, 0);
}

export function isGun(world: World, e: Entity) {
  return world.data.units.get(e.type)!.class === 'siege';
}

export function isHero(world: World, e: Entity) {
  return world.data.units.get(e.type)!.traits.includes('hero');
}

export function centroid(es: Entity[]): [number, number] {
  if (!es.length) return [0, 0];
  return [es.reduce((s, e) => s + e.x, 0) / es.length, es.reduce((s, e) => s + e.y, 0) / es.length];
}

export function regionCenter(world: World, id: string): [number, number] {
  const r = findRegion(world.map, id);
  return [r.x + r.w / 2, r.y + r.h / 2];
}

export function inRegion(world: World, id: string, e: Entity) {
  return regionContains(findRegion(world.map, id), Math.floor(e.x), Math.floor(e.y));
}

/** Visible enemy units of a faction, ascending id. */
export function visibleEnemies(world: World, owner: Owner, pred: (e: Entity) => boolean = () => true): Entity[] {
  const out: Entity[] = [];
  for (const e of world.all())
    if (e.kind === 'unit' && !e.insideOf && isEnemy(world, owner, e.owner) && world.isPlayable(e.owner) && isVisibleTo(world, owner, e) && pred(e))
      out.push(e);
  return out;
}

export function nearest<T extends Entity>(list: T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const e of list) {
    const d = e.kind === 'building' ? distToEntity(x, y, e) : Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function buildingByType(world: World, type: string): Entity | undefined {
  return world.buildings().find((b) => b.type === type);
}

/** The scenario's target building (by type, e.g. 'provintia_fort'). */
export function targetBuilding(world: World, ai: AiState): Entity | undefined {
  return ai.target ? buildingByType(world, ai.target) : undefined;
}

/** Nearest tile of `cls` passable near (x, y) as a continuous point. */
export function passablePoint(world: World, cls: 'foot' | 'small_craft' | 'ship', x: number, y: number, r = 12): [number, number] | null {
  const p = nearestPassable(world.nav, cls, Math.floor(x), Math.floor(y), r);
  return p ? [p[0] + 0.5, p[1] + 0.5] : null;
}

/** Water point adjacent to land nearest (x, y): where ships put troops ashore. */
export function landingPoint(world: World, cls: 'small_craft' | 'ship', x: number, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  const R = 14;
  for (let ty = Math.floor(y) - R; ty <= Math.floor(y) + R; ty++)
    for (let tx = Math.floor(x) - R; tx <= Math.floor(x) + R; tx++) {
      if (!world.nav.passable(cls, tx, ty)) continue;
      let shore = false;
      for (let dy = -1; dy <= 1 && !shore; dy++) for (let dx = -1; dx <= 1 && !shore; dx++) if (world.nav.passable('foot', tx + dx, ty + dy)) shore = true;
      if (!shore) continue;
      const d = Math.hypot(tx + 0.5 - x, ty + 0.5 - y);
      if (d < bestD) {
        bestD = d;
        best = [tx + 0.5, ty + 0.5];
      }
    }
  return best;
}

export const secondsSince = (world: World, tick: number) => (world.tick - tick) / world.ticksPerSecond;
