import type { Entity } from './types';

/** Distance from a point to an entity: footprint edge for buildings, centre for others. */
export function distToEntity(x: number, y: number, e: Entity): number {
  if (e.kind === 'building' && e.tx !== undefined) return distToRect(x, y, e.tx, e.ty!, e.w!, e.h!);
  return Math.hypot(e.x - x, e.y - y);
}

export function distToRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): number {
  const dx = Math.max(rx - x, 0, x - (rx + rw));
  const dy = Math.max(ry - y, 0, y - (ry + rh));
  return Math.hypot(dx, dy);
}

/** Distance between two entities, edge to edge (unit radii and building footprints). */
export function entityDistance(a: Entity, b: Entity): number {
  const d = distToEntity(a.x, a.y, b);
  return Math.max(0, d - (a.kind === 'unit' ? a.radius : 0) - (b.kind === 'unit' ? b.radius : 0));
}

/** Closest point on a building footprint to (x, y). */
export function closestPointOnRect(x: number, y: number, rx: number, ry: number, rw: number, rh: number): [number, number] {
  return [Math.max(rx, Math.min(rx + rw, x)), Math.max(ry, Math.min(ry + rh, y))];
}
