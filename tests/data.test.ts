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
