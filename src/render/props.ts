// Terrain props: trees, bamboo, palms, rocks and grass, painted once into small canvases and
// scattered as sprites. Placement is hashed from the tile, so a map always looks the same.
import { Container, Sprite, Texture } from 'pixi.js';
import { T, type GameMap } from '../sim/map';
import { toScreen } from './iso';
import { hash } from './noise';

/** Canvas pixels per world pixel: props are painted at 2× so they stay crisp when zoomed in. */
const SS = 2;

interface Prop {
  tex: Texture;
  ax: number;
  ay: number;
}

function paint(w: number, h: number, bx: number, by: number, draw: (c: CanvasRenderingContext2D) => void): Prop {
  const canvas = document.createElement('canvas');
  canvas.width = w * SS;
  canvas.height = h * SS;
  const c = canvas.getContext('2d')!;
  c.scale(SS, SS);
  c.translate(bx, by);
  draw(c);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'linear';
  return { tex, ax: bx / w, ay: by / h };
}

function shadow(c: CanvasRenderingContext2D, rx: number, ry: number, dx = 3) {
  c.fillStyle = 'rgba(20, 26, 12, 0.32)';
  c.beginPath();
  c.ellipse(dx, 0, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

function blob(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

/** Broadleaf tree (樟、榕): a round crown lit from the upper left. */
function broadleaf(dark: string, mid: string, light: string): Prop {
  return paint(26, 30, 12, 26, (c) => {
    shadow(c, 9, 3.5);
    c.fillStyle = '#5a3d22';
    c.fillRect(-1.2, -9, 2.6, 9);
    blob(c, -5, -11, 6, dark);
    blob(c, 5, -11, 6, dark);
    blob(c, 0, -16, 7, mid);
    blob(c, -4, -13, 5, mid);
    blob(c, 4, -13.5, 5, mid);
    blob(c, -2.5, -18, 3.5, light);
    blob(c, -5.5, -14, 2.2, light);
  });
}

/** Mountain conifer (檜、杉): stacked tiers. */
const conifer = paint(20, 34, 10, 31, (c) => {
  shadow(c, 7, 2.6);
  c.fillStyle = '#4a321d';
  c.fillRect(-1, -6, 2, 6);
  for (const [y, w, h] of [
    [-5, 7, 10],
    [-11, 5.8, 9],
    [-17, 4.4, 9],
  ]) {
    c.fillStyle = '#2b4a2a';
    c.beginPath();
    c.moveTo(-w, y);
    c.lineTo(0, y - h);
    c.lineTo(w, y);
    c.closePath();
    c.fill();
    c.fillStyle = '#41683a';
    c.beginPath();
    c.moveTo(-w, y);
    c.lineTo(0, y - h);
    c.lineTo(0, y);
    c.closePath();
    c.fill();
  }
});

/** A clump of bamboo, common round farmsteads and on forest edges. */
const bamboo = paint(24, 34, 12, 31, (c) => {
  shadow(c, 7, 2.6);
  c.lineCap = 'round';
  for (const [x, lean, h] of [
    [-4, -5, 26],
    [-1, -1.5, 29],
    [2, 2, 27],
    [4.5, 6, 23],
  ]) {
    c.strokeStyle = '#7d8f3c';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(x, 0);
    c.quadraticCurveTo(x + lean * 0.3, -h * 0.6, x + lean, -h);
    c.stroke();
    for (let k = 0; k < 4; k++) {
      const t = 0.45 + k * 0.17;
      const lx = x + lean * t * t;
      const ly = -h * t;
      c.fillStyle = k % 2 ? '#5d8a36' : '#86aa4c';
      c.beginPath();
      c.ellipse(lx + (k % 2 ? 2.5 : -2.5), ly, 3.2, 1.2, k % 2 ? 0.5 : -0.5, 0, Math.PI * 2);
      c.fill();
    }
  }
});

/** Coconut palm on sandy shores. */
const palm = paint(28, 36, 12, 33, (c) => {
  shadow(c, 8, 2.6, 5);
  c.strokeStyle = '#7a5a3a';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(0, 0);
  c.quadraticCurveTo(-1, -14, 4, -26);
  c.stroke();
  c.lineWidth = 1.8;
  for (const [dx, dy, col] of [
    [-10, -22, '#3f6e2c'],
    [11, -21, '#3f6e2c'],
    [-7, -31, '#5a8b3c'],
    [9, -30, '#5a8b3c'],
    [1, -33, '#6d9d47'],
  ] as const) {
    c.strokeStyle = col;
    c.beginPath();
    c.moveTo(4, -26);
    c.quadraticCurveTo(4 + dx * 0.5, -26 + (dy + 26) - 4, 4 + dx, dy + 2);
    c.stroke();
  }
});

function rock(w: number, h: number): Prop {
  return paint(w + 6, h + 4, w / 2 + 1, h + 1, (c) => {
    shadow(c, w * 0.5, h * 0.22, 2);
    const pts = [
      [-w / 2, 0],
      [-w * 0.35, -h * 0.65],
      [-w * 0.05, -h],
      [w * 0.3, -h * 0.75],
      [w / 2, 0],
    ];
    c.fillStyle = '#625d52';
    c.beginPath();
    pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
    c.fillStyle = '#a19b8b';
    c.beginPath();
    c.moveTo(-w / 2, 0);
    c.lineTo(-w * 0.35, -h * 0.65);
    c.lineTo(-w * 0.05, -h);
    c.lineTo(0, -h * 0.25);
    c.lineTo(-w * 0.15, 0);
    c.closePath();
    c.fill();
  });
}

const shrub = paint(14, 10, 7, 8, (c) => {
  shadow(c, 5, 1.8, 1.5);
  blob(c, -2.5, -2.5, 3, '#3d6430');
  blob(c, 2.5, -2.5, 3, '#3d6430');
  blob(c, 0, -4, 3.2, '#55803d');
});

const tuft = paint(10, 8, 5, 7, (c) => {
  c.strokeStyle = '#5f7d3c';
  c.lineWidth = 0.9;
  for (const [x, dx] of [
    [-2, -2.5],
    [0, 0],
    [2, 2.5],
    [1, 1],
  ]) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + dx, -5);
    c.stroke();
  }
});

const reeds = paint(12, 12, 6, 11, (c) => {
  c.lineWidth = 0.9;
  for (const [x, h] of [
    [-3, 8],
    [-1, 10],
    [1.5, 9],
    [3.5, 7],
  ]) {
    c.strokeStyle = '#8a9256';
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + 0.6, -h);
    c.stroke();
    blob(c, x + 0.6, -h, 0.9, '#7a6a40');
  }
});

let cache: Record<string, Prop> | undefined;
function props() {
  return (cache ??= {
    tree1: broadleaf('#2f5a2a', '#3f7334', '#5f9446'),
    tree2: broadleaf('#33542a', '#4a7a33', '#6f9a48'),
    conifer,
    bamboo,
    palm,
    rock: rock(9, 6),
    crag: rock(18, 13),
    shrub,
    tuft,
    reeds,
  });
}

/** Ground props (grass, rocks, reeds) lie under everything; tall ones (trees, crags) must be able to hide a unit behind them. */
export interface PropLayers {
  ground: Container;
  /** Tall props in depth bands of BAND tiles, each with a zIndex to sort among units and buildings. */
  bands: Container[];
  /** Tiles where a unit can stand behind a tall prop (1 = covered), W × H. */
  cover: Uint8Array;
}

/** Depth (x + y) covered by one band of tall props. */
const BAND = 0.5;
/** Props taller than this (world px) go in the depth-sorted bands. */
const TALL = 16;

/** Scatter props over the map, sorted back to front. Tiles under map objects stay clear. */
export function buildProps(map: GameMap): PropLayers {
  const { width: W, height: H, terrain } = map;
  const P = props();
  const blocked = new Uint8Array(W * H);
  for (const o of map.objects)
    for (let y = o.y; y < o.y + Math.max(1, o.h); y++)
      for (let x = o.x; x < o.x + Math.max(1, o.w); x++) if (x >= 0 && y >= 0 && x < W && y < H) blocked[y * W + x] = 1;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : terrain[y * W + x]);
  const nearWater = (x: number, y: number) =>
    [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((t) => t === T.shallow || t === T.deep_water);

  const placed: { p: Prop; x: number; y: number; s: number; tint: number }[] = [];
  const put = (p: Prop, x: number, y: number, k: number, s = 1) => {
    const ox = 0.2 + hash(x, y, k * 2 + 11) * 0.6;
    const oy = 0.2 + hash(x, y, k * 2 + 12) * 0.6;
    const tint = 0xffffff - Math.floor(hash(x, y, k + 40) * 0x18) * 0x010101;
    placed.push({ p, x: x + ox, y: y + oy, s: s * (0.85 + hash(x, y, k + 30) * 0.3), tint });
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (blocked[y * W + x]) continue;
      const t = terrain[y * W + x];
      const r = hash(x, y, 1);
      if (t === T.forest) {
        // Fewer trees on the edge, more bamboo where the forest meets open ground.
        const edge = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some((n) => n !== T.forest && n !== T.mountain);
        for (let k = 0; k < (edge ? 2 : 3); k++) {
          const q = hash(x, y, k + 20);
          put(edge && q < 0.3 ? P.bamboo : q < 0.12 ? P.conifer : q < 0.56 ? P.tree1 : P.tree2, x, y, k);
        }
      } else if (t === T.mountain) {
        for (let k = 0; k < 2; k++) {
          const q = hash(x, y, k + 20);
          if (q < 0.34) put(P.conifer, x, y, k);
          else if (q < 0.5) put(P.tree2, x, y, k);
          else if (q < 0.58) put(P.crag, x, y, k);
          else if (q < 0.66) put(P.rock, x, y, k);
        }
      } else if (t === T.hill) {
        if (r < 0.18) put(P.shrub, x, y, 0);
        else if (r < 0.28) put(P.rock, x, y, 0);
        else if (r < 0.36) put(P.tree1, x, y, 0);
      } else if (t === T.plain) {
        if (r < 0.16) put(P.tuft, x, y, 0);
        else if (r < 0.2) put(P.shrub, x, y, 0);
        else if (r < 0.215) put(P.tree1, x, y, 0);
        else if (r < 0.23) put(P.bamboo, x, y, 0);
      } else if (t === T.sand) {
        if (r < 0.03 && !nearWater(x, y)) put(P.palm, x, y, 0);
      } else if (t === T.tidal_flat) {
        if (r < 0.3) put(P.reeds, x, y, 0);
      } else if (t === T.stream) {
        if (r < 0.1) put(P.rock, x, y, 0, 0.7);
      }
    }
  placed.sort((a, b) => a.x + a.y - (b.x + b.y));
  const ground = new Container();
  ground.eventMode = 'none';
  const bands = new Map<number, Container>();
  const cover = new Uint8Array(W * H);
  for (const q of placed) {
    const sp = new Sprite(q.p.tex);
    sp.anchor.set(q.p.ax, q.p.ay);
    sp.scale.set(q.s / SS);
    sp.tint = q.tint;
    const pos = toScreen(q.x, q.y);
    sp.position.set(pos.x, pos.y);
    if (q.p.tex.height / SS <= TALL) {
      ground.addChild(sp);
      continue;
    }
    // A tall prop hides whatever stands on its own tile or the three tiles behind it.
    const ix = Math.floor(q.x);
    const iy = Math.floor(q.y);
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]])
      if (ix + dx >= 0 && iy + dy >= 0) cover[(iy + dy) * W + ix + dx] = 1;
    const b = Math.floor((q.x + q.y) / BAND);
    let band = bands.get(b);
    if (!band) {
      band = new Container();
      band.eventMode = 'none';
      // Units deeper than the band's middle are drawn over it, shallower ones under it.
      band.zIndex = (b + 0.5) * BAND;
      bands.set(b, band);
    }
    band.addChild(sp);
  }
  return { ground, bands: [...bands.values()], cover };
}
