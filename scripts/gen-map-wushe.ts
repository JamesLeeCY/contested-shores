// Generates data/maps/wushe.json: 霧社 and the upper 濁水溪 in 1930. The road climbs from 眉溪
// (west, towards 埔里) to the 霧社 terrace (the police branch office, the school, the post office);
// east of it the Tgdaya villages sit on terraces above the river, with police posts beside them,
// and beyond 馬赫坡 rise the cliffs of the 馬赫坡岩窟. Schematic: relative positions right,
// distances compressed.
import { T } from '../src/sim/map';
import { Painter, paintLine, writeTiled } from './map-kit';

const W = 120;
const H = 90;
const p = new Painter(W, H, T.mountain);
const { rect, disc, scatter, place, clearUnder } = p;

// Mountain forest everywhere; the 霧社 terrace is open ground with a rim of slopes.
scatter(0, 0, W - 1, H - 1, 0.38, T.forest, [T.mountain], 31);
disc(35, 48, 12, T.hill, [T.mountain, T.forest]);
rect(26, 40, 44, 56, T.plain);

// --- The road from 眉溪 and the 濁水溪 valley. ----------------------------------------------------------
const road: [number, number][] = [[0, 48], [12, 49], [26, 48]];
paintLine(p, road, 1.6, T.plain, [T.mountain, T.forest, T.hill]);
const river: [number, number][] = [[26, 56], [44, 57], [60, 51], [76, 49], [92, 44], [104, 36], [112, 26]];
paintLine(p, river, 2.2, T.plain, [T.mountain, T.forest, T.hill]);
paintLine(p, river, 0.7, T.stream);
// Wooded heights on both sides of the 眉溪 road (where the relief column was held up by snipers).
disc(15, 42, 4, T.hill, [T.mountain, T.forest]);
disc(15, 56, 4, T.hill, [T.mountain, T.forest]);

// --- Villages on terraces, each with a trail down to the river. -----------------------------------------
const villages: [string, number, number, [number, number]][] = [
  ['suku', 50, 30, [48, 42]],
  ['gungu', 64, 34, [62, 50]],
  ['drodux', 84, 28, [88, 45]],
  ['truwan', 76, 60, [76, 49]],
  ['boarung', 56, 72, [54, 54]],
  ['mahebu', 100, 24, [102, 38]],
];
for (const [, cx, cy, to] of villages) {
  disc(cx, cy, 6, T.hill, [T.mountain, T.forest]);
  disc(cx, cy, 3, T.plain);
  paintLine(p, [[cx, cy], to], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
}
// Paths to the outlying posts (屯巴拉 to the south-west, 能高 on the road east to 花蓮港).
paintLine(p, [[22, 66], [30, 56]], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
paintLine(p, [[82, 66], [80, 50]], 0.8, T.plain, [T.mountain, T.forest, T.hill]);
// 馬赫坡岩窟: cliffs behind 馬赫坡, a ledge of high ground reached by one trail.
disc(110, 18, 5, T.forest, [T.mountain]);
paintLine(p, [[100, 24], [110, 18]], 0.8, T.plain, [T.mountain, T.forest]);
scatter(104, 8, 118, 28, 0.55, T.forest, [T.mountain], 32);

// --- Places ---------------------------------------------------------------------------------------------
for (const [name, cx, cy] of villages) clearUnder(place({ type: 'sdq_village', name, cx, cy, props: { owner: 'faction_neutral' } }), T.plain);
const S = { owner: 'faction_sotokufu' };
clearUnder(place({ type: 'sdq_branch', name: 'wushe_branch', cx: 33, cy: 46, props: S }), T.plain);
clearUnder(place({ type: 'wushe_school', name: 'wushe_school', cx: 39, cy: 52, props: { owner: 'faction_neutral' } }), T.plain);
const posts: [string, number, number][] = [
  ['post_sakura', 46, 40],
  ['post_gungu', 64, 43],
  ['post_mahebu', 98, 33],
  ['post_boarung', 57, 63],
  ['post_nengao', 82, 66],
  ['post_tunbara', 22, 66],
];
for (const [name, cx, cy] of posts) clearUnder(place({ type: 'sdq_post', name, cx, cy, props: S }), T.plain);

writeTiled('wushe', p, [
  ['meixi', 0, 43, 12, 55],
  ['meixi_n', 11, 38, 19, 46],
  ['meixi_s', 11, 52, 19, 60],
  ['wushe', 26, 40, 44, 56],
  ['wushe_e', 46, 44, 55, 56],
  ['east_valley', 56, 40, 96, 54],
  // Village clearings (what is occupied) and the terraces round them (the defenders' posts).
  ['truwan', 73, 57, 79, 63],
  ['truwan_t', 70, 54, 82, 66],
  ['mahebu', 97, 21, 103, 27],
  ['mahebu_t', 94, 18, 106, 30],
  ['cave', 105, 13, 115, 23],
  ['refuge', 104, 2, 118, 12],
  ['north_edge', 60, 0, 80, 4],
]);
