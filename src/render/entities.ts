// Placeholder entity rendering: coloured shapes + a glyph (spec §9.3 allows geometry until stage 8).
import { Container, Graphics, Text } from 'pixi.js';
import type { Entity, SimData } from '../sim/types';
import type { World } from '../sim/world';
import { hasKey, t } from '../ui/i18n';
import { colorOf, ownerColors } from './colors';
import { TILE_H, toScreen } from './iso';
import { drawFigure, drawGun, drawShipArt, drawVehicle } from './art';
import { BUILDING_TOP, drawBuildingArt } from './buildings';

interface View {
  root: Container;
  body: Graphics;
  ring: Graphics;
  bar: Graphics;
  label?: Text;
  kind: Entity['kind'];
  lastHp: number;
  lastFacing: number;
  lastStranded: boolean;
  /** Construction progress the building was last drawn at (in fifths). */
  lastBuilt: number;
  /** Foot soldiers bob as they walk (cheat vehicles do not). */
  walker: boolean;
  /** See-through copy drawn over the trees while the unit stands behind them. */
  ghost?: Graphics;
}

/** Opacity of a unit's silhouette over the trees that hide it. */
const GHOST_ALPHA = 0.4;

export class EntityRenderer {
  readonly layer = new Container();
  /** Above the depth-sorted layer: selection rings, health bars and silhouettes stay visible in a forest. */
  readonly overhead = new Container();
  private views = new Map<number, View>();
  private colors: Map<string, [number, number]>;
  /** Entities hidden by fog of war (set by the fog renderer); not drawn. */
  hidden: (e: Entity) => boolean = () => false;
  private colorblind = false;
  private cover?: { mask: Uint8Array; width: number };

  /** Tiles where tall props can hide a unit (from the terrain builder). */
  setCover(mask: Uint8Array, width: number) {
    this.cover = { mask, width };
  }

  private covered(x: number, y: number) {
    const c = this.cover;
    return !!c && x >= 0 && y >= 0 && x < c.width && !!c.mask[Math.floor(y) * c.width + Math.floor(x)];
  }

  private drop(v: View) {
    v.root.destroy({ children: true });
    v.ring.destroy();
    v.bar.destroy();
    v.ghost?.destroy();
  }

  /** Colour-blind mode adds a faction-specific flag shape to every unit (spec §9.3). */
  setColorblind(on: boolean) {
    if (on === this.colorblind) return;
    this.colorblind = on;
    for (const v of this.views.values()) this.drop(v);
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
    this.overhead.eventMode = 'none';
    this.colors = ownerColors(data);
  }

  /** Playable factions of the current world (for colour-blind flag shapes). */
  private playable: string[] = [];

  sync(world: World, alpha: number, selected: Set<number>) {
    this.playable = world.playable;
    const now = performance.now();
    const seen = new Set<number>();
    for (const e of world.all()) {
      if (e.insideOf) continue;
      seen.add(e.id);
      let v = this.views.get(e.id);
      if (!v) {
        v = this.create(e);
        this.views.set(e.id, v);
        this.layer.addChild(v.root);
        this.overhead.addChild(v.ring, v.bar);
      }
      const x = e.px + (e.x - e.px) * alpha;
      const y = e.py + (e.y - e.py) * alpha;
      const p = toScreen(x, y);
      v.root.position.set(p.x, p.y);
      v.root.zIndex = e.kind === 'building' ? (e.tx! + e.w! + e.ty! + e.h!) - 1 : x + y;
      v.root.visible = !this.hidden(e);
      v.ring.position.set(p.x, p.y);
      v.bar.position.set(p.x, p.y);
      v.bar.visible = v.root.visible;
      if (e.kind === 'building') {
        const b = e.built === undefined ? 1 : Math.floor(e.built * 5) / 5;
        if (b !== v.lastBuilt) {
          // Buildings are hundreds of small shapes: draw once into a texture rather than re-batching every frame.
          v.body.cacheAsTexture(false);
          v.body.clear();
          drawBuildingArt(v.body, e.type, e.w!, ...colorOf(this.colors, e.owner), b);
          v.body.cacheAsTexture({ resolution: 2, antialias: true });
          v.lastBuilt = b;
        }
      }
      const sel = selected.has(e.id);
      // Cheat vehicles face where they drive (screen x grows with x − y); the 發財 plate stays readable.
      if (e.kind === 'unit' && e.moveClass === 'foot' && this.data.units.get(e.type)!.traits.includes('cheat')) {
        const dx = e.x - e.px - (e.y - e.py);
        if (Math.abs(dx) > 1e-3) {
          const s = dx < 0 ? -1 : 1;
          v.body.scale.x = s;
          for (const c of v.body.children) {
            c.scale.x = s;
            c.x = s > 0 ? -17 : -5;
          }
        }
      }
      if (v.walker) {
        // Walking: a small bob and sway while the unit moved this tick.
        const moving = Math.abs(e.x - e.px) + Math.abs(e.y - e.py) > 1e-4;
        const ph = now * 0.012 + e.id * 1.7;
        v.body.y = moving ? -Math.abs(Math.sin(ph)) * 1.6 : 0;
        v.body.rotation = moving ? Math.sin(ph) * 0.05 : 0;
      }
      if (v.walker && v.root.visible && this.covered(x, y)) {
        // Behind the trees: a faint copy of the figure (sharing its drawing) shows through them.
        if (!v.ghost) {
          v.ghost = new Graphics(v.body.context);
          v.ghost.alpha = GHOST_ALPHA;
          this.overhead.addChildAt(v.ghost, 0);
        }
        v.ghost.visible = true;
        v.ghost.position.set(p.x, p.y + v.body.y);
        v.ghost.rotation = v.body.rotation;
      } else if (v.ghost) v.ghost.visible = false;
      if (e.kind === 'unit' && (e.facing !== v.lastFacing || e.stranded !== v.lastStranded) && e.moveClass !== 'foot') {
        this.drawShip(v, e);
        v.lastFacing = e.facing ?? 0;
        v.lastStranded = !!e.stranded;
      }
      v.ring.visible = sel && v.root.visible;
      if (e.hp !== v.lastHp || sel) {
        this.drawBar(v, e, sel);
        v.lastHp = e.hp;
      }
    }
    for (const [id, v] of this.views)
      if (!seen.has(id)) {
        this.drop(v);
        this.views.delete(id);
      }
  }

  private create(e: Entity): View {
    const root = new Container();
    const ring = new Graphics();
    const body = new Graphics();
    const bar = new Graphics();
    if (e.kind === 'unit' && e.moveClass === 'foot') {
      // A shadow to stand on, rimmed in the owner's colour so mixed melees stay readable.
      body.ellipse(0, 0, 8, 3.4).fill({ color: 0x000000, alpha: 0.28 }).stroke({ color: colorOf(this.colors, e.owner)[0], width: 1.2, alpha: 0.75 });
    }
    root.addChild(body);
    const v: View = { root, body, ring, bar, kind: e.kind, lastHp: -1, lastFacing: NaN, lastStranded: false, lastBuilt: -1, walker: false };
    const [c1, c2] = colorOf(this.colors, e.owner);
    if (e.kind === 'unit') {
      const naval = e.moveClass !== 'foot';
      const r = naval ? 10 + e.radius * 18 : 9;
      ring.ellipse(0, 0, r + 4, (r + 4) / 2).stroke({ color: 0x7CFC00, width: 2 });
      if (naval) this.drawShip(v, e);
      else {
        const def = this.data.units.get(e.type)!;
        if (def.traits.includes('cheat')) {
          drawVehicle(body, e.type, c1);
          if (e.type === 'fatsai_truck') {
            const plate = new Text({ text: t('art.fatsai'), style: { fontSize: 7, fill: 0xb22222, fontWeight: 'bold' }, resolution: 4 });
            plate.position.set(-17, -15.5);
            body.addChild(plate);
          }
        } else if (def.class === 'siege') drawGun(body, e.type, c1);
        else drawFigure(body, e.type, c1, c2, def.traits.includes('hero'));
        v.walker = !def.traits.includes('cheat') && def.class !== 'siege';
      }
    } else if (e.kind === 'building') {
      this.drawBuilding(v, e);
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

  private drawBuilding(v: View, e: Entity) {
    const w = e.w!;
    const h = e.h!;
    // Footprint corners relative to the centre, for the selection ring.
    const c = toScreen(e.x, e.y);
    const corner = (tx: number, ty: number) => {
      const p = toScreen(tx, ty);
      return [p.x - c.x, p.y - c.y];
    };
    const [nx, ny] = corner(e.tx!, e.ty!);
    const [ex, ey] = corner(e.tx! + w, e.ty!);
    const [sx, sy] = corner(e.tx! + w, e.ty! + h);
    const [wx, wy] = corner(e.tx!, e.ty! + h);
    v.ring.poly([nx, ny, ex, ey, sx, sy, wx, wy]).stroke({ color: 0x7CFC00, width: 2 });
    const named = !!e.tag && hasKey(`place.${e.tag}`);
    if (w >= 3 || named) {
      // Named places (牡丹社, 射寮, 馬赫坡駐在所…) show their own name, whatever their size.
      const name = named ? t(`place.${e.tag}`) : t(this.data.buildings.get(e.type)?.nameKey ?? e.type);
      const label = new Text({ text: name, style: { fontSize: 12, fill: 0xffffff, stroke: { color: 0x000000, width: 3 } } });
      label.anchor.set(0.5);
      label.position.set(0, -topOf(e.type) - TILE_H / 2);
      v.root.addChild(label);
      v.label = label;
    }
  }

  private drawBar(v: View, e: Entity, sel: boolean) {
    const g = v.bar;
    g.clear();
    if (!sel && e.hp >= e.maxHp) return;
    const w = e.kind === 'building' ? 40 : 22;
    const yOff = e.kind === 'building' ? -topOf(e.type) - 28 : e.moveClass !== 'foot' ? -34 : -30;
    const f = Math.max(0, e.hp / e.maxHp);
    g.rect(-w / 2, yOff, w, 4).fill(0x000000);
    g.rect(-w / 2, yOff, w * f, 4).fill(f > 0.5 ? 0x4caf50 : f > 0.25 ? 0xffc107 : 0xf44336);
  }
}

const topOf = (type: string) => BUILDING_TOP[type] ?? 30;

