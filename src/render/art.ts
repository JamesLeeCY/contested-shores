// Simplified vector art (spec §9.3): one consistent hand-drawn-ish style, warm earth tones, team
// colours on clothing and flags. Infantry ~24×32 px, guns ~40×32, junks ~96×64, warships ~128×96.
import type { Graphics } from 'pixi.js';

const SKIN = 0xd9a77a;
const WOOD = 0x6b4a2b;
const DARK = 0x2a1f14;
const IRON = 0x6f7378;
const LINE = { color: DARK, width: 1 };

function shade(hex: number, f: number) {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
}

const PAIWAN = new Set(['paiwan_hunter', 'paiwan_warrior', 'aruqu', 'paiwan_family']);
const JAPAN = new Set(['japan_infantry', 'japan_volunteer', 'sakuma']);

function heroBanner(g: Graphics, c1: number) {
  g.moveTo(-9, 0).lineTo(-9, -40).stroke({ color: WOOD, width: 1.5 });
  g.poly([-9, -40, 3, -37, -9, -32]).fill(c1).stroke({ color: 0xffd700, width: 1.2 });
}

/** 排灣族: dark clothes with embroidered bands in the faction colour, a headband; long guns or knives. */
function drawPaiwan(g: Graphics, type: string, c1: number, hero: boolean) {
  const child = type === 'paiwan_family';
  const s = child ? 0.85 : 1;
  g.rect(-3.2 * s, -9 * s, 2.4 * s, 9 * s).fill(SKIN);
  g.rect(0.8 * s, -9 * s, 2.4 * s, 9 * s).fill(SKIN);
  g.rect(-4.5 * s, -11 * s, 9 * s, 4 * s).fill(0x1b1b1b);
  g.roundRect(-5.5 * s, -21 * s, 11 * s, 11 * s, 3).fill(0x1b1b1b).stroke(LINE);
  g.rect(-5.5 * s, -17 * s, 11 * s, 1.6).fill(c1);
  g.rect(-5.5 * s, -13.5 * s, 11 * s, 1.2).fill(0xb03a2e);
  g.circle(0, -24.5 * s, 3.6 * s).fill(SKIN).stroke(LINE);
  g.rect(-3.8 * s, -26.6 * s, 7.6 * s, 1.6).fill(c1);
  if (type === 'aruqu') {
    // A chief's eagle feathers.
    g.poly([-1, -27, -3, -36, 0.5, -28]).fill(0xf2efe6).stroke(LINE);
    g.poly([1, -27, 2.5, -35, 2.5, -27.5]).fill(0x2a2a2a);
  }
  if (type === 'paiwan_hunter') {
    g.moveTo(4, -9).lineTo(10, -29).stroke({ color: WOOD, width: 2.2 });
    g.moveTo(9.2, -26).lineTo(10.3, -29.5).stroke({ color: IRON, width: 1.4 });
  } else if (type === 'paiwan_warrior' || type === 'aruqu') {
    g.moveTo(5, -11).lineTo(10, -20).stroke({ color: 0xcfd3d6, width: 2.2 });
    g.moveTo(4.2, -10).lineTo(5.6, -12.5).stroke({ color: WOOD, width: 2.6 });
  } else {
    // Carrying basket on the back.
    g.roundRect(-8 * s, -20 * s, 5 * s, 8 * s, 2).fill(0x9a7a45).stroke(LINE);
  }
  if (hero) heroBanner(g, c1);
}

/** 日軍: dark blue uniforms and kepis with rifles; 徵集隊 in hakama with swords. */
function drawJapanese(g: Graphics, type: string, c1: number, hero: boolean) {
  const volunteer = type === 'japan_volunteer';
  g.rect(-3.5, -9, 2.6, 9).fill(volunteer ? 0x3b3b44 : 0xe8e4d8);
  g.rect(0.9, -9, 2.6, 9).fill(volunteer ? 0x3b3b44 : 0xe8e4d8);
  if (volunteer) g.poly([-5.5, -11, 5.5, -11, 6.5, -2, -6.5, -2]).fill(0x3b3b44).stroke(LINE);
  g.roundRect(-6, -21, 12, 12, 3).fill(volunteer ? 0x5a5a62 : c1).stroke(LINE);
  if (!volunteer) for (const y of [-18, -15, -12]) g.circle(0, y, 0.7).fill(0xd4af37);
  g.circle(0, -24.5, 3.6).fill(SKIN).stroke(LINE);
  if (volunteer) g.rect(-3.8, -26.5, 7.6, 1.4).fill(0xf2efe6);
  else g.rect(-3.6, -31, 7.2, 4.5).fill(c1).stroke(LINE).rect(-4.6, -27, 9.2, 1.4).fill(0x1b1b1b);
  if (type === 'japan_infantry') {
    g.moveTo(4, -9).lineTo(10, -29).stroke({ color: WOOD, width: 2 });
    g.moveTo(9.7, -28).lineTo(11, -34).stroke({ color: 0xcfd3d6, width: 1 });
  } else {
    g.moveTo(4, -10).lineTo(11, -24).stroke({ color: 0xcfd3d6, width: 1.6 });
    g.moveTo(3.4, -9).lineTo(4.6, -11.5).stroke({ color: 0x1b1b1b, width: 2.4 });
  }
  if (hero) heroBanner(g, c1);
}

/** A foot soldier standing at (0,0) feet, facing the viewer. */
export function drawFigure(g: Graphics, type: string, c1: number, c2: number, hero: boolean) {
  g.ellipse(0, 0, 8, 3.5).fill({ color: 0x000000, alpha: 0.25 });
  if (PAIWAN.has(type)) return drawPaiwan(g, type, c1, hero);
  if (JAPAN.has(type)) return drawJapanese(g, type, c1, hero);
  const armoured = type === 'iron_man' || type === 'koxinga';
  const dutch = ['musketeer_voc', 'pikeman', 'grenadier', 'company_worker', 'coyett', 'pedel'].includes(type);
  // Legs and body.
  g.rect(-3.5, -9, 2.6, 9).fill(dutch ? 0x3a3a46 : DARK);
  g.rect(0.9, -9, 2.6, 9).fill(dutch ? 0x3a3a46 : DARK);
  g.roundRect(-6, -21, 12, 13, 3).fill(armoured ? IRON : c1).stroke(LINE);
  if (armoured) for (let y = -19; y < -9; y += 3) g.moveTo(-5, y).lineTo(5, y).stroke({ color: shade(IRON, 0.7), width: 1 });
  else g.rect(-6, -14, 12, 2).fill(c2);
  // Head and hat.
  g.circle(0, -24.5, 3.6).fill(SKIN).stroke(LINE);
  if (dutch) g.ellipse(0, -27.5, 6, 1.8).fill(0x222222).rect(-2.5, -31, 5, 3.5).fill(0x222222);
  else if (armoured) g.poly([-4, -26, 0, -31, 4, -26]).fill(IRON).stroke(LINE);
  else g.poly([-5, -26.5, 0, -30.5, 5, -26.5]).fill(0xc8a050).stroke(LINE);
  // Weapon by type.
  switch (type) {
    case 'shield_soldier':
      g.circle(-6, -14, 6).fill(0xb8893e).stroke({ color: 0x7a5420, width: 1.5 });
      g.circle(-6, -14, 2).fill(c1);
      break;
    case 'archer_zheng':
    case 'village_warrior':
    case 'village_hunter':
      g.arc(7, -16, 8, -1.3, 1.3).stroke({ color: WOOD, width: 1.8 });
      g.moveTo(9.5, -23.5).lineTo(9.5, -8.5).stroke({ color: 0xeeeeee, width: 0.6 });
      break;
    case 'iron_man':
    case 'koxinga':
      g.moveTo(6, -6).lineTo(10, -30).stroke({ color: WOOD, width: 1.8 });
      g.poly([9, -30, 13, -37, 11, -28]).fill(0xcfd3d6).stroke(LINE);
      break;
    case 'musketeer_zheng':
    case 'musketeer_voc':
    case 'coyett':
    case 'pedel':
      g.moveTo(4, -9).lineTo(10, -28).stroke({ color: WOOD, width: 2.2 });
      g.moveTo(9, -25).lineTo(10.4, -29.5).stroke({ color: IRON, width: 1.6 });
      break;
    case 'pikeman':
      g.moveTo(6, -2).lineTo(6, -40).stroke({ color: WOOD, width: 1.6 });
      g.poly([4.6, -40, 6, -45, 7.4, -40]).fill(0xcfd3d6);
      break;
    case 'grenadier':
      g.circle(8, -12, 3).fill(0x222222);
      g.moveTo(8, -15).lineTo(9, -17).stroke({ color: 0xffa040, width: 1 });
      break;
    case 'laborer':
    case 'company_worker':
    case 'settler':
      g.moveTo(5, -6).lineTo(9, -24).stroke({ color: WOOD, width: 1.5 });
      g.poly([7.5, -24, 12, -26, 10.5, -21]).fill(IRON);
      break;
  }
  if (hero) {
    // Banner behind the hero.
    g.moveTo(-9, 0).lineTo(-9, -40).stroke({ color: WOOD, width: 1.5 });
    g.poly([-9, -40, 3, -37, -9, -32]).fill(c1).stroke({ color: 0xffd700, width: 1.2 });
  }
}

/** A gun on its carriage. */
export function drawGun(g: Graphics, type: string, c1: number) {
  const heavy = type === 'heavy_cannon';
  const L = heavy ? 26 : 20;
  g.ellipse(0, 0, L * 0.6, 5).fill({ color: 0x000000, alpha: 0.25 });
  g.poly([-L / 2, -6, L / 2 - 4, -9, L / 2 - 4, -4, -L / 2, -2]).fill(WOOD).stroke(LINE);
  g.circle(-L / 4, -2, heavy ? 5 : 4).fill(0x4a3420).stroke(LINE);
  g.circle(L / 4, -3, heavy ? 5 : 4).fill(0x4a3420).stroke(LINE);
  g.roundRect(-L / 2 + 2, -14, L, heavy ? 7 : 5.5, 2.5).fill(0x3c3f42).stroke(LINE);
  g.rect(-L / 2 + 2, -12, 3, 3).fill(c1);
}

/**
 * Ship hull and sails. `a` is the heading in tile space; hull points are rotated then projected
 * into the 2:1 view. Junks get battened fan sails, Dutch ships square sails with the company flag.
 */
export function drawShipArt(g: Graphics, type: string, a: number, len: number, c1: number, c2: number, stranded: boolean) {
  const wid = len * 0.32;
  const proj = (px: number, py: number): [number, number] => {
    const rx = px * Math.cos(a) - py * Math.sin(a);
    const ry = px * Math.sin(a) + py * Math.cos(a);
    return [(rx - ry) * 0.7, (rx + ry) * 0.35];
  };
  const pts = [[len * 0.55, 0], [len * 0.25, wid * 0.5], [-len * 0.45, wid * 0.45], [-len * 0.5, 0], [-len * 0.45, -wid * 0.45], [len * 0.25, -wid * 0.5]] as const;
  g.ellipse(0, 2, len * 0.5, len * 0.18).fill({ color: 0x0a2030, alpha: 0.25 });
  g.poly(pts.flatMap(([x, y]) => proj(x, y))).fill(stranded ? 0x6d5a3a : type === 'junk' || type === 'fire_ship' ? 0x6b3f1f : 0x4a3322).stroke({ color: c2, width: 1.5 });
  const masts = len > 30 ? [-0.2, 0.15] : [0];
  for (const m of masts) {
    const [mx, my] = proj(len * m, 0);
    const H = len * 0.75;
    g.moveTo(mx, my).lineTo(mx, my - H).stroke({ color: DARK, width: 1.8 });
    if (type === 'junk' || type === 'fire_ship') {
      // Battened lug sail.
      const sw = len * 0.32;
      g.poly([mx, my - H, mx + sw, my - H * 0.85, mx + sw * 1.1, my - H * 0.3, mx, my - H * 0.25]).fill(type === 'fire_ship' ? 0x8a3a1a : 0xa8582e).stroke(LINE);
      for (let i = 1; i < 4; i++) g.moveTo(mx, my - H + (H * 0.75 * i) / 4).lineTo(mx + sw * 1.05, my - H * 0.85 + (H * 0.55 * i) / 4).stroke({ color: DARK, width: 0.8 });
    } else {
      const sw = len * 0.22;
      g.roundRect(mx - sw, my - H * 0.9, sw * 2, H * 0.35, 3).fill(0xf0ead8).stroke(LINE);
      g.roundRect(mx - sw * 0.8, my - H * 0.52, sw * 1.6, H * 0.28, 3).fill(0xf0ead8).stroke(LINE);
    }
    g.poly([mx, my - H, mx + 8, my - H + 3, mx, my - H + 6]).fill(c1);
  }
  if (type === 'fire_ship') g.circle(0, -6, 3).fill({ color: 0xff8030, alpha: 0.8 });
}

/** Crenellations along the top edge of a fortification. */
export function crenellate(g: Graphics, top: number[], color: number) {
  for (let k = 0; k < 4; k++) {
    const x0 = top[k * 2];
    const y0 = top[k * 2 + 1];
    const x1 = top[((k + 1) % 4) * 2];
    const y1 = top[((k + 1) % 4) * 2 + 1];
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 9));
    for (let i = 0; i < n; i += 2) {
      const fx = x0 + ((x1 - x0) * (i + 0.5)) / n;
      const fy = y0 + ((y1 - y0) * (i + 0.5)) / n;
      g.rect(fx - 2, fy - 5, 4, 5).fill(color);
    }
  }
}
