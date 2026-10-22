// Generates data/maps/taijiang.json (Tiled 1.10 JSON) and the placeholder terrain tileset image
// from the region layout in spec §6.3. Re-run after editing; the output can also be opened in Tiled.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { T, TERRAIN_IDS, type TiledMap, type TiledObject, type TiledProperty } from '../src/sim/map';

const root = join(import.meta.dirname, '..');
const rules = JSON.parse(readFileSync(join(root, 'data/rules.json'), 'utf8'));
const factions = JSON.parse(readFileSync(join(root, 'data/factions.json'), 'utf8'));
const buildingDefs: { id: string; size: number }[] = JSON.parse(
  readFileSync(join(root, 'data/buildings.json'), 'utf8'),
);
const sizeOf = (id: string) => buildingDefs.find((b) => b.id === id)?.size ?? 1;

const W = 160;
const H = 120;
const TW = 64;
const TH = 32;
const terrain = new Uint8Array(W * H).fill(T.plain);

// Deterministic per-tile hash for scattering forests.
const hash = (x: number, y: number, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const set = (x: number, y: number, t: number) => {
  if (x >= 0 && y >= 0 && x < W && y < H) terrain[y * W + x] = t;
};
const get = (x: number, y: number) => terrain[y * W + x];
const rect = (x0: number, y0: number, x1: number, y1: number, t: number) => {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, t);
};
const disc = (cx: number, cy: number, r: number, t: number, only?: number[]) => {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= 0 && y >= 0 && x < W && y < H)
        if (!only || only.includes(get(x, y))) set(x, y, t);
};
const scatter = (x0: number, y0: number, x1: number, y1: number, density: number, t: number, onto: number[], seed: number) => {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (onto.includes(get(x, y)) && hash(x, y, seed) < density) set(x, y, t);
};
const line = (ax: number, ay: number, bx: number, by: number, t: number, onto: number[]) => {
  const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
  for (let i = 0; i <= n; i++) {
    const x = Math.round(ax + ((bx - ax) * i) / n);
    const y = Math.round(ay + ((by - ay) * i) / n);
    if (onto.includes(get(x, y))) set(x, y, t);
  }
};

// --- Terrain, painted back to front (later strokes win). ---------------------------------
// North coast and everything not otherwise specified: plain, with woods.
scatter(20, 0, 159, 17, 0.25, T.forest, [T.plain], 1);
// Open sea (west edge, full height).
rect(0, 0, 19, H - 1, T.deep_water);
// Western sea outside the sand bars.
rect(20, 51, 39, H - 1, T.deep_water);
// Luermen channel: shallow with tidal-flat lips.
rect(20, 18, 30, 30, T.shallow);
rect(20, 18, 30, 18, T.tidal_flat);
// Northern part of the inner lagoon (north of Baxemboy).
rect(31, 18, 72, 29, T.shallow);
rect(73, 18, 110, 19, T.plain);
// Baxemboy sand bar, woods on its northern half.
rect(20, 31, 62, 42, T.sand);
rect(31, 30, 62, 30, T.sand);
scatter(30, 31, 62, 35, 0.35, T.forest, [T.sand], 2);
rect(63, 30, 72, 42, T.shallow);
// Main channel (only deep-water entrance to the lagoon).
rect(20, 43, 72, 50, T.deep_water);
// Tayouan sand bar with Utrecht hill.
rect(30, 51, 72, 76, T.sand);
rect(30, 51, 33, 76, T.tidal_flat);
rect(37, 51, 44, 51, T.deep_water); // harbour basin in front of the dock
disc(52, 66, 4, T.hill);
line(47, 57, 56, 55, T.road, [T.sand]);
line(56, 55, 66, 55, T.road, [T.sand]);
// Southern spits (2nd–7th kunshen): a tidal-flat causeway with sand islets.
const spitX = (y: number) => Math.round(58 - (y - 77) * 0.3);
for (let y = 77; y < H; y++)
  for (let x = 40; x <= 72; x++) {
    const d = x - spitX(y);
    set(x, y, Math.abs(d) <= 5 ? T.tidal_flat : d > 0 ? T.shallow : T.deep_water);
  }
for (const [i, y] of [82, 89, 96, 103, 110, 116].entries()) disc(spitX(y) + (i % 2 ? 1 : -1), y, 3, T.sand);
// Taijiang inner sea: shallow, with a deep channel from the main channel towards Saccam.
rect(73, 20, 110, 95, T.shallow);
rect(73, 44, 109, 49, T.deep_water);
rect(73, 96, 110, H - 1, T.plain);
scatter(73, 98, 110, H - 1, 0.2, T.forest, [T.plain], 3);
// Saccam: plain with the farm belt; woods to the east.
rect(111, 35, 136, 75, T.plain);
scatter(131, 35, 136, 75, 0.45, T.forest, [T.plain], 4);
scatter(111, 76, 136, H - 1, 0.2, T.forest, [T.plain], 5);
scatter(111, 20, 136, 34, 0.2, T.forest, [T.plain], 6);
// Inland: open country with woods.
scatter(137, 0, 159, H - 1, 0.18, T.forest, [T.plain], 7);

// --- Objects -------------------------------------------------------------------------------
interface Obj {
  type: string;
  name?: string;
  cx: number;
  cy: number;
  size?: number;
  props?: Record<string, string | number | boolean>;
}
const objs: Obj[] = [];
const place = (o: Obj) => {
  const size = o.size ?? sizeOf(o.type);
  objs.push({ ...o, size });
  const x0 = o.cx - Math.floor(size / 2);
  const y0 = o.cy - Math.floor(size / 2);
  return { x0, y0, x1: x0 + size - 1, y1: y0 + size - 1 };
};
const clearUnder = (b: { x0: number; y0: number; x1: number; y1: number }, t: number) => rect(b.x0, b.y0, b.x1, b.y1, t);

// Tayouan fortress. Coordinates are building centres (spec §6.3).
clearUnder(place({ type: 'zeelandia_castle', cx: 44, cy: 57, props: { owner: 'faction_voc' } }), T.sand);
for (const [cx, cy] of [[39, 55], [48, 55], [39, 58], [48, 58]] as const)
  clearUnder(place({ type: 'bastion', cx, cy, props: { owner: 'faction_voc' } }), T.sand);
clearUnder(place({ type: 'dock_voc', cx: 40, cy: 52, props: { owner: 'faction_voc' } }), T.sand);
place({ type: 'utrecht_redoubt', cx: 52, cy: 66, props: { owner: 'faction_voc' } });
for (let x = 52; x <= 60; x++) place({ type: 'lower_town_wall', cx: x, cy: 59, size: 1, props: { owner: 'faction_voc' } });
for (let y = 52; y <= 58; y++) place({ type: 'lower_town_wall', cx: 61, cy: y, size: 1, props: { owner: 'faction_voc' } });
// Saccam.
clearUnder(place({ type: 'provintia_fort', cx: 118, cy: 52, props: { owner: 'faction_voc' } }), T.plain);
for (const [cx, cy] of [[124, 44], [124, 58], [129, 51]] as const) {
  clearUnder({ x0: cx - 2, y0: cy - 2, x1: cx + 2, y1: cy + 2 }, T.farmland);
  place({ type: 'farm', cx, cy, props: { owner: 'faction_settlers' } });
}
clearUnder(place({ type: 'sugar_mill', cx: 127, cy: 64, props: { owner: 'faction_settlers' } }), T.plain);
// Roads: Heliao landing → Provintia → villages → north exit.
const villages: { id: string; pos: [number, number] }[] = factions.villages;
const vp = (id: string) => villages.find((v) => v.id === id)!.pos;
const roadPath: [number, number][] = [[112, 38], [118, 46], [122, 52], vp('sinkan'), vp('bakloan'), vp('soulang'), vp('mattau'), [150, 0]];
for (let i = 1; i < roadPath.length; i++) line(...roadPath[i - 1], ...roadPath[i], T.road, [T.plain, T.forest, T.farmland]);
line(118, 52, 122, 52, T.road, [T.plain]);
// Villages: centre, two deer herds and a grove inside each territory.
const radius: number = rules.diplomacy.territoryRadius;
for (const v of villages) {
  const [cx, cy] = v.pos;
  disc(cx, cy, radius, T.plain, [T.forest]);
  disc(cx + 4, cy - 4, 2, T.forest, [T.plain]);
  clearUnder(place({ type: 'village_center', name: v.id, cx, cy, props: { village: v.id } }), T.plain);
  for (const [dx, dy] of [[5, 3], [-4, 5]] as const) {
    const hx = Math.min(W - 2, cx + dx);
    const hy = Math.max(1, Math.min(H - 2, cy + dy));
    set(hx, hy, T.plain);
    place({ type: 'deer_herd', cx: hx, cy: hy, size: 1, props: { village: v.id } });
  }
}
// Extra herds in the open inland (spec §6.3: herds only inland).
for (const [cx, cy] of [[155, 80], [142, 95], [153, 108]] as const) {
  set(cx, cy, T.plain);
  place({ type: 'deer_herd', cx, cy, size: 1 });
}

// --- Regions (spec §6.3) ---------------------------------------------------------------------
const regions: [string, number, number, number, number][] = [
  ['open_sea', 0, 0, 19, 119],
  ['luermen', 20, 18, 30, 30],
  ['baxemboy', 30, 30, 62, 42],
  ['main_channel', 20, 43, 72, 50],
  ['tayouan', 30, 51, 72, 76],
  ['southern_spits', 40, 77, 72, 119],
  ['taijiang', 73, 20, 110, 95],
  ['saccam', 111, 35, 136, 75],
  ['inland', 137, 0, 159, 119],
  ['north_exit', 147, 0, 153, 2],
  ['heliao', 111, 37, 113, 39],
];

// --- Tiled JSON -------------------------------------------------------------------------------
const prop = (name: string, value: string | number | boolean): TiledProperty => ({
  name,
  type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string',
  value,
});
let nextId = 1;
const obj = (name: string, type: string, x: number, y: number, w: number, h: number, props: Record<string, string | number | boolean> = {}): TiledObject => ({
  id: nextId++,
  name,
  type,
  x: x * TH,
  y: y * TH,
  width: w * TH,
  height: h * TH,
  rotation: 0,
  visible: true,
  ...(Object.keys(props).length ? { properties: Object.entries(props).map(([k, v]) => prop(k, v)) } : {}),
});

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
    { id: 1, name: 'terrain', type: 'tilelayer', width: W, height: H, data: Array.from(terrain, (t) => t + 1), x: 0, y: 0, opacity: 1, visible: true },
    {
      id: 2,
      name: 'objects',
      type: 'objectgroup',
      objects: objs.map((o) => {
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
writeFileSync(join(root, 'data/maps/taijiang.json'), JSON.stringify(tiled) + '\n');

// --- Placeholder tileset PNG (one flat-colour diamond per terrain) ----------------------------
function png(width: number, height: number, rgba: Uint8Array): Buffer {
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
}
const imgW = TW * TERRAIN_IDS.length;
const rgba = new Uint8Array(imgW * TH * 4);
TERRAIN_IDS.forEach((id, i) => {
  const hex: string = rules.terrain.types[id].color;
  const [r, g, b] = [1, 3, 5].map((o) => parseInt(hex.slice(o, o + 2), 16));
  for (let y = 0; y < TH; y++)
    for (let x = 0; x < TW; x++)
      if (Math.abs(x + 0.5 - TW / 2) / (TW / 2) + Math.abs(y + 0.5 - TH / 2) / (TH / 2) <= 1) {
        const p = (y * imgW + i * TW + x) * 4;
        rgba.set([r, g, b, 255], p);
      }
});
mkdirSync(join(root, 'assets/tiles'), { recursive: true });
writeFileSync(join(root, 'assets/tiles/terrain.png'), png(imgW, TH, rgba));
console.log(`gen-map: ${W}×${H}, ${objs.length} objects, ${regions.length} regions`);
