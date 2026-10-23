// Generates data/maps/hengchun.json: the 四重溪 valley of the 恆春半島 in May 1874, from the coast
// at 射寮 and 車城 (west) up through 統埔 and the 石門 gorge to the 牡丹社, 女仍社 and 高士佛社
// in the mountains (east). The layout is schematic: distances are compressed, the order of places
// and the shape of the gorge (a stream between two steep, wooded heights) follow the sources.
import { T } from '../src/sim/map';
import { Painter, writeTiled } from './map-kit';

const W = 128;
const H = 88;
const p = new Painter(W, H, T.mountain);
const { set, get, rect, disc, scatter, place, clearUnder } = p;

// --- Coast: sea, beach and the coastal plain of 車城 / 射寮 / 保力. ---------------------------------
rect(0, 0, 5, H - 1, T.deep_water);
rect(6, 0, 7, H - 1, T.shallow);
rect(8, 0, 9, H - 1, T.sand);
rect(10, 8, 30, 84, T.plain);
scatter(10, 8, 30, 84, 0.12, T.forest, [T.plain], 11);
// 龜山: the low hill south of the river mouth where the expedition made camp.
disc(17, 66, 4, T.hill);

// --- The 四重溪 valley: a polyline with a half-width that narrows to the gorge. -----------------------
const valley: [number, number][] = [[8, 42], [20, 42], [32, 44], [44, 43], [52, 42], [62, 42], [70, 40], [80, 36], [88, 31], [96, 25], [101, 19]];
const halfWidth = (x: number) => (x < 42 ? 8 : x < 51 ? 8 - ((x - 42) * 6.5) / 9 : x <= 62 ? 1.5 : x < 70 ? 1.5 + ((x - 62) * 4.5) / 8 : x < 94 ? 6 : 4);
function distToValley(x: number, y: number): [number, number] {
  let best = Infinity;
  let bx = x;
  for (let i = 1; i < valley.length; i++) {
    const [ax, ay] = valley[i - 1];
    const [cx, cy] = valley[i];
    const dx = cx - ax;
    const dy = cy - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    if (d < best) {
      best = d;
      bx = ax + t * dx;
    }
  }
  return [best, bx];
}
for (let y = 0; y < H; y++)
  for (let x = 10; x < W; x++) {
    const [d, vx] = distToValley(x, y);
    if (d <= halfWidth(vx)) set(x, y, T.plain);
  }
scatter(30, 20, 110, 60, 0.14, T.forest, [T.plain], 12);
// Farm plots around 統埔 (Hakka settlers) on the valley floor.
for (const [cx, cy] of [[30, 48], [38, 49]] as const) rect(cx - 2, cy - 1, cx + 2, cy + 1, T.farmland);
// A footpath along the stream banks, from the coast up to 牡丹社.
for (let y = 0; y < H; y++)
  for (let x = 10; x < 100; x++) {
    const [d] = distToValley(x, y);
    if (d > 0.6 && d <= 1.4 && [T.plain, T.forest, T.farmland].includes(get(x, y))) set(x, y, T.road);
  }
// The stream itself, last so it cuts through everything.
for (let y = 0; y < H; y++)
  for (let x = 8; x < W; x++) {
    const [d] = distToValley(x, y);
    if (d <= 0.6 && get(x, y) !== T.deep_water && get(x, y) !== T.shallow) set(x, y, T.stream);
  }

// --- 石門: cliffs, and the wooded heights on both sides where the defenders waited. ------------------
// Gorge floor y 41–43 (stream at 42); cliffs 37–40 and 44–47 stay mountain; open heights above them
// (scrub and rock: the defenders hide by knowing the ground, see mountain_stealth).
for (const [y0, y1] of [[32, 36], [48, 52]] as const) {
  rect(54, y0, 61, y1, T.hill);
}
// Mountain woods elsewhere (forest is quicker to cross than bare slope: old hunting paths).
scatter(30, 0, W - 1, H - 1, 0.22, T.forest, [T.mountain], 13);
// …but not round the gorge, where the slopes are bare rock and scrub.
for (let y = 24; y < 62; y++) for (let x = 40; x < 72; x++) if (get(x, y) === T.forest && distToValley(x, y)[0] > halfWidth(x) + 1 && !(x >= 54 && x <= 61 && ((y >= 32 && y <= 36) || (y >= 48 && y <= 52)))) set(x, y, T.mountain);
// The cliffs above the gorge stay bare and steep.
rect(51, 37, 62, 40, T.mountain);
rect(51, 44, 62, 47, T.mountain);

// --- Villages ---------------------------------------------------------------------------------------
const clearing = (cx: number, cy: number, r: number) => {
  disc(cx, cy, r, T.plain, [T.mountain, T.forest, T.hill]);
  scatter(cx - r, cy - r, cx + r, cy + r, 0.12, T.forest, [T.plain], cx * 7 + cy);
};
// Paiwan villages (牡丹社 Sinvaudjan, 女仍社, 高士佛社 Kuskus).
for (const [name, cx, cy] of [['mudan', 101, 17], ['nunai', 90, 58], ['kuskus', 114, 44]] as const) {
  clearing(cx, cy, 5);
  clearUnder(place({ type: 'paiwan_village', name, cx, cy, props: { owner: 'faction_paiwan' } }), T.plain);
}
// Refuge deep in the mountains to the north-east.
scatter(110, 0, W - 1, 12, 0.5, T.forest, [T.mountain], 14);
// Han and Hakka villages on the coast and in the lower valley (neutral).
for (const [name, cx, cy] of [['checheng', 15, 30], ['sialiao', 15, 50], ['tongpu', 34, 53], ['baoli', 22, 78]] as const)
  clearUnder(place({ type: 'han_village', name, cx, cy }), T.plain);
// The expedition's camp below 龜山.
clearUnder(place({ type: 'japan_camp', name: 'kameyama', cx: 18, cy: 60, props: { owner: 'faction_japan' } }), T.plain);

// --- Regions ------------------------------------------------------------------------------------------
writeTiled('hengchun', p, [
  ['coast', 8, 8, 30, 84],
  ['japan_camp', 12, 54, 24, 68],
  ['sialiao', 10, 44, 22, 56],
  ['tongpu', 28, 36, 42, 52],
  ['gorge_mouth', 43, 37, 50, 47],
  ['gorge', 51, 39, 62, 45],
  ['shimen_n', 53, 31, 62, 37],
  ['shimen_s', 53, 47, 62, 53],
  ['beyond_gorge', 64, 32, 76, 46],
  ['upper_valley', 77, 22, 96, 40],
  ['mudan', 95, 11, 107, 23],
  ['nunai', 85, 53, 95, 63],
  ['kuskus', 109, 39, 119, 49],
  ['refuge', 112, 0, 127, 10],
]);
