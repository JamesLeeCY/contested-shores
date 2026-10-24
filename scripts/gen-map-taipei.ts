// Generates data/maps/taipei.json: northern Taiwan in 1895, from the landing beach at 澳底 (east)
// over the 三貂嶺 pass to 瑞芳 and the harbour of 基隆 with the 獅球嶺 battery, the 臺北 basin and
// the 淡水 river, then south over the 桃園 tableland to 新竹 and the hills of 苗栗 where the Hakka
// militias fought. Schematic: relative positions right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, hash, paintLine, writeTiled } from './map-kit';

const W = 128;
const H = 104;
const p = new Painter(W, H, T.plain);
const { set, get, rect, disc, scatter, place, clearUnder } = p;

// --- Sea: the north coast with the 基隆 inlet, the west coast, the east coast at 澳底. -------------------
for (let x = 0; x < W; x++) {
  const north = 4 + Math.round(2 * Math.sin(x / 9) + (x > 60 ? 2 : 0));
  for (let y = 0; y < north; y++) set(x, y, T.deep_water);
}
for (let y = 0; y < H; y++) {
  const west = 5 + Math.round(1.5 * Math.sin(y / 11));
  for (let x = 0; x < west; x++) set(x, y, T.deep_water);
  const east = W - 6 - Math.round(1.5 * Math.cos(y / 8));
  if (y < 52) for (let x = east; x < W; x++) set(x, y, T.deep_water);
}
paintLine(p, [[80, 0], [80, 8], [79, 13]], 3, T.deep_water); // 基隆 harbour
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.deep_water) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = get(Math.min(W - 1, Math.max(0, x + dx)), Math.min(H - 1, Math.max(0, y + dy)));
      if (t !== T.deep_water && t !== T.shallow) set(x, y, T.shallow);
    }
  }
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++)
    if (get(x, y) === T.plain && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => get(Math.min(W - 1, Math.max(0, x + dx)), Math.min(H - 1, Math.max(0, y + dy))) === T.shallow))
      set(x, y, T.sand);

// --- Mountains: 三貂嶺 and the ridges east and south-east; hills round the basin and in 苗栗. -----------
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (get(x, y) !== T.plain) continue;
    const ne = x >= 94 && x <= 114 && y >= 18 && y <= 50; // 三貂嶺
    const se = x + y * 0.4 > 104 && y > 46; // central range foothills
    const ridge = x >= 66 && x <= 92 && y >= 20 && y <= 30 && hash(x, y, 3) < 0.7; // 獅球嶺 ridge
    if (ne || se) set(x, y, hash(x, y, 1) < 0.3 ? T.forest : T.mountain);
    else if (ridge) set(x, y, T.hill);
  }
// Hills: 林口 (west of the basin) and the 苗栗 hills; bamboo groves (forest) on the tableland.
scatter(14, 18, 40, 40, 0.55, T.hill, [T.plain], 4);
for (let y = 66; y < H; y++) for (let x = 34; x < 80; x++) if (get(x, y) === T.plain && hash(x, y, 5) < 0.55) set(x, y, hash(x, y, 6) < 0.45 ? T.forest : T.hill);
scatter(14, 44, 70, 100, 0.12, T.forest, [T.plain], 7);
// The 臺北 basin stays open farmland round the walled city.
disc(54, 40, 9, T.plain, [T.hill, T.forest]);
rect(46, 42, 50, 46, T.farmland);
rect(58, 34, 62, 37, T.farmland);

// --- The pass road over 三貂嶺, the 基隆–臺北 road, and the road south to 新竹 and 苗栗. -------------------
const roads: [number, number][][] = [
  [[117, 34], [108, 32], [100, 29], [92, 27], [84, 22], [80, 17]],
  [[80, 17], [80, 26], [70, 34], [57, 40]],
  [[54, 44], [46, 54], [40, 62], [36, 70], [30, 78], [27, 82], [28, 90], [30, 98]],
];
for (const r of roads) paintLine(p, r, 1.2, T.plain, [T.mountain, T.forest, T.hill]);
for (const r of roads) paintLine(p, r, 0.5, T.road);
// Rivers: 淡水河 from the basin to the sea at 淡水; 頭前溪 north of 新竹; 後龍溪 by 苗栗.
paintLine(p, [[52, 47], [44, 38], [36, 24], [30, 8], [28, 4]], 1, T.stream);
paintLine(p, [[6, 75], [20, 76], [34, 74], [50, 72]], 0.8, T.stream);
paintLine(p, [[6, 93], [20, 94], [36, 92]], 0.8, T.stream);
// Landing beach at 澳底.
rect(114, 30, 117, 38, T.sand);

// Low rises beside the 新竹 road, about eight tiles off it: the militias' ambush posts.
for (const [x0, y0, x1, y1] of [[46, 63, 49, 66], [42, 71, 45, 74], [31, 60, 33, 63], [27, 68, 29, 71]] as const) rect(x0, y0, x1, y1, T.hill);

// --- Places ------------------------------------------------------------------------------------------
const F = { owner: 'faction_formosa' };
clearUnder(place({ type: 'fm_fort', name: 'shiqiuling', cx: 80, cy: 24, props: F }), T.hill);
clearUnder(place({ type: 'fm_fort', name: 'keelung_fort', cx: 84, cy: 12, props: F }), T.plain);
clearUnder(place({ type: 'walled_city', name: 'taipei', cx: 54, cy: 40 }), T.plain);
clearUnder(place({ type: 'walled_city', name: 'hsinchu', cx: 25, cy: 80 }), T.plain);
for (const [name, cx, cy] of [['keelung', 76, 15], ['ruifang', 92, 24], ['tamsui', 32, 10], ['taoyuan', 42, 57], ['miaoli', 33, 100]] as const)
  clearUnder(place({ type: 'han_village', name, cx, cy }), T.plain);

writeTiled('taipei', p, [
  // chapter 1
  ['aodi', 110, 28, 119, 40],
  ['sandiao', 98, 26, 109, 36],
  ['ruifang', 86, 20, 97, 30],
  ['keelung', 72, 8, 88, 20],
  ['shiqiuling', 75, 20, 86, 28],
  ['taipei', 46, 32, 62, 48],
  ['sandiao_n', 99, 20, 108, 26],
  ['sandiao_s', 99, 37, 108, 43],
  // chapter 2
  ['taoyuan', 36, 50, 50, 62],
  ['fenshuilun', 36, 62, 46, 68],
  ['longenpu', 28, 68, 40, 76],
  ['hsinchu', 18, 74, 32, 86],
  ['miaoli', 24, 92, 38, 103],
  ['hills_a', 42, 66, 52, 74],
  ['raid_e1', 46, 63, 49, 66],
  ['raid_e2', 42, 71, 45, 74],
  ['raid_w1', 31, 60, 33, 63],
  ['raid_w2', 27, 68, 29, 71],
  ['hills_b', 34, 82, 44, 90],
  ['refuge_n', 60, 84, 78, 100],
]);
