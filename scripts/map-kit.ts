// Shared helpers for the map generators: a terrain painter, object placement, and the Tiled 1.10
// JSON + placeholder tileset writers. Each generator paints back to front (later strokes win).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { TERRAIN_IDS, type TiledMap, type TiledObject, type TiledProperty } from '../src/sim/map';

export const root = join(import.meta.dirname, '..');
export const readJson = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const TW = 64;
const TH = 32;

/** Deterministic per-tile hash in [0, 1) for scattering. */
export const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export interface Obj {
  type: string;
  name?: string;
  cx: number;
  cy: number;
  size?: number;
  props?: Record<string, string | number | boolean>;
}
export type Box = { x0: number; y0: number; x1: number; y1: number };

export class Painter {
  readonly terrain: Uint8Array;
  readonly objs: Obj[] = [];
  private readonly sizes: Map<string, number>;

  constructor(
    readonly W: number,
    readonly H: number,
    fill: number,
  ) {
    this.terrain = new Uint8Array(W * H).fill(fill);
    const defs: { id: string; size: number }[] = readJson('data/buildings.json');
    this.sizes = new Map(defs.map((b) => [b.id, b.size]));
  }

  set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < this.W && y < this.H) this.terrain[y * this.W + x] = t;
  };
  get = (x: number, y: number) => this.terrain[y * this.W + x];
  rect = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  };
  disc = (cx: number, cy: number, r: number, t: number, only?: number[]) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < this.W && y < this.H)
          if (!only || only.includes(this.get(x, y))) this.set(x, y, t);
  };
  scatter = (x0: number, y0: number, x1: number, y1: number, density: number, t: number, onto: number[], seed: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) if (onto.includes(this.get(x, y)) && hash(x, y, seed) < density) this.set(x, y, t);
  };
  line = (ax: number, ay: number, bx: number, by: number, t: number, onto: number[]) => {
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
    for (let i = 0; i <= n; i++) {
      const x = Math.round(ax + ((bx - ax) * i) / n);
      const y = Math.round(ay + ((by - ay) * i) / n);
      if (onto.includes(this.get(x, y))) this.set(x, y, t);
    }
  };

  /** Places an object centred on (cx, cy); returns its footprint. */
  place = (o: Obj): Box => {
    const size = o.size ?? this.sizes.get(o.type) ?? 1;
    this.objs.push({ ...o, size });
    const x0 = o.cx - Math.floor(size / 2);
    const y0 = o.cy - Math.floor(size / 2);
    return { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
  };
  clearUnder = (b: Box, t: number) => this.rect(b.x0, b.y0, b.x1, b.y1, t);
}

/** Writes data/maps/<name>.json. Regions are [id, x0, y0, x1, y1] (inclusive). */
export function writeTiled(name: string, p: Painter, regions: [string, number, number, number, number][]) {
  const prop = (n: string, value: string | number | boolean): TiledProperty => ({
    name: n,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
    value,
  });
  let nextId = 1;
  const obj = (n: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string | number | boolean> = {}): TiledObject => ({
    id: nextId++,
    name: n,
    type,
    x: x * TH,
    y: y * TH,
    width: w * TH,
    height: h * TH,
    rotation: 0,
    visible: true,
    ...(Object.keys(props).length ? { properties: Object.entries(props).map(([k, v]) => prop(k, v)) } : {}),
  });
  const { W, H } = p;
  const tiled: TiledMap = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'isometric',
    renderorder: 'right-down',
    width: W,
    height: H,
    tilewidth: TW,
    tileheight: TH,
    infinite: false,
    nextlayerid: 4,
    nextobjectid: 0,
    layers: [
      { id: 1, name: 'terrain', type: 'tilelayer', width: W, height: H, data: Array.from(p.terrain, (t) => t + 1), x: 0, y: 0, opacity: 1, visible: true },
      {
        id: 2,
        name: 'objects',
        type: 'objectgroup',
        objects: p.objs.map((o) => {
          const s = o.size!;
          return obj(o.name ?? '', o.type, o.cx - Math.floor(s / 2), o.cy - Math.floor(s / 2), s, s, o.props);
        }),
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
      },
      {
        id: 3,
        name: 'regions',
        type: 'objectgroup',
        objects: regions.map(([id, x0, y0, x1, y1]) => obj(id, 'region', x0, y0, x1 - x0 + 1, y1 - y0 + 1)),
        x: 0,
        y: 0,
        opacity: 1,
        visible: true,
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: 'terrain',
        image: '../../assets/tiles/terrain.png',
        imagewidth: TW * TERRAIN_IDS.length,
        imageheight: TH,
        tilewidth: TW,
        tileheight: TH,
        tilecount: TERRAIN_IDS.length,
        columns: TERRAIN_IDS.length,
        margin: 0,
        spacing: 0,
        tiles: TERRAIN_IDS.map((id, i) => ({ id: i, type: id })),
      },
    ],
  };
  tiled.nextobjectid = nextId;
  mkdirSync(join(root, 'data/maps'), { recursive: true });
  writeFileSync(join(root, `data/maps/${name}.json`), JSON.stringify(tiled) + '\n');
  console.log(`map ${name}: ${W}×${H}, ${p.objs.length} objects, ${regions.length} regions`);
}

/** Placeholder tileset PNG: one flat-colour diamond per terrain (shared by all maps). */
export function writeTileset() {
  const rules = readJson('data/rules.json');
  const png = (width: number, height: number, rgba: Uint8Array): Buffer => {
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(td));
      return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  };
  const imgW = TW * TERRAIN_IDS.length;
  const rgba = new Uint8Array(imgW * TH * 4);
  TERRAIN_IDS.forEach((id, i) => {
    const hex: string = rules.terrain.types[id].color;
    const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
    for (let y = 0; y < TH; y++)
      for (let x = 0; x < TW; x++)
        if (Math.abs(x + 0.5 - TW / 2) / (TW / 2) + Math.abs(y + 0.5 - TH / 2) / (TH / 2) <= 1) {
          const q = (y * imgW + i * TW + x) * 4;
          rgba.set([r, g, b, 255], q);
        }
  });
  mkdirSync(join(root, 'assets/tiles'), { recursive: true });
  writeFileSync(join(root, 'assets/tiles/terrain.png'), png(imgW, TH, rgba));
}
