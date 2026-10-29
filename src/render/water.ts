// Glints on open water: short highlights that fade in and out at random spots in view.
// Purely cosmetic (Math.random is fine here: nothing in the simulation reads it).
import { Container, Sprite, Texture } from 'pixi.js';
import { T, type GameMap } from '../sim/map';
import type { Camera } from './camera';
import { toScreen } from './iso';

const COUNT = 70;

function glintTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 4;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 16, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.9)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 1, 16, 2);
  return Texture.from(c);
}

export class WaterGlints {
  readonly layer = new Container();
  private glints: { s: Sprite; age: number; life: number }[] = [];

  constructor(private readonly map: GameMap) {
    this.layer.eventMode = 'none';
    const tex = glintTexture();
    for (let i = 0; i < COUNT; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      this.glints.push({ s, age: 0, life: 0 });
    }
  }

  update(dt: number, camera: Camera) {
    const { width: W, height: H, terrain } = this.map;
    for (const g of this.glints) {
      g.age += dt;
      if (g.age < g.life) {
        g.s.alpha = Math.sin((Math.PI * g.age) / g.life) * 0.55;
        continue;
      }
      // Respawn at a random point in view; skip this frame if it is not on water.
      g.s.visible = false;
      const p = camera.screenToTile(Math.random() * camera.viewW, Math.random() * camera.viewH);
      const x = Math.floor(p.x);
      const y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const t = terrain[y * W + x];
      if (t !== T.deep_water && t !== T.shallow && t !== T.stream) continue;
      const s = toScreen(p.x, p.y);
      g.s.position.set(s.x, s.y);
      g.s.scale.set(0.6 + Math.random() * 0.8, 1);
      g.s.alpha = 0;
      g.s.visible = true;
      g.age = 0;
      g.life = 0.8 + Math.random() * 1.6;
    }
  }
}
