// Spec §6.4: path-finding checks on data/maps/taijiang.json, plus the 1874 map's checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkHengchun, checkMap, checkPenghu, checkRoutes } from '../src/sim/mapcheck';
import { mapFromTiled } from '../src/sim/map';

const root = join(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const map = mapFromTiled('taijiang', read('data/maps/taijiang.json'));
const rules = read('data/rules.json');
const hunter = read('data/units.json').find((u: { id: string }) => u.id === 'paiwan_hunter');
const results = [
  ...checkMap(map, rules, read('data/buildings.json')),
  ...checkHengchun(mapFromTiled('hengchun', read('data/maps/hengchun.json')), rules, hunter.range),
  ...checkPenghu(mapFromTiled('penghu', read('data/maps/penghu.json')), rules, read('data/buildings.json')),
  ...checkRoutes(mapFromTiled('taipei', read('data/maps/taipei.json')), rules, [
    ['aodi', 'ruifang', '澳底登陸灘可經三貂嶺走到瑞芳'],
    ['ruifang', 'keelung', '瑞芳可到基隆'],
    ['keelung', 'taipei', '基隆可經獅球嶺到臺北'],
    ['taipei', 'hsinchu', '臺北可南下新竹'],
    ['hsinchu', 'miaoli', '新竹可到苗栗'],
  ]),
  ...checkRoutes(mapFromTiled('tainan', read('data/maps/tainan.json')), rules, [
    ['north_bank', 'baguashan', '大肚溪北岸可渡河攻上八卦山'],
    ['baguashan', 'chiayi', '彰化可南下嘉義'],
    ['chiayi', 'tainan', '嘉義可到臺南'],
    ['budai', 'tainan', '布袋嘴可到臺南'],
    ['fangliao', 'tainan', '枋寮可北上臺南'],
  ]),
];

let failed = 0;
for (const r of results) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  if (!r.ok) failed++;
}
if (failed) {
  console.error(`validate-map: ${failed} check(s) failed`);
  process.exit(1);
}
console.log('validate-map: OK');
