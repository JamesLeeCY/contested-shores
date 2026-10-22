// Fog overlay: a 1-pixel-per-tile canvas, mapped onto the isometric grid with an affine
// transform and smoothed by linear filtering. Black = unexplored, dim = explored, clear = visible.
import { Matrix, Sprite, Texture } from 'pixi.js';
import { TILE_H, TILE_W } from './iso';
import type { FogState } from '../sim/systems/fog';

export class FogRenderer {
  readonly sprite: Sprite;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;
  private texture: Texture;

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(width, height);
    this.texture = Texture.from(this.canvas);
    this.texture.source.scaleMode = 'linear';
    this.sprite = new Sprite(this.texture);
    // Texture pixel (u, v) → tile (u, v) → iso screen ((u − v)·W/2, (u + v)·H/2).
    this.sprite.setFromMatrix(new Matrix(TILE_W / 2, TILE_H / 2, -TILE_W / 2, TILE_H / 2, 0, 0));
    this.sprite.eventMode = 'none';
  }

  update(fog: FogState | undefined) {
    this.sprite.visible = !!fog;
    if (!fog) return;
    const d = this.img.data;
    for (let i = 0; i < this.width * this.height; i++) {
      const a = fog.visible[i] ? 0 : fog.explored[i] ? 110 : 235;
      d[i * 4] = 8;
      d[i * 4 + 1] = 10;
      d[i * 4 + 2] = 14;
      d[i * 4 + 3] = a;
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.texture.source.update();
  }
}
