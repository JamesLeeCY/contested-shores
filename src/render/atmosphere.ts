// Screen-space mood over the battlefield: a soft vignette always, and a blue night tint while a
// scenario's night lasts, warming into dawn as it lifts. (Typhoons have their own DOM overlay.)
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { World } from '../sim/world';

function vignetteTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 70, 128, 128, 182);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(8,10,14,0.45)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return Texture.from(c);
}

const DAWN_SECONDS = 25;

export class Atmosphere {
  readonly layer = new Container();
  private tint = new Graphics();
  private vignette = new Sprite(vignetteTexture());
  private w = 0;
  private h = 0;

  constructor(private readonly night?: { untilSeconds: number }) {
    this.layer.eventMode = 'none';
    this.layer.addChild(this.tint, this.vignette);
  }

  update(world: World, width: number, height: number) {
    if (width !== this.w || height !== this.h) {
      this.w = width;
      this.h = height;
      this.vignette.width = width;
      this.vignette.height = height;
    }
    const s = world.tick / world.rules.sim.tickHz;
    let color = 0;
    let alpha = 0;
    if (this.night) {
      const left = this.night.untilSeconds - s;
      if (left > 0) [color, alpha] = [0x0c1a3a, 0.4];
      else if (left > -DAWN_SECONDS) [color, alpha] = [0xffa860, 0.16 * (1 + left / DAWN_SECONDS)];
    }
    this.tint.clear();
    if (alpha > 0) this.tint.rect(0, 0, width, height).fill({ color, alpha });
  }
}
