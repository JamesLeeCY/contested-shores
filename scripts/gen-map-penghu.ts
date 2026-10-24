// Generates data/maps/penghu.json: the 澎湖 archipelago in July 1683. The main island (娘媽宮 on
// the inner bay), 白沙 to the north, 西嶼 to the west, the 風櫃尾 peninsula closing the bay to the
// south, the small islands 桶盤 and 虎井, and 八罩 far to the south where the Qing fleet anchored.
// The Zheng (東寧) works follow the sources: four walled forts (娘媽宮, 風櫃尾, 四角嶼, 雞籠嶼) and
// six batteries (東蒔, 西蒔, 內塹, 外塹, 西嶼頭, 牛心山). The layout is schematic: relative
// positions are right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, writeTiled } from './map-kit';

const W = 128;
const H = 120;
const p = new Painter(W, H, T.deep_water);
const { set, get, disc, place, clearUnder } = p;

// --- Islands as unions of discs (land), each with a sand rim, tidal flat and reef shallows. --------
const islands: Record<string, [number, number, number][]> = {
  main: [[82, 40, 14], [95, 35, 12], [100, 50, 11], [88, 55, 10], [75, 51, 7], [106, 61, 6], [79, 61, 5]],
  fenggui: [[72, 65, 4], [66, 68, 3.5], [60, 69, 3]],
  baisha: [[48, 15, 4.5], [58, 13, 6], [70, 11, 6], [83, 15, 5]],
  xiyu: [[28, 22, 4], [29, 27, 4], [30, 32, 4.5], [30, 37, 4.5], [31, 42, 4.5], [31, 47, 4.5], [30, 52, 4.5], [31, 57, 4.5], [32, 62, 4.5], [34, 66, 4]],
  jilong: [[98, 75, 3]],
  sijiao: [[109, 72, 3]],
  tongpan: [[51, 80, 3]],
  hujing: [[64, 88, 3.5], [68, 90, 2.5]],
  bazhao: [[44, 105, 6], [53, 107, 4.5], [36, 99, 2.5]],
};
const isLand = (x: number, y: number) =>
  Object.values(islands).some((ds) => ds.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r));
const near = (x: number, y: number, d: number) => {
  for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) if (isLand(x + dx, y + dy)) return true;
  return false;
};
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    if (isLand(x, y)) set(x, y, !isLand(x - 1, y) || !isLand(x + 1, y) || !isLand(x, y - 1) || !isLand(x, y + 1) ? T.sand : T.plain);
    else if (near(x, y, 1)) set(x, y, T.tidal_flat);
    else if (near(x, y, 3)) set(x, y, T.shallow);
  }
// Reefs: a shallow bar across part of 吼門 (the deep channel stays open on its eastern side).
for (let y = 14; y <= 19; y++) for (let x = 33; x <= 38; x++) if (get(x, y) === T.deep_water) set(x, y, T.shallow);
// The basalt mesas of the main island and 牛心山 on 西嶼.
disc(92, 40, 4, T.hill, [T.plain]);
disc(31, 51, 2, T.hill, [T.plain]);
disc(98, 52, 3, T.forest, [T.plain]);

// --- Works (east side first so tags read naturally in the scenario files). -------------------------
const Z = { owner: 'faction_tungning' };
const fort = (name: string, cx: number, cy: number) => clearUnder(place({ type: 'tn_fort', name, cx, cy, props: Z }), T.plain);
const battery = (name: string, cx: number, cy: number) => clearUnder(place({ type: 'tn_battery', name, cx, cy, props: Z }), T.plain);
fort('niangmagong', 70, 52);
fort('fenggui', 59, 69);
fort('jilong', 98, 75);
fort('sijiao', 109, 72);
battery('dongshi', 99, 61);
battery('xishi', 86, 64);
battery('neiqian', 35, 64);
battery('waiqian', 30, 61);
battery('xiyutou', 28, 21);
battery('niuxin', 33, 51);

// --- Regions ------------------------------------------------------------------------------------------
writeTiled('penghu', p, [
  ['qing_start', 40, 88, 100, 98],
  ['bazhao', 32, 96, 62, 114],
  ['outer_sea', 40, 70, 100, 88],
  ['tn_line', 44, 64, 92, 73],
  ['bay_mouth', 40, 63, 58, 75],
  ['bay', 38, 22, 66, 62],
  ['inner_harbor', 56, 42, 67, 60],
  ['niuxin', 36, 48, 46, 60],
  ['east_islets', 94, 66, 114, 82],
  ['houmen', 32, 8, 46, 22],
  ['north_exit', 30, 0, 50, 3],
]);
