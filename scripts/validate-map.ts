// Spec §6.4: path-finding checks on data/maps/taijiang.json, plus the 1874 map's checks.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkHengchun, checkMap, checkPenghu } from '../src/sim/mapcheck';
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
