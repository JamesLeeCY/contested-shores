// Generates data/maps/tainan.json: central and southern Taiwan in 1895. 大肚溪 in the north (forded
// by the 近衛師團 at night), 八卦山 with its battery above 彰化城, the plain south over 濁水溪 to
// 嘉義, the coast at 布袋嘴, 臺南城 by the sea, and 枋寮 on the far southern coast. The Central
// Mountain Range closes the east. Schematic: relative positions right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, hash, paintLine, writeTiled } from './map-kit';

const W = 112;
const H = 128;
const p = new Painter(W, H, T.plain);
const { set, get, rect, scatter, place, clearUnder } = p;

// --- Coasts: the Taiwan Strait to the west, and the south coast below 枋寮. --------------------------
for (let y = 0; y < H; y++) {
  const west = 6 + Math.round(1.5 * Math.sin(y / 10)) + (y > 100 ? Math.round((y - 100) * 0.9) : 0);
  for (let x = 0; x < Math.min(W, west); x++) set(x, y, T.deep_water);
  if (y > 118) for (let x = 0; x < W; x++) if (x < 70 || y > 123) set(x, y, T.deep_water);
}
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.deep_water) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const t = get(Math.min(W - 1, Math.max(0, x + dx)), Math.min(H - 1, Math.max(0, y + dy))); return t !== T.deep_water && t !== T.shallow; })) set(x, y, T.shallow);
  }
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (get(x, y) === T.plain && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(Math.min(W - 1, Math.max(0, x + dx)), Math.min(H - 1, Math.max(0, y + dy))) === T.shallow))
      set(x, y, T.sand);

// --- The Central Mountain Range to the east, foothills and groves on the plain. ----------------------
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.plain) continue;
    const edge = 84 - Math.round(4 * Math.sin(y / 13)) - (y > 96 ? (y - 96) * 0.35 : 0);
    if (x > edge) set(x, y, hash(x, y, 1) < 0.35 ? T.forest : T.mountain);
    else if (x > edge - 5 && hash(x, y, 2) < 0.6) set(x, y, T.hill);
  }
scatter(8, 20, 84, 118, 0.1, T.forest, [T.plain], 3);
for (const [x0, y0, x1, y1] of [[24, 36, 70, 52], [20, 62, 60, 84]] as const) scatter(x0, y0, x1, y1, 0.25, T.farmland, [T.plain], 4);
// 八卦山: the plateau east of 彰化 with its battery.
rect(64, 17, 75, 27, T.hill);
scatter(64, 17, 75, 27, 0.2, T.forest, [T.hill], 5);
// Small rises south of 嘉義 and on the 臺南 approaches (militia ambush posts).
rect(48, 70, 54, 73, T.hill);
rect(38, 104, 44, 107, T.hill);
rect(56, 98, 61, 101, T.hill);

// --- Rivers (fordable stream beds): 大肚溪, 濁水溪, 曾文溪. ------------------------------------------------
paintLine(p, [[4, 13], [30, 12], [56, 13], [84, 11]], 1.5, T.stream);
paintLine(p, [[4, 41], [30, 42], [60, 40], [84, 38]], 1.2, T.stream);
paintLine(p, [[4, 84], [26, 82], [50, 80], [82, 76]], 1, T.stream);

// --- Roads: 大肚溪 ford – 彰化 – 嘉義 – 臺南; 布袋嘴 – 臺南; 枋寮 – 臺南. -----------------------------------
const roads: [number, number][][] = [
  [[50, 4], [52, 12], [56, 22], [58, 40], [60, 58], [50, 72], [38, 84], [27, 93]],
  [[14, 66], [20, 78], [26, 90]],
  [[66, 120], [58, 110], [44, 102], [30, 96]],
];
for (const r of roads) paintLine(p, r, 1.2, T.plain, [T.mountain, T.forest, T.hill, T.farmland]);
for (const r of roads) paintLine(p, r, 0.5, T.road, [T.plain, T.sand]);

// --- Places ------------------------------------------------------------------------------------------
const F = { owner: 'faction_formosa' };
clearUnder(place({ type: 'fm_fort', name: 'baguashan', cx: 69, cy: 21, props: F }), T.hill);
clearUnder(place({ type: 'fm_fort', name: 'anping', cx: 18, cy: 94, props: F }), T.plain);
clearUnder(place({ type: 'walled_city', name: 'changhua', cx: 57, cy: 23 }), T.plain);
clearUnder(place({ type: 'walled_city', name: 'chiayi', cx: 60, cy: 59 }), T.plain);
clearUnder(place({ type: 'walled_city', name: 'tainan', cx: 27, cy: 93 }), T.plain);
for (const [name, cx, cy] of [['lukang', 18, 25], ['budai', 14, 66], ['fangliao', 68, 117], ['xiaolong', 34, 84]] as const)
  clearUnder(place({ type: 'han_village', name, cx, cy }), T.plain);

writeTiled('tainan', p, [
  // chapter 3
  ['north_bank', 34, 1, 70, 9],
  ['daduxi', 30, 10, 76, 15],
  ['ford_west', 36, 10, 50, 16],
  ['baguashan', 62, 15, 77, 29],
  ['changhua', 50, 17, 61, 30],
  ['hill_slope', 58, 16, 63, 28],
  // chapter 4
  ['chiayi', 52, 52, 68, 66],
  ['budai', 9, 60, 20, 72],
  ['fangliao', 60, 110, 74, 121],
  ['tainan', 20, 86, 34, 100],
  ['tainan_outskirts', 16, 78, 44, 106],
  ['amb_north', 46, 68, 56, 75],
  ['amb_south', 36, 102, 46, 109],
  ['amb_east', 54, 96, 63, 103],
  ['refuge_s', 86, 70, 104, 90],
]);
