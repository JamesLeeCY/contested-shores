import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapFromTiled, T } from '../src/sim/map';
import { checkMap } from '../src/sim/mapcheck';
import { loadMap } from '../src/data/map';

const rules = JSON.parse(readFileSync('data/rules.json', 'utf8'));
const buildings = JSON.parse(readFileSync('data/buildings.json', 'utf8'));

describe('taijiang map', () => {
  it('passes all five §6.4 checks', () => {
    const results = checkMap(loadMap(), rules, buildings);
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(results).toHaveLength(5);
  });

  it('fails the Luermen check when the channel is dredged to deep water', () => {
    const tiled = JSON.parse(readFileSync('data/maps/taijiang.json', 'utf8'));
    const map = mapFromTiled('t', tiled);
    for (let y = 18; y <= 30; y++) for (let x = 20; x <= 30; x++) map.terrain[y * map.width + x] = T.deep_water;
    for (let y = 18; y <= 42; y++) for (let x = 31; x <= 110; x++) if (map.terrain[y * map.width + x] === T.shallow) map.terrain[y * map.width + x] = T.deep_water;
    const luermen = checkMap(map, rules, buildings)[1];
    expect(luermen.ok).toBe(false);
  });

  it('places Zeelandia at spec coordinates (44,57)', () => {
    const castle = loadMap().objects.find((o) => o.type === 'zeelandia_castle')!;
    expect(castle.x <= 44 && 44 < castle.x + castle.w && castle.y <= 57 && 57 < castle.y + castle.h).toBe(true);
  });
});
