// Placeholder entity rendering: coloured shapes + a glyph (spec §9.3 allows geometry until stage 8).
import { Container, Graphics, Text } from 'pixi.js';
import type { Entity, SimData } from '../sim/types';
import type { World } from '../sim/world';
import { t } from '../ui/i18n';
import { colorOf, ownerColors } from './colors';
import { TILE_H, toScreen } from './iso';

interface View {
  root: Container;
  body: Graphics;
  ring: Graphics;
  bar: Graphics;
  label?: Text;
  kind: Entity['kind'];
  lastHp: number;
  lastSel: boolean;
  lastFacing: number;
  lastStranded: boolean;
}

const BUILDING_HEIGHT: Record<string, number> = {
  zeelandia_castle: 46,
  bastion: 26,
  utrecht_redoubt: 28,
  provintia_fort: 34,
  lower_town_wall: 16,
  village_center: 20,
  farm: 2,
};

export class EntityRenderer {
  readonly layer = new Container();
  private views = new Map<number, View>();
  private colors: Map<string, [number, number]>;
  /** Entities hidden by fog of war (set by the fog renderer); not drawn. */
  hidden: (e: Entity) => boolean = () => false;

  constructor(private readonly data: SimData) {
    this.layer.sortableChildren = true;
    this.colors = ownerColors(data);
  }

  sync(world: World, alpha: number, selected: Set<number>) {
    const seen = new Set<number>();
    for (const e of world.all()) {
      if (e.insideOf) continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        v = this.create(e);
        this.views.set(e.id, v);
        this.layer.addChild(v.root);
      }
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const p = toScreen(x, y);
      v.root.position.set(p.x, p.y);
      v.root.zIndex = e.kind === 'building' ? (e.tx! + e.w! + e.ty! + e.h!) - 1 : x + y;
      v.root.visible = !this.hidden(e);
      const sel = selected.has(e.id);
      if (e.kind === 'unit' && (e.facing !== v.lastFacing || e.stranded !== v.lastStranded) && e.moveClass !== 'foot') {
        this.drawShip(v, e);
        v.lastFacing = e.facing ?? 0;
        v.lastStranded = !!e.stranded;
      }
      if (sel !== v.lastSel) {
        v.ring.visible = sel;
        v.lastSel = sel;
      }
      if (e.hp !== v.lastHp || sel) {
        this.drawBar(v, e, sel);
        v.lastHp = e.hp;
      }
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.views.delete(id);
      }
  }

  private create(e: Entity): View {
    const root = new Container();
    const ring = new Graphics();
    const body = new Graphics();
    const bar = new Graphics();
    root.addChild(ring, body, bar);
    const v: View = { root, body, ring, bar, kind: e.kind, lastHp: -1, lastSel: false, lastFacing: NaN, lastStranded: false };
    const [c1, c2] = colorOf(this.colors, e.owner);
    if (e.kind === 'unit') {
      const naval = e.moveClass !== 'foot';
      const r = naval ? 10 + e.radius * 18 : 9;
      ring.ellipse(0, 0, r + 4, (r + 4) / 2).stroke({ color: 0x7CFC00, width: 2 });
      if (naval) this.drawShip(v, e);
      else {
        const def = this.data.units.get(e.type)!;
        const hero = def.traits.includes('hero');
        body.ellipse(0, 0, 8, 4).fill({ color: 0x000000, alpha: 0.25 });
        body.roundRect(-7, -22, 14, 20, 4).fill(c1).stroke({ color: hero ? 0xffd700 : c2, width: hero ? 2.5 : 1.5 });
        const glyph = new Text({ text: t(def.nameKey).slice(0, 1), style: { fontSize: 11, fill: 0xffffff, fontWeight: 'bold' } });
        glyph.anchor.set(0.5);
        glyph.position.set(0, -12);
        root.addChild(glyph);
      }
    } else if (e.kind === 'building') {
      this.drawBuilding(v, e, c1, c2);
    } else {
      // Deer herd.
      for (const [dx, dy] of [[-6, -2], [5, -4], [0, 3]]) body.ellipse(dx, dy, 5, 3).fill(0x8b5a2b);
    }
    ring.visible = false;
    return v;
  }

  private drawShip(v: View, e: Entity) {
    const [c1, c2] = colorOf(this.colors, e.owner);
    const g = v.body;
    g.clear();
    const len = 14 + e.radius * 22;
    const wid = len * 0.32;
    // Hull outline in tile space, rotated by facing, then projected.
    const a = e.facing ?? 0;
    const pts: [number, number][] = [[len * 0.55, 0], [len * 0.2, wid * 0.5], [-len * 0.45, wid * 0.45], [-len * 0.45, -wid * 0.45], [len * 0.2, -wid * 0.5]];
    const proj = pts.flatMap(([px, py]) => {
      const rx = px * Math.cos(a) - py * Math.sin(a);
      const ry = px * Math.sin(a) + py * Math.cos(a);
      return [(rx - ry) * 0.7, (rx + ry) * 0.35];
    });
    g.poly(proj).fill(e.stranded ? 0x6d5a3a : 0x5b3a1e).stroke({ color: c2, width: 1.5 });
    g.rect(-2, -len * 0.7, 3, len * 0.7).fill(0x3b2a1a);
    g.poly([1, -len * 0.68, len * 0.35, -len * 0.45, 1, -len * 0.22]).fill(c1);
  }

  private drawBuilding(v: View, e: Entity, c1: number, c2: number) {
    const g = v.body;
    const w = e.w!;
    const h = e.h!;
    // Footprint corners relative to the centre.
    const c = toScreen(e.x, e.y);
    const corner = (tx: number, ty: number) => {
      const p = toScreen(tx, ty);
      return [p.x - c.x, p.y - c.y];
    };
    const [nx, ny] = corner(e.tx!, e.ty!);
    const [ex, ey] = corner(e.tx! + w, e.ty!);
    const [sx, sy] = corner(e.tx! + w, e.ty! + h);
    const [wx, wy] = corner(e.tx!, e.ty! + h);
    const H = (BUILDING_HEIGHT[e.type] ?? 18) * (e.built !== undefined && e.built < 1 ? 0.3 + 0.7 * e.built : 1);
    if (e.type === 'farm') {
      g.poly([nx, ny, ex, ey, sx, sy, wx, wy]).fill(0xc8b45a).stroke({ color: 0x7a6a2a, width: 1 });
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        g.moveTo(nx + (wx - nx) * f, ny + (wy - ny) * f).lineTo(ex + (sx - ex) * f, ey + (sy - ey) * f);
      }
      g.stroke({ color: 0x8a7a3a, width: 1 });
      return;
    }
    const inset = 0.12;
    const lerp = (a: number, b: number) => a + (b - a) * inset;
    const top = [lerp(nx, sx), lerp(ny, sy) - H, lerp(ex, wx), lerp(ey, wy) - H, lerp(sx, nx), lerp(sy, ny) - H, lerp(wx, ex), lerp(wy, ey) - H];
    const base = [lerp(nx, sx), lerp(ny, sy), lerp(ex, wx), lerp(ey, wy), lerp(sx, nx), lerp(sy, ny), lerp(wx, ex), lerp(wy, ey)];
    // Left and right visible walls, then roof.
    g.poly([base[6], base[7], base[4], base[5], top[4], top[5], top[6], top[7]]).fill(shade(c2, 1.1));
    g.poly([base[4], base[5], base[2], base[3], top[2], top[3], top[4], top[5]]).fill(shade(c2, 0.8));
    g.poly(top).fill(e.built !== undefined && e.built < 1 ? 0x9a8a6a : c1).stroke({ color: 0x1a1a1a, width: 1 });
    v.ring.poly([nx, ny, ex, ey, sx, sy, wx, wy]).stroke({ color: 0x7CFC00, width: 2 });
    if (w >= 3) {
      const label = new Text({ text: t(this.data.buildings.get(e.type)?.nameKey ?? e.type), style: { fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5);
      label.position.set(0, -H - TILE_H / 2);
      v.root.addChild(label);
      v.label = label;
    }
  }

  private drawBar(v: View, e: Entity, sel: boolean) {
    const g = v.bar;
    g.clear();
    if (!sel && e.hp >= e.maxHp) return;
    const w = e.kind === 'building' ? 40 : 22;
    const yOff = e.kind === 'building' ? -(BUILDING_HEIGHT[e.type] ?? 18) - 28 : e.moveClass !== 'foot' ? -34 : -30;
    const f = Math.max(0, e.hp / e.maxHp);
    g.rect(-w / 2, yOff, w, 4).fill(0x000000);
    g.rect(-w / 2, yOff, w * f, 4).fill(f > 0.5 ? 0x4caf50 : f > 0.25 ? 0xffc107 : 0xf44336);
  }
}

function shade(hex: number, f: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}
