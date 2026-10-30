// Static terrain: one painted ground texture under the whole map plus props (trees, rocks); tall
// props are handed back to be depth-sorted with units so a tree can hide a soldier behind it.
// The ground is painted at R texels per tile and mapped onto the isometric grid with an affine
// transform (like the fog), so terrain boundaries are soft, wavy lines instead of tile diamonds;
// hills and mountains get a hillshade lit from the upper left.
import { Container, Matrix, Sprite, Texture } from 'pixi.js';
import { T, type GameMap } from '../sim/map';
import { TILE_H, TILE_W } from './iso';
import { fbm, hash, vnoise } from './noise';
import { buildProps } from './props';

/** Ground texels per tile edge. */
const R = 10;

const isWater = (t: number) => t === T.deep_water || t === T.shallow;

/** The ground (with low props) as one static layer, plus the tall props for the depth-sorted entity layer. */
export function buildTerrain(map: GameMap, colors: Record<string, string>): { root: Container; tall: Container[]; cover: Uint8Array } {
  const root = new Container();
  // Nothing in here moves: let Pixi keep the instruction set between frames.
  root.isRenderGroup = true;
  root.addChild(buildGround(map, colors));
  const props = buildProps(map);
  root.addChild(props.ground);
  return { root, tall: props.bands, cover: props.cover };
}

/** Tile distance (4-neighbour steps, capped) to the nearest tile where `src` holds. */
export function distanceField(map: GameMap, src: (t: number) => boolean, cap: number): Float32Array {
  const { width: W, height: H, terrain } = map;
  const d = new Float32Array(W * H).fill(cap);
  const queue: number[] = [];
  for (let i = 0; i < W * H; i++)
    if (src(terrain[i])) {
      d[i] = 0;
      queue.push(i);
    }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    const n = d[i] + 1;
    if (n >= cap) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1])
      if (j >= 0 && d[j] > n) {
        d[j] = n;
        queue.push(j);
      }
  }
  return d;
}

function blur(f: Float32Array, W: number, H: number, passes: number) {
  const tmp = new Float32Array(f.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let s = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            s += f[yy * W + xx];
            n++;
          }
        tmp[y * W + x] = s / n;
      }
    f.set(tmp);
  }
}

/** Bilinear sample of a per-tile field at continuous tile coordinates (tile centres at +0.5). */
function sample(f: Float32Array, W: number, H: number, x: number, y: number): number {
  x = Math.max(0, Math.min(W - 1.001, x - 0.5));
  y = Math.max(0, Math.min(H - 1.001, y - 0.5));
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const i = iy * W + ix;
  const a = f[i] + (f[i + 1] - f[i]) * fx;
  const b = f[i + W] + (f[i + W + 1] - f[i + W]) * fx;
  return a + (b - a) * fy;
}

/** Separable square dilation of a 0/1 mask. */
function dilate(m: Uint8Array, W: number, H: number, r: number): Uint8Array {
  const a = new Uint8Array(m.length);
  const b = new Uint8Array(m.length);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && !v; k++) v = m[y * W + k];
      a[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && !v; k++) v = a[k * W + x];
      b[y * W + x] = v;
    }
  return b;
}

const mix = (a: number, b: number, t: number) => {
  t = Math.max(0, Math.min(1, t));
  const r = ((a >> 16) & 255) + ((((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = ((a >> 8) & 255) + ((((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = (a & 255) + (((b & 255) - (a & 255)) * t);
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
};
const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const GRASS_LIGHT = 0xb0ad62;
const PADDY = 0x86a050;
const STUBBLE = 0xc4ae6c;
const BUND = 0xc9b27e;
const ROCK = 0x8a8474;
const MOSS = 0x4f6a38;
const FOAM = 0xe6efe8;

/** Box-blur the colour only near terrain borders, so neighbouring ground types fade into each other. */
function softenBorders(d: Uint8ClampedArray, cls: Uint8Array, W: number, H: number) {
  const edge = new Uint8Array(W * H);
  for (let y = 0; y < H - 1; y++)
    for (let x = 0; x < W - 1; x++) {
      const i = y * W + x;
      if (cls[i] !== cls[i + 1] || cls[i] !== cls[i + W]) edge[i] = 1;
    }
  const near = dilate(edge, W, H, 2);
  const src = d.slice();
  const r = 2;
  for (let y = r; y < H - r; y++)
    for (let x = r; x < W - r; x++) {
      const i = y * W + x;
      if (!near[i]) continue;
      for (let ch = 0; ch < 3; ch++) {
        let s = 0;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) s += src[((y + dy) * W + x + dx) * 4 + ch];
        d[i * 4 + ch] = s / 25;
      }
    }
}

function buildGround(map: GameMap, colors: Record<string, string>): Sprite {
  const { width: W, height: H, terrain } = map;
  const base = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, parseInt(v.slice(1), 16)])) as Record<string, number>;
  const PW = W * R;
  const PH = H * R;

  // Height: ranges rise towards their spines; water sinks. Rugged ground adds noise ridges on top.
  const spine = distanceField(map, (t) => t !== T.mountain, 7);
  const hTile = new Float32Array(W * H);
  const rug = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const t = terrain[i];
    hTile[i] =
      t === T.deep_water ? -0.6 : t === T.shallow ? -0.3 : t === T.stream ? -0.3 : t === T.tidal_flat ? -0.1 : t === T.hill ? 1.4 : t === T.mountain ? 1.3 + 0.5 * spine[i] : 0;
    rug[i] = t === T.mountain ? 1 : t === T.hill ? 0.45 : 0;
  }
  blur(hTile, W, H, 2);
  blur(rug, W, H, 1);
  const shore = distanceField(map, (t) => !isWater(t) && t !== T.stream, 8);

  // Pass 1: which terrain each texel shows (a noise-warped lookup gives wavy borders) and its height.
  const cls = new Uint8Array(PW * PH);
  const hgt = new Float32Array(PW * PH);
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      const fx = (px + 0.5) / R;
      const fy = (py + 0.5) / R;
      const wx = fx + (vnoise(fx * 1.1, fy * 1.1) - 0.5) * 0.55;
      const wy = fy + (vnoise(fx * 1.1 + 41.3, fy * 1.1 + 7.9) - 0.5) * 0.55;
      const tx = Math.max(0, Math.min(W - 1, Math.floor(wx)));
      const ty = Math.max(0, Math.min(H - 1, Math.floor(wy)));
      const i = py * PW + px;
      cls[i] = terrain[ty * W + tx];
      const r = sample(rug, W, H, fx, fy);
      hgt[i] = sample(hTile, W, H, fx, fy) + r * ((fbm(fx * 0.45, fy * 0.45) - 0.5) * 2.4 + (vnoise(fx * 1.7, fy * 1.7) - 0.5) * 0.5);
    }

  const water = new Uint8Array(PW * PH);
  const land = new Uint8Array(PW * PH);
  for (let i = 0; i < cls.length; i++) {
    water[i] = isWater(cls[i]) ? 1 : 0;
    land[i] = 1 - water[i];
  }
  const surf = dilate(land, PW, PH, 1);
  const surfOuter = dilate(land, PW, PH, 3);
  const wet = dilate(water, PW, PH, 2);

  // Pass 2: colour.
  const canvas = document.createElement('canvas');
  canvas.width = PW;
  canvas.height = PH;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(PW, PH);
  const d = img.data;
  const shallow = base.shallow;
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      const i = py * PW + px;
      const fx = (px + 0.5) / R;
      const fy = (py + 0.5) / R;
      const t = cls[i];
      let c: number;
      let lit = true;
      switch (t) {
        case T.deep_water:
        case T.shallow: {
          lit = false;
          const depth = sample(shore, W, H, fx, fy);
          c = t === T.deep_water ? mix(shallow, base.deep_water, smooth(0.6, 4, depth)) : mix(mix(shallow, base.sand, 0.18), shallow, smooth(0.2, 1.6, depth));
          c = mix(c, 0xffffff, (vnoise(fx * 1.6 + fy * 0.4, fy * 4.5) - 0.55) * 0.18);
          if (surf[i]) c = mix(c, FOAM, 0.55);
          else if (surfOuter[i]) c = mix(c, FOAM, 0.18);
          break;
        }
        case T.stream:
          lit = false;
          c = mix(base.stream, 0xd8e8e4, (vnoise(fx * 0.8, fy * 0.8 + fx * 3) - 0.5) * 0.5);
          break;
        case T.tidal_flat:
          c = mix(base.tidal_flat, shallow, vnoise(fx * 1.3, fy * 1.3) * 0.5);
          break;
        case T.sand:
          c = mix(base.sand, 0xffffff, Math.sin((fx + fy * 0.3) * 9 + vnoise(fx, fy) * 6) * 0.04);
          break;
        case T.plain:
          c = mix(mix(base.plain, 0x6f8b48, fbm(fx * 0.3, fy * 0.3)), GRASS_LIGHT, (vnoise(fx * 0.9 + 9, fy * 0.9) - 0.45) * 0.6);
          break;
        case T.farmland: {
          // Patchwork of fields two tiles square, furrowed one way or the other, with raised paths between.
          const fh = hash(Math.floor(fx / 2), Math.floor(fy / 2), 7);
          const along = fh < 0.5 ? fx : fy;
          c = fh < 0.3 ? PADDY : fh < 0.55 ? mix(PADDY, base.farmland, 0.5) : fh < 0.8 ? base.farmland : STUBBLE;
          c = mix(c, 0x000000, (along * 5) % 1 < 0.45 ? 0.07 : 0);
          if ((fx / 2) % 1 < 0.05 || (fy / 2) % 1 < 0.05) c = BUND;
          break;
        }
        case T.forest:
          c = mix(mix(base.forest, 0x2d4f27, fbm(fx * 0.7, fy * 0.7)), base.plain, 0.35 + vnoise(fx * 2, fy * 2) * 0.3);
          break;
        case T.hill:
          c = mix(base.hill, base.plain, fbm(fx * 0.5 + 3, fy * 0.5) * 0.9);
          break;
        case T.mountain: {
          const n = fbm(fx * 0.6, fy * 0.6);
          c = mix(mix(MOSS, base.mountain, n), ROCK, (n - 0.55) * 3 + (hgt[i] - 4) * 0.3);
          break;
        }
        case T.road:
          c = mix(base.road, 0x8a7350, (vnoise(fx * 3, fy * 3) - 0.5) * 0.4);
          break;
        default:
          c = 0x808080;
      }
      if (!water[i] && wet[i] && (t === T.sand || t === T.tidal_flat || t === T.plain)) c = mix(c, 0x3a3a2a, 0.16);
      let s = 0.97 + hash(px, py, 3) * 0.06;
      if (lit) {
        const x0 = px > 0 ? i - 1 : i;
        const x1 = px < PW - 1 ? i + 1 : i;
        const y0 = py > 0 ? i - PW : i;
        const y1 = py < PH - 1 ? i + PW : i;
        const gx = ((hgt[x1] - hgt[x0]) * R) / 2;
        const gy = ((hgt[y1] - hgt[y0]) * R) / 2;
        // Light from the upper left of the screen, i.e. from −x (and a little −y) in tile space.
        s *= Math.max(0.55, Math.min(1.35, 1 + 0.42 * (0.85 * gx + 0.45 * gy)));
      }
      d[i * 4] = Math.min(255, ((c >> 16) & 255) * s);
      d[i * 4 + 1] = Math.min(255, ((c >> 8) & 255) * s);
      d[i * 4 + 2] = Math.min(255, (c & 255) * s);
      d[i * 4 + 3] = 255;
    }
  softenBorders(d, cls, PW, PH);
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'linear';
  const sprite = new Sprite(tex);
  sprite.setFromMatrix(new Matrix(TILE_W / 2 / R, TILE_H / 2 / R, -TILE_W / 2 / R, TILE_H / 2 / R, 0, 0));
  sprite.eventMode = 'none';
  return sprite;
}
