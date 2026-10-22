// Validates every data/*.json against its zod schema plus cross-references (spec §10.2).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateData } from '../src/data/validate';
import { validateCutscenes, validateScenario } from '../src/data/validate-scenario';

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

// Scenarios and cutscenes.
const map = read('data/maps/taijiang.json');
const regions = new Set<string>(map.layers.find((l: { name: string }) => l.name === 'regions').objects.map((o: { name: string }) => o.name));
const cutscenes = read('data/cutscenes.json');
const i18n = read('i18n/zh-TW.json');
const ctx = {
  units: new Set<string>(read('data/units.json').map((u: { id: string }) => u.id)),
  buildings: new Set<string>(read('data/buildings.json').map((b: { id: string }) => b.id)),
  plans: new Set<string>(read('data/ai_plans.json').map((p: { id: string }) => p.id)),
  regions,
  cutscenes,
  i18n,
};
for (const f of readdirSync(join(root, 'data/scenarios'))) errors.push(...validateScenario(f, read(`data/scenarios/${f}`), ctx));
errors.push(...validateCutscenes(cutscenes, i18n));

if (errors.length) {
  console.error(`validate-data: ${errors.length} error(s)`);
  for (const e of errors) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log('validate-data: OK');
