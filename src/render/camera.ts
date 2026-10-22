import type { Container } from 'pixi.js';
import { toScreen, toTile } from './iso';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 1.5;

/** Camera centred on a tile coordinate; applies itself to the world container. */
export class Camera {
  /** Centre of the view in continuous tile coordinates. */
  cx: number;
  cy: number;
  zoom = 1;
  viewW = 1280;
  viewH = 720;

  constructor(
    private readonly mapW: number,
    private readonly mapH: number,
  ) {
    this.cx = mapW / 2;
    this.cy = mapH / 2;
  }

  resize(w: number, h: number) {
    this.viewW = w;
    this.viewH = h;
  }

  centerOn(tx: number, ty: number) {
    this.cx = Math.max(0, Math.min(this.mapW, tx));
    this.cy = Math.max(0, Math.min(this.mapH, ty));
  }

  /** Pan by a screen-space delta in CSS pixels. */
  panScreen(dx: number, dy: number) {
    const c = toScreen(this.cx, this.cy);
    const t = toTile(c.x + dx / this.zoom, c.y + dy / this.zoom);
    this.centerOn(t.x, t.y);
  }

  /** Zoom keeping the tile under the given screen point fixed. */
  zoomAt(factor: number, sx: number, sy: number) {
    const before = this.screenToTile(sx, sy);
    this.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, this.zoom * factor));
    const after = this.screenToTile(sx, sy);
    this.centerOn(this.cx + before.x - after.x, this.cy + before.y - after.y);
  }

  screenToTile(sx: number, sy: number) {
    const c = toScreen(this.cx, this.cy);
    return toTile(c.x + (sx - this.viewW / 2) / this.zoom, c.y + (sy - this.viewH / 2) / this.zoom);
  }

  tileToScreen(tx: number, ty: number) {
    const c = toScreen(this.cx, this.cy);
    const p = toScreen(tx, ty);
    return { x: (p.x - c.x) * this.zoom + this.viewW / 2, y: (p.y - c.y) * this.zoom + this.viewH / 2 };
  }

  apply(world: Container) {
    const c = toScreen(this.cx, this.cy);
    world.scale.set(this.zoom);
    world.position.set(Math.round(this.viewW / 2 - c.x * this.zoom), Math.round(this.viewH / 2 - c.y * this.zoom));
  }

  /** The four view corners in tile coordinates (for the minimap and culling). */
  corners() {
    return [
      this.screenToTile(0, 0),
      this.screenToTile(this.viewW, 0),
      this.screenToTile(this.viewW, this.viewH),
      this.screenToTile(0, this.viewH),
    ];
  }
}
