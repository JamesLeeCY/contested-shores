// Building art (spec §9.3): each type is composed from a small isometric kit (boxes, roofs, walls,
// tents, flags) inside its square footprint. Materials are natural (brick, stone, thatch, canvas);
// the owner's colour shows on flags, trims and tent stripes so ownership stays readable.
import type { Graphics } from 'pixi.js';

const DARK = 0x1f1a14;
const EDGE = { color: DARK, width: 1, alpha: 0.55 };

export function shade(hex: number, f: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

// Materials.
const BRICK = 0xa0553b;
const DUTCH_BRICK = 0x9a5a40;
const STONE = 0xa39d8c;
const GREY_BRICK = 0x8f8a7e;
const RED_TILE = 0xa8452f;
const GREY_TILE = 0x5c6066;
const WHITE_WALL = 0xe9e3d3;
const PLASTER = 0xd8cdb3;
const TIMBER = 0x7a5634;
const THATCH = 0xb48d4c;
const SLATE = 0x5e605c;
const CANVAS = 0xe4dcc4;
const EARTH = 0x8c7550;
const SANDBAG = 0xb7a47a;

/** Drawing kit in footprint tile coordinates: (0, 0) is the north corner, (S, S) the south one. */
class Kit {
  constructor(
    readonly g: Graphics,
    readonly S: number,
  ) {}

  p(x: number, y: number, z = 0): [number, number] {
    return [(x - y) * 32, (x + y - this.S) * 16 - z];
  }

  quad(a: [number, number], b: [number, number], c: [number, number], d: [number, number], color: number, edge = true) {
    this.g.poly([...a, ...b, ...c, ...d]).fill(color);
    if (edge) this.g.stroke(EDGE);
  }

  tri(a: [number, number], b: [number, number], c: [number, number], color: number) {
    this.g.poly([...a, ...b, ...c]).fill(color).stroke(EDGE);
  }

  /** Flat footprint patch (yards, platforms, fields). */
  ground(x: number, y: number, w: number, h: number, color: number, z = 0) {
    const p = this.p.bind(this);
    this.quad(p(x, y, z), p(x + w, y, z), p(x + w, y + h, z), p(x, y + h, z), color, false);
  }

  /** A box: its two visible walls (lit from the left) and, if `top` is given, a flat top. */
  box(x: number, y: number, w: number, h: number, z0: number, H: number, wall: number, top?: number) {
    const p = this.p.bind(this);
    const z1 = z0 + H;
    this.quad(p(x, y + h, z0), p(x + w, y + h, z0), p(x + w, y + h, z1), p(x, y + h, z1), shade(wall, 1.05));
    this.quad(p(x + w, y + h, z0), p(x + w, y, z0), p(x + w, y, z1), p(x + w, y + h, z1), shade(wall, 0.76));
    if (top !== undefined) this.quad(p(x, y, z1), p(x + w, y, z1), p(x + w, y + h, z1), p(x, y + h, z1), top);
  }

  /** Merlons round the rim of a flat top: the back edges first, then the two front ones. */
  crenels(x: number, y: number, w: number, h: number, z: number, color: number) {
    const s = 0.16;
    const top = shade(color, 1.15);
    const run = (n: number, at: (t: number) => [number, number]) => {
      for (let k = 0; k <= n; k++) {
        const [mx, my] = at(k / n);
        this.box(mx, my, s, s, z, 4, color, top);
      }
    };
    const nx = Math.max(1, Math.round(w / 0.36));
    const ny = Math.max(1, Math.round(h / 0.36));
    run(nx, (t) => [x + (w - s) * t, y]);
    run(ny, (t) => [x, y + (h - s) * t]);
    run(ny, (t) => [x + w - s, y + (h - s) * t]);
    run(nx, (t) => [x + (w - s) * t, y + h - s]);
  }

  /** Gable roof over a box, ridge along x or y; `swallow` turns the ridge ends up (燕尾脊). */
  gable(x: number, y: number, w: number, h: number, z: number, rise: number, roof: number, wall: number, axis: 'x' | 'y', swallow = false) {
    const p = this.p.bind(this);
    const o = 0.1;
    const g = this.g;
    if (axis === 'x') {
      const ym = y + h / 2;
      const r0 = p(x - o, ym, z + rise);
      const r1 = p(x + w + o, ym, z + rise);
      this.quad(p(x - o, y - o, z), p(x + w + o, y - o, z), r1, r0, shade(roof, 0.7));
      this.tri(p(x + w, y, z), p(x + w, y + h, z), p(x + w, ym, z + rise), shade(wall, 0.76));
      this.quad(r0, r1, p(x + w + o, y + h + o, z), p(x - o, y + h + o, z), shade(roof, 1.08));
      if (swallow) {
        const t0 = p(x - o - 0.1, ym, z + rise + 4);
        const t1 = p(x + w + o + 0.1, ym, z + rise + 4);
        g.moveTo(...t0).quadraticCurveTo(...p(x + 0.1, ym, z + rise), ...p(x + w / 2, ym, z + rise)).quadraticCurveTo(...p(x + w - 0.1, ym, z + rise), ...t1);
        g.stroke({ color: shade(roof, 0.6), width: 2.2 });
      } else g.moveTo(...r0).lineTo(...r1).stroke({ color: shade(roof, 0.6), width: 1.6 });
    } else {
      const xm = x + w / 2;
      const r0 = p(xm, y - o, z + rise);
      const r1 = p(xm, y + h + o, z + rise);
      this.quad(p(x - o, y - o, z), r0, r1, p(x - o, y + h + o, z), shade(roof, 1.1));
      this.tri(p(x, y + h, z), p(x + w, y + h, z), p(xm, y + h, z + rise), shade(wall, 1.05));
      this.quad(r0, p(x + w + o, y - o, z), p(x + w + o, y + h + o, z), r1, shade(roof, 0.74));
      if (swallow) {
        const t0 = p(xm, y - o - 0.1, z + rise + 4);
        const t1 = p(xm, y + h + o + 0.1, z + rise + 4);
        g.moveTo(...t0).quadraticCurveTo(...p(xm, y + 0.1, z + rise), ...p(xm, y + h / 2, z + rise)).quadraticCurveTo(...p(xm, y + h - 0.1, z + rise), ...t1);
        g.stroke({ color: shade(roof, 0.6), width: 2.2 });
      } else g.moveTo(...r0).lineTo(...r1).stroke({ color: shade(roof, 0.6), width: 1.6 });
    }
  }

  /** Hip or pyramid roof (a pyramid when the ridge length is 0). */
  hip(x: number, y: number, w: number, h: number, z: number, rise: number, roof: number) {
    const p = this.p.bind(this);
    const o = 0.1;
    const a = p(x - o, y - o, z);
    const b = p(x + w + o, y - o, z);
    const c = p(x + w + o, y + h + o, z);
    const d = p(x - o, y + h + o, z);
    const long = w >= h;
    const inset = Math.min(w, h) / 2;
    const r0 = long ? p(x + inset, y + h / 2, z + rise) : p(x + w / 2, y + inset, z + rise);
    const r1 = long ? p(x + w - inset, y + h / 2, z + rise) : p(x + w / 2, y + h - inset, z + rise);
    // Back faces first, then the two front ones.
    this.quad(a, b, long ? r1 : r0, long ? r0 : r0, shade(roof, 0.75));
    this.quad(d, a, r0, long ? r0 : r1, shade(roof, 1.12));
    this.quad(b, c, r1, long ? r1 : r0, shade(roof, 0.8));
    this.quad(c, d, long ? r0 : r1, r1, shade(roof, 1.0));
  }

  /** A ridge tent standing on the ground. */
  tent(x: number, y: number, w: number, h: number, H: number, cloth: number, trim: number, axis: 'x' | 'y' = 'x') {
    this.gable(x, y, w, h, 0, H, cloth, cloth, axis);
    const p = this.p.bind(this);
    if (axis === 'x') this.g.moveTo(...p(x, y + h + 0.1, 1.5)).lineTo(...p(x + w, y + h + 0.1, 1.5)).stroke({ color: trim, width: 2 });
    else this.g.moveTo(...p(x + w + 0.1, y, 1.5)).lineTo(...p(x + w + 0.1, y + h, 1.5)).stroke({ color: trim, width: 2 });
  }

  /** Flagpole with a banner in the owner's colour. */
  flag(x: number, y: number, z: number, H: number, color: number) {
    const [bx, by] = this.p(x, y, z);
    this.g.moveTo(bx, by).lineTo(bx, by - H - 4).stroke({ color: 0x3a2a1a, width: 1.8 });
    this.g.poly([bx, by - H - 4, bx + 15, by - H, bx, by - H + 5]).fill(color).stroke({ color: DARK, width: 0.8 });
  }

  /** Row of palisade stakes along a line. */
  stakes(x0: number, y0: number, x1: number, y1: number, H: number, color: number) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) * 5));
    for (let k = 0; k <= n; k++) {
      const [sx, sy] = this.p(x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n);
      this.g.moveTo(sx, sy).lineTo(sx, sy - H).stroke({ color, width: 2 });
      this.g.circle(sx, sy - H, 1).fill(shade(color, 0.7));
    }
  }

  cannon(x: number, y: number, z: number) {
    const [cx, cy] = this.p(x, y, z);
    this.g.moveTo(cx - 6, cy + 2).lineTo(cx + 6, cy - 3).stroke({ color: 0x2b2b2b, width: 3 });
    this.g.circle(cx - 3, cy + 2, 2).fill(TIMBER);
  }

  /** Small windows along the front-left wall of a box. */
  windows(x: number, y: number, w: number, h: number, z: number, n: number, color = 0x3a3a3a) {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const [wx, wy] = this.p(x + w * t, y + h, z);
      this.g.rect(wx - 2, wy - 3, 4, 5).fill(color);
    }
  }
}

/** Chinese city wall: back walls, the inside (callback), then front walls with a gate tower. */
function cityWall(k: Kit, S: number, H: number, c1: number, inner: () => void) {
  const t = 0.35;
  const top = shade(GREY_BRICK, 1.15);
  k.box(0, 0, S, t, 0, H, GREY_BRICK, top);
  k.box(0, t, t, S - t, 0, H, GREY_BRICK, top);
  inner();
  k.box(S - t, t, t, S - t, 0, H, GREY_BRICK, top);
  const gx = S / 2 - 0.45;
  k.box(t, S - t, gx - t, t, 0, H, GREY_BRICK, top);
  k.box(gx + 0.9, S - t, S - t - gx - 0.9, t, 0, H, GREY_BRICK, top);
  // Gate tower (城樓): red pillars under a grey tiled roof over the gate.
  k.box(gx - 0.1, S - t - 0.15, 1.1, t + 0.3, 0, H + 2, GREY_BRICK, top);
  k.box(gx + 0.05, S - t - 0.05, 0.8, t + 0.1, H + 2, 9, 0x9c3a2a);
  k.gable(gx - 0.05, S - t - 0.15, 0.9, t + 0.3, H + 11, 8, GREY_TILE, 0x9c3a2a, 'x', true);
  k.flag(gx + 0.45, S - t / 2, H + 19, 12, c1);
}

/** Dutch-style fort: brick curtain walls, pointed corner bastions, an inner house, the flag. */
function dutchFort(k: Kit, S: number, H: number, c1: number, house: boolean) {
  const t = 0.4;
  const b = Math.min(1.2, S * 0.24);
  const top = shade(STONE, 1.1);
  k.ground(0, 0, S, S, shade(STONE, 0.9));
  // Back walls and bastion.
  k.box(-0.15, -0.15, b, b, 0, H + 4, DUTCH_BRICK, top);
  k.crenels(-0.15, -0.15, b, b, H + 4, DUTCH_BRICK);
  k.box(b, 0, S - 2 * b, t, 0, H, DUTCH_BRICK, top);
  k.box(0, b, t, S - 2 * b, 0, H, DUTCH_BRICK, top);
  k.box(S - b + 0.15, -0.15, b, b, 0, H + 4, DUTCH_BRICK, top);
  k.crenels(S - b + 0.15, -0.15, b, b, H + 4, DUTCH_BRICK);
  k.box(-0.15, S - b + 0.15, b, b, 0, H + 4, DUTCH_BRICK, top);
  k.crenels(-0.15, S - b + 0.15, b, b, H + 4, DUTCH_BRICK);
  if (house) {
    const m = S * 0.3;
    k.box(m, m, S - 2 * m, S - 2 * m, 0, H + 8, PLASTER);
    k.windows(m, m, S - 2 * m, S - 2 * m, H, 3);
    k.hip(m, m, S - 2 * m, S - 2 * m, H + 8, 12, RED_TILE);
  }
  k.flag(S / 2, S / 2, house ? H + 20 : H, 16, c1);
  k.box(S - t, b, t, S - 2 * b, 0, H, DUTCH_BRICK, top);
  k.box(b, S - t, S - 2 * b, t, 0, H, DUTCH_BRICK, top);
  k.box(S - b + 0.15, S - b + 0.15, b, b, 0, H + 4, DUTCH_BRICK, top);
  k.crenels(S - b + 0.15, S - b + 0.15, b, b, H + 4, DUTCH_BRICK);
}

/** Qing / Formosa fort: thick low brick-and-earth walls, a barracks hall inside, guns on the front. */
function qingFort(k: Kit, S: number, H: number, c1: number) {
  const t = 0.45;
  const top = EARTH;
  k.ground(0, 0, S, S, shade(EARTH, 1.1));
  k.box(0, 0, S, t, 0, H, GREY_BRICK, top);
  k.box(0, t, t, S - t, 0, H, GREY_BRICK, top);
  k.box(S * 0.3, S * 0.3, S * 0.4, S * 0.3, 0, 12, PLASTER);
  k.gable(S * 0.3, S * 0.3, S * 0.4, S * 0.3, 12, 8, GREY_TILE, PLASTER, 'x', true);
  k.flag(S * 0.25, S * 0.25, H, 18, c1);
  k.box(S - t, t, t, S - t, 0, H, GREY_BRICK, top);
  k.box(t, S - t, S - 2 * t, t, 0, H, GREY_BRICK, top);
  k.cannon(S - t / 2, S * 0.5, H);
  k.cannon(S * 0.5, S - t / 2, H);
}

/** Earthen gun battery: sandbagged parapets in an L with a gun or two behind them. */
function battery(k: Kit, S: number, c1: number) {
  k.ground(0, 0, S, S, shade(EARTH, 1.05));
  k.cannon(S * 0.45, S * 0.45, 2);
  k.cannon(S * 0.7, S * 0.3, 2);
  k.box(S - 0.4, 0, 0.4, S, 0, 7, SANDBAG, shade(SANDBAG, 1.1));
  k.box(0, S - 0.4, S - 0.4, 0.4, 0, 7, SANDBAG, shade(SANDBAG, 1.1));
  k.flag(0.3, 0.3, 0, 16, c1);
}

/** A field camp: stakes round the edge, tents, a command tent and the flag. */
function camp(k: Kit, S: number, cloth: number, c1: number, n: number) {
  k.ground(0, 0, S, S, shade(EARTH, 1.15));
  k.stakes(0, 0, S, 0, 6, TIMBER);
  k.stakes(0, 0, 0, S, 6, TIMBER);
  const spots: [number, number][] = [];
  const cells = Math.ceil(Math.sqrt(n + 1));
  const c = (S - 0.6) / cells;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) if (spots.length < n + 1) spots.push([0.3 + i * c, 0.3 + j * c]);
  const [hx, hy] = spots.pop()!;
  for (const [x, y] of spots) k.tent(x + c * 0.15, y + c * 0.2, c * 0.7, c * 0.5, 11, cloth, c1, (x + y) % 2 > 1 ? 'y' : 'x');
  k.box(hx + c * 0.1, hy + c * 0.1, c * 0.8, c * 0.7, 0, 5, cloth);
  k.gable(hx + c * 0.1, hy + c * 0.1, c * 0.8, c * 0.7, 5, 9, cloth, cloth, 'x');
  k.flag(hx + c * 0.5, hy + c * 0.1, 14, 12, c1);
  k.stakes(S, 0, S, S, 6, TIMBER);
  k.stakes(0, S, S, S, 6, TIMBER);
}

/** 三合院: a main hall at the back and two wings round a courtyard, red tile with swallowtail ridges. */
function courtyardHouse(k: Kit, x: number, y: number, s: number, c1: number) {
  const d = s * 0.32;
  k.ground(x, y, s, s, 0xb9a57a);
  k.box(x, y, s, d, 0, 11, BRICK);
  k.gable(x, y, s, d, 11, 9, RED_TILE, BRICK, 'x', true);
  k.box(x, y + d, d, s - d, 0, 9, BRICK);
  k.gable(x, y + d, d, s - d, 9, 7, RED_TILE, BRICK, 'y', true);
  k.box(x + s - d, y + d, d, s - d, 0, 9, BRICK);
  k.gable(x + s - d, y + d, d, s - d, 9, 7, RED_TILE, BRICK, 'y', true);
  k.flag(x + s / 2, y + s * 0.55, 0, 14, c1);
}

/** Long hall with a gable roof (barracks, warehouses, workshops). */
function hall(k: Kit, x: number, y: number, w: number, h: number, H: number, wall: number, roof: number, swallow: boolean, windows = 0) {
  k.box(x, y, w, h, 0, H, wall);
  if (windows) k.windows(x, y, w, h, H * 0.35, windows);
  k.gable(x, y, w, h, H, Math.min(w, h) * 13, roof, wall, w >= h ? 'x' : 'y', swallow);
}

/** Paiwan slate house: low stone walls under a dark slate roof. */
function slateHouse(k: Kit, x: number, y: number, w: number, h: number) {
  k.box(x, y, w, h, 0, 6, SLATE);
  k.gable(x, y, w, h, 6, 6, shade(SLATE, 0.85), SLATE, w >= h ? 'x' : 'y');
}

/** Thatched house (lift 0) or granary on stilts (Truku, Seediq). */
function stiltHouse(k: Kit, x: number, y: number, w: number, h: number, lift: number) {
  const p = k.p.bind(k);
  for (const [px, py] of [
    [x + 0.1, y + h - 0.1],
    [x + w - 0.1, y + h - 0.1],
    [x + w - 0.1, y + 0.1],
  ]) {
    const [a, b] = p(px, py, 0);
    k.g.moveTo(a, b).lineTo(a, b - lift).stroke({ color: TIMBER, width: 2 });
  }
  k.box(x, y, w, h, lift, lift ? 7 : 4, 0x8a6a42);
  k.hip(x, y, w, h, lift + (lift ? 7 : 4), 8 + Math.min(w, h) * 14, THATCH);
}

function construction(k: Kit, S: number, built: number) {
  k.ground(0.1, 0.1, S - 0.2, S - 0.2, 0x9a8a6a);
  const H = 4 + 18 * built;
  const p = k.p.bind(k);
  for (const [x, y] of [
    [0.3, 0.3],
    [S - 0.3, 0.3],
    [0.3, S - 0.3],
    [S - 0.3, S - 0.3],
  ]) {
    const [a, b] = p(x, y);
    k.g.moveTo(a, b).lineTo(a, b - H).stroke({ color: TIMBER, width: 2 });
  }
  k.box(0.5, 0.5, S - 1, S - 1, 0, H * 0.6, 0xb79b6b);
  k.g.moveTo(...p(0.3, S - 0.3, H)).lineTo(...p(S - 0.3, S - 0.3, H)).lineTo(...p(S - 0.3, 0.3, H)).stroke({ color: TIMBER, width: 1.5 });
}

/** Building heights above the ground, for health bars and labels. */
export const BUILDING_TOP: Record<string, number> = {
  zeelandia_castle: 52,
  provintia_fort: 46,
  bastion: 30,
  utrecht_redoubt: 40,
  red_fort: 44,
  q87_tower: 46,
  walled_city: 40,
  farm: 2,
  trench: 6,
  lower_town_wall: 18,
};

/** Draw a building; `S` is the footprint size in tiles (width = height). */
export function drawBuildingArt(g: Graphics, type: string, S: number, c1: number, c2: number, built: number) {
  const k = new Kit(g, S);
  if (built < 1) return construction(k, S, built);
  switch (type) {
    case 'zeelandia_castle':
      return dutchFort(k, S, 22, c1, true);
    case 'provintia_fort':
      return dutchFort(k, S, 18, c1, true);
    case 'bastion':
      k.box(0.1, 0.1, S - 0.2, S - 0.2, 0, 20, DUTCH_BRICK, shade(STONE, 1.1));
      k.crenels(0.1, 0.1, S - 0.2, S - 0.2, 20, DUTCH_BRICK);
      k.cannon(S * 0.6, S * 0.6, 20);
      return k.flag(S * 0.3, S * 0.3, 20, 12, c1);
    case 'utrecht_redoubt':
      k.box(0.4, 0.4, S - 0.8, S - 0.8, 0, 28, DUTCH_BRICK, shade(STONE, 1.1));
      k.crenels(0.4, 0.4, S - 0.8, S - 0.8, 28, DUTCH_BRICK);
      return k.flag(S / 2, S / 2, 28, 12, c1);
    case 'red_fort':
      // 紅毛城 (Fort Santo Domingo): a square red tower.
      k.box(0.2, 0.2, S - 0.4, S - 0.4, 0, 30, 0xb04a32, shade(0xb04a32, 1.15));
      k.windows(0.2, 0.2, S - 0.4, S - 0.4, 16, 2);
      k.crenels(0.2, 0.2, S - 0.4, S - 0.4, 30, 0xb04a32);
      return k.flag(S / 2, S / 2, 30, 12, c1);
    case 'lower_town_wall':
      // Full-tile segments, so a row of them reads as one wall.
      k.box(0, 0, S, S, 0, 14, DUTCH_BRICK, shade(STONE, 1.1));
      return k.crenels(0, 0, S, S, 14, DUTCH_BRICK);
    case 'walled_city':
      return cityWall(k, S, 16, c1, () => {
        hall(k, 0.6, 0.6, 1.3, 0.9, 10, BRICK, RED_TILE, true);
        hall(k, 2.1, 0.6, 1.2, 0.9, 10, PLASTER, GREY_TILE, true);
        hall(k, 0.6, 1.8, 0.8, 1.2, 9, BRICK, RED_TILE, true);
        hall(k, 2.3, 1.9, 1.0, 0.9, 9, BRICK, RED_TILE, true);
      });
    case 'tn_fort':
    case 'fm_fort':
    case 'q84_fort':
      return qingFort(k, S, 12, c1);
    case 'battery':
    case 'tn_battery':
    case 'q84_battery':
      return battery(k, S, c1);
    case 'q87_tower': {
      // Wooden watchtower on a stone base.
      const m = S * 0.3;
      k.box(m, m, S - 2 * m, S - 2 * m, 0, 8, STONE);
      k.box(m + 0.05, m + 0.05, S - 2 * m - 0.1, S - 2 * m - 0.1, 8, 24, TIMBER);
      k.hip(m - 0.1, m - 0.1, S - 2 * m + 0.2, S - 2 * m + 0.2, 32, 10, GREY_TILE);
      return k.flag(S / 2, S / 2, 42, 10, c1);
    }
    case 'camp_zheng':
    case 'q84_camp':
      return camp(k, S, CANVAS, c1, S > 3 ? 4 : 3);
    case 'japan_camp':
    case 'jp14_camp':
      return camp(k, S, 0xf0eee6, c1, S > 3 ? 4 : 3);
    case 'jp95_depot':
      k.ground(0, 0, S, S, shade(EARTH, 1.15));
      hall(k, 0.3, 0.3, S - 0.6, 1.1, 10, TIMBER, GREY_TILE, false);
      for (const [x, y] of [
        [0.5, 2],
        [1.1, 2.1],
        [1.8, 1.9],
      ])
        k.box(x, y, 0.45, 0.45, 0, 6, 0xa58a5c, 0xbfa271);
      return k.flag(S - 0.4, S - 0.4, 0, 16, c1);
    case 'barracks_zheng':
      k.ground(0, 0, S, S, 0xb9a57a);
      hall(k, 0.3, 0.4, S - 0.6, 1.1, 12, BRICK, RED_TILE, true);
      hall(k, 0.3, 1.8, S - 0.6, 0.9, 10, BRICK, RED_TILE, true);
      return k.flag(S - 0.3, S - 0.3, 0, 16, c1);
    case 'barracks_voc':
      hall(k, 0.3, 0.4, S - 0.6, 2.2, 14, DUTCH_BRICK, RED_TILE, false, 4);
      return k.flag(S - 0.3, S - 0.3, 0, 16, c1);
    case 'shipyard_zheng':
    case 'dock_voc': {
      // A timber slipway with a hull on the stocks, and a shed.
      k.ground(0, 0, S, S, 0x9c7c52);
      hall(k, 0.2, 0.2, 1.2, S - 0.4, 12, TIMBER, type === 'dock_voc' ? RED_TILE : GREY_TILE, false);
      const p = k.p.bind(k);
      k.g.poly([...p(1.8, 0.6, 2), ...p(S - 0.3, 0.6, 2), ...p(S - 0.5, 1.2, 10), ...p(2.0, 1.2, 10)]).fill(0x6b4a2b).stroke(EDGE);
      for (let i = 0; i < 4; i++) k.g.moveTo(...p(2 + i * 0.3, 1.2, 10)).lineTo(...p(2 + i * 0.3, 1.8, 2)).stroke({ color: 0x5a3d22, width: 1.5 });
      return k.flag(S - 0.3, S - 0.3, 0, 16, c1);
    }
    case 'powder_mill':
      hall(k, 0.4, 0.4, 1.6, 1.2, 10, GREY_BRICK, GREY_TILE, true);
      for (const [x, y] of [
        [2.2, 2.1],
        [2.6, 2.3],
        [2.3, 2.6],
      ])
        k.box(x, y, 0.32, 0.32, 0, 5, 0x5a3d22, 0x6b4a2b);
      return k.flag(0.3, S - 0.3, 0, 14, c1);
    case 'warehouse':
      hall(k, 0.3, 0.4, S - 0.6, 2.1, 13, TIMBER, GREY_TILE, false);
      return k.flag(S - 0.3, S - 0.3, 0, 14, c1);
    case 'sugar_mill': {
      // 糖廍: a round thatched press shed and a boiling house with a chimney.
      k.ground(0.2, 0.2, S - 0.4, S - 0.4, 0xb9a57a);
      hall(k, 0.3, 0.3, 1.6, 1.0, 10, BRICK, RED_TILE, true);
      k.box(0.6, 0.35, 0.3, 0.3, 10, 14, BRICK);
      k.box(1.6, 1.7, 1.0, 1.0, 0, 7, TIMBER);
      k.hip(1.5, 1.6, 1.2, 1.2, 7, 24, THATCH);
      return k.flag(S - 0.3, 0.3, 0, 14, c1);
    }
    case 'tuntian':
      k.ground(1.4, 0.2, S - 1.6, S - 0.4, 0x8ea552);
      hall(k, 0.2, 0.4, 1.0, 1.4, 9, BRICK, RED_TILE, true);
      return k.flag(0.6, 2.3, 0, 14, c1);
    case 'mine':
      k.box(0.15, 0.15, 0.7, 0.7, 0, 8, 0x7d776a, 0x8f897b);
      k.g.poly([...k.p(0.45, 0.85, 0), ...k.p(0.75, 0.85, 0), ...k.p(0.75, 0.85, 5), ...k.p(0.45, 0.85, 5)]).fill(0x1d1a16);
      return;
    case 'han_village':
    case 'village_center':
      return courtyardHouse(k, 0.2, 0.2, S - 0.4, c1);
    case 'paiwan_village':
      slateHouse(k, 0.2, 0.3, 1.4, 0.9);
      slateHouse(k, 1.8, 0.5, 1.0, 1.2);
      slateHouse(k, 0.5, 1.8, 1.3, 0.9);
      return k.flag(2.5, 2.5, 0, 14, c1);
    case 'truku_village':
    case 'sdq_village':
      // Low, half-sunken houses; only the granary stands on stilts.
      stiltHouse(k, 0.2, 0.3, 1.4, 1.0, 0);
      stiltHouse(k, 1.9, 0.4, 0.8, 0.8, 9);
      stiltHouse(k, 0.5, 1.7, 1.3, 1.0, 0);
      return k.flag(2.5, 2.5, 0, 14, c1);
    case 'jp14_post':
    case 'sdq_post':
      k.ground(0, 0, S, S, 0xb9a57a);
      k.box(0.3, 0.4, S - 0.6, S - 0.8, 0, 11, WHITE_WALL);
      k.windows(0.3, 0.4, S - 0.6, S - 0.8, 4, 2);
      k.hip(0.3, 0.4, S - 0.6, S - 0.8, 11, 9, GREY_TILE);
      return k.flag(S - 0.15, S - 0.15, 0, 20, c1);
    case 'sdq_branch':
    case 'wushe_school':
      k.ground(0, 0, S, S, 0xb9a57a);
      k.box(0.3, 0.4, S - 0.6, 1.2, 0, 13, WHITE_WALL);
      k.windows(0.3, 0.4, S - 0.6, 1.2, 5, 5);
      k.hip(0.3, 0.4, S - 0.6, 1.2, 13, 10, GREY_TILE);
      return k.flag(S - 0.3, S - 0.3, 0, 22, c1);
    case 'trench': {
      k.box(0.1, 0.25, S - 0.2, S - 0.5, 0, 4, EARTH, shade(EARTH, 1.15));
      k.stakes(0.1, S - 0.2, S - 0.1, S - 0.2, 5, TIMBER);
      return;
    }
    case 'farm': {
      k.ground(0, 0, S, S, 0x9fae5c);
      const p = k.p.bind(k);
      for (let i = 1; i < 6; i++) k.g.moveTo(...p(0, (S * i) / 6)).lineTo(...p(S, (S * i) / 6)).stroke({ color: 0x7f8f44, width: 1 });
      return;
    }
    default:
      hall(k, 0.3, 0.3, S - 0.6, S - 0.6, 14, c2, c1, false);
  }
}
