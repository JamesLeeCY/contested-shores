// Generates data/maps/taroko.json: the 太魯閣 country in 1914. The 立霧溪 cuts a narrow gorge from
// the high meadows of 合歡山 (west, where the army column started) to the sea at 新城 (east, where the
// police column and the guard lines waited). Truku villages (古白楊, 卡拉寶, 沙卡亨) sit on terraces
// above the river. Schematic: relative positions right, distances compressed.
import { T } from '../src/sim/map';
import { Painter, paintLine, writeTiled } from './map-kit';

const W = 112;
const H = 96;
const p = new Painter(W, H, T.mountain);
const { rect, disc, scatter, place, clearUnder } = p;

// --- Coast at 新城 and the narrow coastal plain. -----------------------------------------------------
rect(104, 0, W - 1, H - 1, T.deep_water);
rect(102, 0, 103, H - 1, T.shallow);
rect(100, 0, 101, H - 1, T.sand);
rect(88, 38, 99, 62, T.plain);
// --- 合歡山: open alpine meadow (hill) on the western heights. ------------------------------------------
rect(2, 30, 16, 60, T.hill);
// Mountain woods everywhere else.
scatter(16, 0, 99, H - 1, 0.33, T.forest, [T.mountain], 21);

// --- The 立霧溪 gorge with a narrow path along it. ---------------------------------------------------------
const river: [number, number][] = [[4, 50], [16, 49], [28, 47], [40, 44], [56, 46], [72, 42], [86, 46], [101, 46]];
paintLine(p, river, 2.2, T.plain, [T.mountain, T.forest, T.hill]);
paintLine(p, river, 0.7, T.stream);
// Terraces: a ring of high ground round each village clearing, with trails down to the river.
const villages: [string, number, number][] = [['kbayang', 38, 33], ['kalapau', 60, 59], ['sakahen', 78, 30]];
for (const [, cx, cy] of villages) {
  disc(cx, cy, 6, T.hill, [T.mountain, T.forest]);
  disc(cx, cy, 3, T.plain);
}
paintLine(p, [[38, 36], [40, 44]], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
paintLine(p, [[60, 56], [57, 47]], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
paintLine(p, [[78, 33], [74, 42]], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
// Refuge high in the northern mountains.
scatter(56, 2, 92, 12, 0.5, T.forest, [T.mountain], 22);

// --- Places ------------------------------------------------------------------------------------------
for (const [name, cx, cy] of villages) clearUnder(place({ type: 'truku_village', name, cx, cy, props: { owner: 'faction_truku' } }), T.plain);
const S = { owner: 'faction_sotokufu' };
clearUnder(place({ type: 'jp14_camp', name: 'hehuan', cx: 8, cy: 44, props: S }), T.hill);
clearUnder(place({ type: 'jp14_camp', name: 'xincheng', cx: 94, cy: 50, props: S }), T.plain);
for (const [name, cx, cy] of [['post_w1', 18, 44], ['post_w2', 18, 54], ['post_e1', 87, 41], ['post_e2', 87, 53]] as const)
  clearUnder(place({ type: 'jp14_post', name, cx, cy, props: S }), T.plain);

writeTiled('taroko', p, [
  ['west_base', 2, 34, 16, 58],
  ['east_base', 86, 38, 99, 62],
  // Village clearings (what has to be occupied) and the terraces round them (the defenders' posts).
  ['kbayang', 35, 30, 41, 36],
  ['kalapau', 57, 56, 63, 62],
  ['sakahen', 75, 27, 81, 33],
  ['kbayang_t', 32, 27, 44, 39],
  ['kalapau_t', 54, 53, 66, 65],
  ['sakahen_t', 72, 24, 84, 36],
  ['gorge', 42, 40, 82, 50],
  ['refuge_t', 56, 2, 92, 12],
]);
