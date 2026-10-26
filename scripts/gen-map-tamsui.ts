// Generates data/maps/tamsui.json: 滬尾 (Tamsui) in October 1884. The sea to the west, where the
// French squadron lay; the 淡水河 mouth, blocked with sunken stone-filled boats and mines; on the
// north bank the dunes, the hedged fields where the landing companies lost their way, the New Fort
// and the White Fort by the river mouth, Fort San Domingo (紅毛城, the British consulate) on its hill
// with a Krupp battery beside it, the town of 滬尾 along the river, and the Qing camp to the east.
// 觀音山 rises across the river. Schematic: relative positions right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, paintLine, writeTiled } from './map-kit';

const W = 110;
const H = 90;
const p = new Painter(W, H, T.plain);
const { rect, disc, scatter, place, clearUnder } = p;

// --- Sea, beach and dunes. ------------------------------------------------------------------------------
rect(0, 0, 21, H - 1, T.deep_water);
rect(22, 0, 25, H - 1, T.shallow);
rect(26, 0, 28, H - 1, T.sand);
scatter(29, 14, 34, 54, 0.55, T.sand, [T.plain], 41);
// --- 淡水河 and 觀音山 to the south. ------------------------------------------------------------------------
const river: [number, number][] = [[22, 58], [34, 59], [50, 58], [66, 60], [84, 59], [W - 1, 61]];
paintLine(p, river, 3.2, T.stream, [T.plain, T.sand]);
// The bar at the mouth (and the sunken boats): shallows no ship can cross.
rect(22, 54, 30, 63, T.shallow);
paintLine(p, river.slice(0, 2), 1.4, T.stream, [T.shallow]);
rect(0, 64, W - 1, H - 1, T.mountain);
scatter(0, 64, W - 1, H - 1, 0.45, T.forest, [T.mountain], 42);
disc(60, 80, 9, T.mountain);
// --- North bank: hedged fields, wooded hills to the north-east. --------------------------------------------
scatter(35, 14, 70, 52, 0.22, T.forest, [T.plain], 43);
rect(62, 0, W - 1, 30, T.hill);
scatter(62, 0, W - 1, 30, 0.4, T.forest, [T.hill], 44);
rect(0, 0, W - 1, 10, T.hill);
scatter(30, 0, W - 1, 10, 0.5, T.forest, [T.hill], 45);
// The fort hill (紅毛城) and the road along the river through 滬尾 to the camp.
disc(53, 45, 4, T.hill, [T.plain, T.forest, T.sand]);
paintLine(p, [[34, 44], [46, 50], [60, 52], [86, 50], [W - 1, 50]], 1.2, T.road, [T.plain, T.forest, T.hill, T.sand]);
paintLine(p, [[34, 40], [38, 30], [50, 24], [70, 22]], 0.9, T.road, [T.plain, T.forest, T.hill, T.sand]);

// --- Places ------------------------------------------------------------------------------------------------
const Q = { owner: 'faction_qing84' };
clearUnder(place({ type: 'q84_fort', name: 'new_fort', cx: 31, cy: 40, props: Q }), T.plain);
clearUnder(place({ type: 'q84_battery', name: 'white_fort', cx: 30, cy: 50, props: Q }), T.plain);
clearUnder(place({ type: 'red_fort', name: 'red_fort', cx: 52, cy: 46, props: { owner: 'faction_neutral' } }), T.hill);
clearUnder(place({ type: 'q84_battery', name: 'krupp_battery', cx: 55, cy: 43, props: Q }), T.hill);
clearUnder(place({ type: 'q84_camp', name: 'qing_camp', cx: 92, cy: 46, props: Q }), T.plain);

writeTiled('tamsui', p, [
  ['offshore', 15, 30, 21, 52],
  ['beach', 26, 22, 34, 36],
  ['dunes', 29, 14, 36, 54],
  ['fields_n', 36, 16, 52, 32],
  ['fields_s', 38, 33, 50, 44],
  ['heights', 48, 40, 58, 50],
  ['hobe', 58, 46, 72, 56],
  ['qing_camp', 84, 40, 100, 54],
  ['north_hills', 62, 4, 90, 26],
]);
