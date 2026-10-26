// Placeholder entity rendering: coloured shapes + a glyph (spec §9.3 allows geometry until stage 8).
import { Container, Graphics, Text } from 'pixi.js';
import type { Entity, SimData } from '../sim/types';
import type { World } from '../sim/world';
import { hasKey, t } from '../ui/i18n';
import { colorOf, ownerColors } from './colors';
import { TILE_H, toScreen } from './iso';
import { crenellate, drawFigure, drawGun, drawShipArt } from './art';

const FORTS = new Set(['zeelandia_castle', 'bastion', 'utrecht_redoubt', 'provintia_fort', 'lower_town_wall']);
/** Indigenous villages: a thatched pyramid roof over low walls. */
const HUTS = new Set(['paiwan_village', 'truku_village', 'sdq_village']);
/** Japanese police posts and offices: white walls under a grey tiled hip roof. */
const POSTS = new Set(['jp14_post', 'jp14_camp', 'sdq_post', 'sdq_branch', 'wushe_school']);

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
  // Earthworks, not walls.
  trench: 4,
};

export class EntityRenderer {
  readonly layer = new Container();
  private views = new Map<number, View>();
  private colors: Map<string, [number, number]>;
  /** Entities hidden by fog of war (set by the fog renderer); not drawn. */
  hidden: (e: Entity) => boolean = () => false;
  private colorblind = false;

  /** Colour-blind mode adds a faction-specific flag shape to every unit (spec §9.3). */
  setColorblind(on: boolean) {
    if (on === this.colorblind) return;
    this.colorblind = on;
    for (const v of this.views.values()) v.root.destroy({ children: true });
    this.views.clear();
  }

  private marker(owner: string): Graphics {
    const g = new Graphics();
    g.moveTo(0, -26).lineTo(0, -38).stroke({ color: 0x222222, width: 1.5 });
    // First side of the scenario: pennant; second side: banded square flag.
    const side = this.playable.indexOf(owner);
    if (side === 0) g.poly([0, -38, 12, -34, 0, -30]).fill(0xffffff).stroke({ color: 0x000000, width: 1 });
    else if (side === 1) g.rect(0, -38, 11, 7).fill(0xffffff).stroke({ color: 0x000000, width: 1 }).rect(0, -35.5, 11, 2).fill(0x000000);
    else if (owner.startsWith('village_')) g.circle(5, -34, 4).fill(0xffffff).stroke({ color: 0x000000, width: 1 });
    else g.poly([5, -39, 10, -34, 5, -29, 0, -34]).fill(0xffffff).stroke({ color: 0x000000, width: 1 });
    return g;
  }

  constructor(private readonly data: SimData) {
    this.layer.sortableChildren = true;
    this.colors = ownerColors(data);
  }

  /** Playable factions of the current world (for colour-blind flag shapes). */
  private playable: string[] = [];

  sync(world: World, alpha: number, selected: Set<number>) {
    this.playable = world.playable;
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
        if (def.class === 'siege') drawGun(body, e.type, c1);
        else drawFigure(body, e.type, c1, c2, def.traits.includes('hero'));
      }
    } else if (e.kind === 'building') {
      this.drawBuilding(v, e, c1, c2);
    } else {
      // Deer herd.
      for (const [dx, dy] of [[-6, -2], [5, -4], [0, 3]]) body.ellipse(dx, dy, 5, 3).fill(0x8b5a2b);
    }
    if (this.colorblind && e.kind === 'unit') root.addChild(this.marker(e.owner));
    ring.visible = false;
    return v;
  }

  private drawShip(v: View, e: Entity) {
    const [c1, c2] = colorOf(this.colors, e.owner);
    const g = v.body;
    g.clear();
    // Junk ~96 px, warship ~128 px long (spec §9.3), scaled by hull radius.
    const len = 20 + e.radius * 34;
    drawShipArt(g, e.type, e.facing ?? 0, len, c1, c2, !!e.stranded);
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
    const wall = POSTS.has(e.type) ? 0xe8e2d4 : HUTS.has(e.type) ? 0x8a6a42 : c2;
    g.poly([base[6], base[7], base[4], base[5], top[4], top[5], top[6], top[7]]).fill(shade(wall, 1.1));
    g.poly([base[4], base[5], base[2], base[3], top[2], top[3], top[4], top[5]]).fill(shade(wall, 0.8));
    if (HUTS.has(e.type) || POSTS.has(e.type)) {
      // Pyramid (thatch) or hip (tile) roof rising from the wall tops; a strip of the side colour on the eaves.
      const ax = (top[0] + top[4]) / 2;
      const ay = (top[1] + top[5]) / 2 - H * (HUTS.has(e.type) ? 1.1 : 0.7);
      const roof = HUTS.has(e.type) ? 0xb08a4a : 0x55595e;
      g.poly([top[0], top[1], top[2], top[3], ax, ay]).fill(shade(roof, 0.75));
      g.poly([top[6], top[7], top[0], top[1], ax, ay]).fill(shade(roof, 0.9));
      g.poly([top[6], top[7], top[4], top[5], ax, ay]).fill(shade(roof, 1.1)).stroke({ color: 0x1a1a1a, width: 1 });
      g.poly([top[4], top[5], top[2], top[3], ax, ay]).fill(shade(roof, 0.85)).stroke({ color: 0x1a1a1a, width: 1 });
      g.moveTo(top[6], top[7]).lineTo(top[4], top[5]).lineTo(top[2], top[3]).stroke({ color: c1, width: 2 });
    } else g.poly(top).fill(e.built !== undefined && e.built < 1 ? 0x9a8a6a : c1).stroke({ color: 0x1a1a1a, width: 1 });
    if (FORTS.has(e.type) && (e.built ?? 1) >= 1) crenellate(g, top, shade(c2, 0.9));
    if (e.type === 'battery' || e.type === 'trench') g.poly(top).fill({ color: 0x6b5a3a, alpha: 0.6 });
    v.ring.poly([nx, ny, ex, ey, sx, sy, wx, wy]).stroke({ color: 0x7CFC00, width: 2 });
    const named = !!e.tag && hasKey(`place.${e.tag}`);
    if (w >= 3 || named) {
      // Named places (牡丹社, 射寮, 馬赫坡駐在所…) show their own name, whatever their size.
      const name = named ? t(`place.${e.tag}`) : t(this.data.buildings.get(e.type)?.nameKey ?? e.type);
      const label = new Text({ text: name, style: { fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
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
