// Battle effects (spec §9.3): musket smoke, cannon smoke and impacts, explosions, water splashes,
// fallen units fading out. No blood.
import { Container, Graphics } from 'pixi.js';
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { T } from '../sim/map';
import { toScreen } from './iso';

interface Fx {
  g: Graphics;
  age: number;
  life: number;
  update: (fx: Fx, f: number) => void;
}

export class Effects {
  readonly layer = new Container();
  private fx: Fx[] = [];
  /** Effects only show where the viewer can see (fog). */
  visibleAt: (x: number, y: number) => boolean = () => true;

  private add(life: number, draw: (g: Graphics) => void, update: (fx: Fx, f: number) => void, x: number, y: number, z = 0) {
    if (!this.visibleAt(x, y)) return;
    const g = new Graphics();
    draw(g);
    const p = toScreen(x, y);
    g.position.set(p.x, p.y + z);
    this.layer.addChild(g);
    this.fx.push({ g, age: 0, life, update });
  }

  handle(world: World, ev: SimEvent) {
    const e = ev as Record<string, number | string | boolean> & { type: string };
    if (e.type === 'shot') {
      const x = e.x as number;
      const y = e.y as number;
      const tx = e.tx as number;
      const ty = e.ty as number;
      if (e.atkType === 'musket') {
        this.puff(x, y, 0xf0f0f0, 6, 0.8);
        if (this.visibleAt(x, y)) this.tracer(x, y, tx, ty, 0xfff2b0, 0.12);
      } else if (e.atkType === 'cannon') {
        this.puff(x, y, 0xdddddd, 12, 1.4);
        this.ball(x, y, tx, ty);
        const water = world.map.terrain[Math.floor(ty) * world.map.width + Math.floor(tx)] <= T.tidal_flat;
        if (e.hit) this.burst(tx, ty, 0xffa040, 10, 0.45);
        else if (water) this.splash(tx, ty);
        else this.puff(tx, ty, 0x9a8460, 8, 0.6);
      } else if (e.atkType === 'arrow') {
        if (this.visibleAt(x, y)) this.tracer(x, y, tx, ty, 0x8b6b3d, 0.25);
      }
    } else if (e.type === 'explosion') {
      const big = e.size === 'large';
      this.burst(e.x as number, e.y as number, 0xff7020, big ? 34 : 14, big ? 1.0 : 0.5);
      this.puff(e.x as number, e.y as number, 0x555555, big ? 30 : 12, big ? 2.5 : 1.2);
    } else if (e.type === 'raid_warn') {
      this.raidRing(world, e.id as number, e.x as number, e.y as number, e.r as number);
    } else if (e.type === 'death' && e.kind === 'unit') {
      this.fallen(e.x as number, e.y as number);
    } else if (e.type === 'death' && e.kind === 'building') {
      this.burst(e.x as number, e.y as number, 0xff8030, 24, 0.8);
      this.puff(e.x as number, e.y as number, 0x5a5048, 36, 3);
    }
  }

  /** Air-raid warning: a pulsing ring on the ground until the bombs fall (shown through fog: the planes are heard). */
  private raidRing(world: World, id: number, x: number, y: number, r: number) {
    const g = new Graphics();
    // Iso footprint of a circle of radius r tiles (see toScreen: one tile is 64×32).
    g.ellipse(0, 0, r * 45, r * 22.5).stroke({ color: 0xff3020, width: 3, alpha: 0.9 });
    g.ellipse(0, 0, r * 45, r * 22.5).fill({ color: 0xff3020, alpha: 0.12 });
    const p = toScreen(x, y);
    g.position.set(p.x, p.y);
    this.layer.addChild(g);
    this.fx.push({
      g,
      age: 0,
      life: 60,
      update: (fx) => {
        if (!world.ext.raids?.some((q) => q.id === id)) fx.age = fx.life;
        fx.g.alpha = 0.55 + 0.45 * Math.sin(fx.age * 10);
      },
    });
  }

  private puff(x: number, y: number, color: number, size: number, life: number) {
    this.add(
      life,
      (g) => g.circle(0, 0, size).fill({ color, alpha: 0.7 }),
      (fx, f) => {
        fx.g.alpha = 0.7 * (1 - f);
        fx.g.scale.set(1 + f * 1.5);
        fx.g.y -= 0.3;
      },
      x,
      y,
      -14,
    );
  }

  private burst(x: number, y: number, color: number, size: number, life: number) {
    this.add(
      life,
      (g) => {
        g.circle(0, 0, size).fill({ color, alpha: 0.85 });
        g.circle(0, 0, size * 0.5).fill({ color: 0xfff0a0, alpha: 0.9 });
      },
      (fx, f) => {
        fx.g.alpha = 1 - f;
        fx.g.scale.set(0.6 + f);
      },
      x,
      y,
      -8,
    );
  }

  private splash(x: number, y: number) {
    this.add(
      0.6,
      (g) => {
        for (let i = 0; i < 6; i++) g.circle(Math.cos(i) * 5, -Math.abs(Math.sin(i * 2)) * 8, 2.5).fill(0xe0f4ff);
        g.ellipse(0, 0, 10, 4).stroke({ color: 0xffffff, width: 1.5 });
      },
      (fx, f) => {
        fx.g.alpha = 1 - f;
        fx.g.scale.set(1 + f);
      },
      x,
      y,
    );
  }

  private tracer(x: number, y: number, tx: number, ty: number, color: number, life: number) {
    const a = toScreen(x, y);
    const b = toScreen(tx, ty);
    const g = new Graphics();
    g.moveTo(a.x, a.y - 14).lineTo(b.x, b.y - 10).stroke({ color, width: 1.2, alpha: 0.8 });
    this.layer.addChild(g);
    this.fx.push({ g, age: 0, life, update: (fx, f) => (fx.g.alpha = 0.8 * (1 - f)) });
  }

  private ball(x: number, y: number, tx: number, ty: number) {
    if (!this.visibleAt(x, y) && !this.visibleAt(tx, ty)) return;
    const a = toScreen(x, y);
    const b = toScreen(tx, ty);
    const g = new Graphics();
    g.circle(0, 0, 2.5).fill(0x222222);
    this.layer.addChild(g);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    this.fx.push({
      g,
      age: 0,
      life: Math.max(0.15, dist / 900),
      update: (fx, f) => {
        fx.g.position.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f - 14 - Math.sin(f * Math.PI) * dist * 0.12);
      },
    });
  }

  private fallen(x: number, y: number) {
    this.add(
      1.6,
      (g) => g.roundRect(-9, -4, 18, 7, 3).fill({ color: 0x4a4038, alpha: 0.9 }),
      (fx, f) => (fx.g.alpha = 0.9 * (1 - f)),
      x,
      y,
    );
  }

  update(dt: number) {
    for (const fx of this.fx) {
      fx.age += dt;
      fx.update(fx, Math.min(1, fx.age / fx.life));
    }
    const done = this.fx.filter((f) => f.age >= f.life);
    for (const f of done) f.g.destroy();
    if (done.length) this.fx = this.fx.filter((f) => f.age < f.life);
  }
}
