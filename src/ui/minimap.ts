import type { Camera } from '../render/camera';
import { TERRAIN_IDS, type GameMap } from '../sim/map';

export interface MinimapDot {
  x: number;
  y: number;
  color: string;
  size: number;
}

/** 200×150 top-down minimap (spec §9.1). Click or drag to move the camera. */
export class Minimap {
  readonly el: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private readonly sx: number;
  private readonly sy: number;

  constructor(
    private readonly map: GameMap,
    colors: Record<string, string>,
    private readonly camera: Camera,
  ) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.el.width = 200;
    this.el.height = 150;
    this.ctx = this.el.getContext('2d')!;
    this.sx = this.el.width / map.width;
    this.sy = this.el.height / map.height;

    this.base = document.createElement('canvas');
    this.base.width = map.width;
    this.base.height = map.height;
    const bctx = this.base.getContext('2d')!;
    const img = bctx.createImageData(map.width, map.height);
    const rgb = TERRAIN_IDS.map((id) => [1, 3, 5].map((o) => parseInt(colors[id].slice(o, o + 2), 16)));
    for (let i = 0; i < map.terrain.length; i++) img.data.set([...rgb[map.terrain[i]], 255], i * 4);
    bctx.putImageData(img, 0, 0);

    let dragging = false;
    const jump = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      this.camera.centerOn(((e.clientX - r.left) / r.width) * map.width, ((e.clientY - r.top) / r.height) * map.height);
    };
    this.el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      this.el.setPointerCapture(e.pointerId);
      jump(e);
    });
    this.el.addEventListener('pointermove', (e) => dragging && jump(e));
    this.el.addEventListener('pointerup', () => (dragging = false));
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** `fog` (optional): 0 unexplored, 1 explored, 2 visible per tile. */
  draw(dots: MinimapDot[], fog?: Uint8Array) {
    const { ctx, sx, sy } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.base, 0, 0, this.el.width, this.el.height);
    if (fog) {
      for (let y = 0; y < this.map.height; y++)
        for (let x = 0; x < this.map.width; x++) {
          const f = fog[y * this.map.width + x];
          if (f === 2) continue;
          ctx.fillStyle = f === 0 ? '#000' : 'rgba(0,0,0,0.45)';
          ctx.fillRect(x * sx, y * sy, sx + 0.5, sy + 0.5);
        }
    }
    for (const d of dots) {
      ctx.fillStyle = d.color;
      ctx.fillRect(d.x * sx - d.size / 2, d.y * sy - d.size / 2, d.size, d.size);
    }
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    this.camera.corners().forEach((c, i) => (i ? ctx.lineTo(c.x * sx, c.y * sy) : ctx.moveTo(c.x * sx, c.y * sy)));
    ctx.closePath();
    ctx.stroke();
  }
}
