// Generates data/maps/keelung.json: 基隆 in January–March 1885. The harbour to the north with the
// town at its head (held by the French since October); 獅球嶺 ("La Dent", French) to the south-west;
// the Qing line on the heights to the south-east — 紅淡山 ("Le Cirque", Fort Bamboo), the 鳥嘴峰
// ridge and 月眉山 ("La Table") — and behind them the 基隆河 with 暖暖 on its south bank, where the
// Qing fell back in March. Schematic: relative positions right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, paintLine, writeTiled } from './map-kit';

const W = 120;
const H = 90;
const p = new Painter(W, H, T.mountain);
const { rect, disc, scatter } = p;

scatter(0, 0, W - 1, H - 1, 0.4, T.forest, [T.mountain], 51);
// --- Harbour and town. ------------------------------------------------------------------------------------
rect(34, 0, 66, 14, T.deep_water);
rect(38, 15, 62, 18, T.shallow);
rect(36, 19, 64, 30, T.plain);
rect(30, 19, 35, 26, T.hill);
// --- Heights: 獅球嶺 (west), 紅淡山, 鳥嘴峰 ridge, 月眉山 (east). Open summits ringed by slopes. ------------------
const peaks: [number, number, number][] = [[30, 40, 6], [64, 42, 6], [76, 46, 4], [88, 38, 7]];
for (const [cx, cy, r] of peaks) {
  disc(cx, cy, r, T.hill, [T.mountain, T.forest]);
  disc(cx, cy, r - 3, T.plain, [T.hill]);
}
paintLine(p, [[64, 42], [76, 46], [88, 38]], 1.6, T.hill, [T.mountain, T.forest]);
// --- 基隆河 and 暖暖. ------------------------------------------------------------------------------------------
const river: [number, number][] = [[0, 64], [24, 62], [48, 66], [70, 64], [96, 66], [W - 1, 62]];
paintLine(p, river, 2.2, T.stream, [T.mountain, T.forest, T.hill, T.plain]);
rect(50, 69, 74, 78, T.plain);
// --- Roads and trails: town to 獅球嶺 and to 暖暖, trails up each height, the coast path east. -------------------
const road = [T.mountain, T.forest, T.hill];
paintLine(p, [[44, 28], [34, 38], [40, 56], [56, 64], [62, 72]], 1.1, T.road, road);
paintLine(p, [[56, 28], [62, 38]], 0.9, T.plain, road);
paintLine(p, [[60, 26], [80, 24], [92, 30], [88, 36]], 0.9, T.plain, road);
paintLine(p, [[66, 47], [70, 60]], 0.8, T.plain, road);
paintLine(p, [[88, 44], [92, 60]], 0.8, T.plain, road);
paintLine(p, [[66, 22], [100, 18], [W - 1, 20]], 0.9, T.plain, road);

writeTiled('keelung', p, [
  ['harbour', 36, 0, 64, 14],
  ['keelung', 36, 19, 64, 30],
  ['shiqiuling', 25, 35, 35, 45],
  ['hongdan', 60, 38, 68, 46],
  ['niaozui', 72, 42, 80, 50],
  ['yuemei', 83, 33, 93, 43],
  ['east_coast', 96, 14, 119, 26],
  ['river', 0, 60, 119, 68],
  ['nuannuan', 50, 69, 74, 78],
]);
