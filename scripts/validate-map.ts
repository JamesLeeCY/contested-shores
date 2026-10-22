// Spec §6.4: path-finding checks on data/maps/taijiang.json.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkMap } from '../src/sim/mapcheck';
import { mapFromTiled } from '../src/sim/map';

const root = join(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const map = mapFromTiled('taijiang', read('data/maps/taijiang.json'));
const results = checkMap(map, read('data/rules.json'), read('data/buildings.json'));

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
