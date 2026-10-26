import { describe, expect, it } from 'vitest';
import { RAW } from '../src/data/load';
import { validateData } from '../src/data/validate';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('validateData', () => {
  it('accepts the shipped data', () => {
    expect(validateData(RAW)).toEqual([]);
  });

  it('rejects a producedAt pointing at a missing building', () => {
    const raw = clone(RAW);
    (raw.units as { id: string; producedAt: string[] }[])[1].producedAt = ['barracks_typo'];
    expect(validateData(raw).join('\n')).toMatch(/unknown building "barracks_typo"/);
  });

  it('rejects an unknown trait', () => {
    const raw = clone(RAW);
    (raw.units as { traits: string[] }[])[0].traits.push('teleport');
    expect(validateData(raw).length).toBeGreaterThan(0);
  });

  it('rejects a missing i18n key', () => {
    const raw = clone(RAW);
    delete raw.i18n['unit.junk.name'];
    expect(validateData(raw).join('\n')).toMatch(/unit\.junk\.name/);
  });

  it('transcribes spec §5.2 values verbatim', () => {
    const units = RAW.units as { id: string; hp: number; atk: number; range: number }[];
    const warship = units.find((u) => u.id === 'warship')!;
    expect([warship.hp, warship.atk, warship.range]).toEqual([900, 70, 10]);
  });
});

describe('scenario field shapes (read from the engine types)', () => {
  it('flags a misspelt field and a missing required one, in units, triggers and actions', async () => {
    const { readFileSync } = await import('node:fs');
    const { scenarioShapes } = await import('../src/data/scenario-shape');
    const { validateScenario } = await import('../src/data/validate-scenario');
    const shapes = scenarioShapes(readFileSync('src/sim/scenario/types.ts', 'utf8'), readFileSync('src/sim/scenario/triggers.ts', 'utf8'));
    expect(shapes.actions.air_raid).toMatchObject({ type: true, owner: true, target: true, damage: false });
    const sc = JSON.parse(readFileSync('data/scenarios/sf1.json', 'utf8'));
    sc.units[0].cuont = 1;
    delete sc.triggers[1].do[0].units[0].count;
    sc.triggers[0].when.secs = 3;
    const ctx = { units: new Set<string>(), buildings: new Set<string>(), plans: new Set<string>(), regions: new Set<string>(), cutscenes: {}, i18n: {}, shapes };
    const errs = validateScenario('sf1.json', sc, ctx).filter((e) => /field/.test(e));
    expect(errs).toEqual([
      'sf1.json: units[0]: unknown field "cuont"',
      'sf1.json: trigger sf1_start (time_elapsed): unknown field "secs"',
      'sf1.json: trigger sf1_land (spawn_units).units: missing field "count"',
    ]);
  });
});
