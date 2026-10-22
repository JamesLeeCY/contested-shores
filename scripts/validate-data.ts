// Validates every data/*.json against its zod schema plus cross-references (spec §10.2).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateData } from '../src/data/validate';

const root = join(import.meta.dirname, '..');
const read = (p: string) => JSON.parse(readFileSync(join(root, p), 'utf8'));

const errors = validateData({
  units: read('data/units.json'),
  buildings: read('data/buildings.json'),
  techs: read('data/techs.json'),
  rules: read('data/rules.json'),
  factions: read('data/factions.json'),
  aiPlans: read('data/ai_plans.json'),
  i18n: read('i18n/zh-TW.json'),
});

if (errors.length) {
  console.error(`validate-data: ${errors.length} error(s)`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('validate-data: OK');
