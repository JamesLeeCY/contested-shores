// Sandbox setup used before the scenario system exists, and by perf checks: both sides with a
// mixed army, fleets in the sea lanes.
import type { World } from './world';

export function setupSandbox(world: World) {
  const Z = 'faction_zheng';
  const V = 'faction_voc';
  world.spawnUnit('koxinga', Z, 40.5, 36.5);
  const zTypes = ['shield_soldier', 'archer_zheng', 'iron_man', 'musketeer_zheng'];
  for (let i = 0; i < 80; i++) world.spawnUnit(zTypes[i % 4], Z, 33 + (i % 16) * 0.9, 32.5 + Math.floor(i / 16) * 0.9);
  for (let i = 0; i < 20; i++) world.spawnUnit('laborer', Z, 48 + (i % 10) * 0.9, 37 + Math.floor(i / 10) * 0.9);
  for (let i = 0; i < 16; i++) world.spawnUnit('junk', Z, 6 + (i % 4) * 3, 14 + Math.floor(i / 4) * 3);
  world.spawnUnit('coyett', V, 44.5, 62);
  for (let i = 0; i < 24; i++) world.spawnUnit(i % 3 ? 'musketeer_voc' : 'pikeman', V, 36 + (i % 8) * 0.9, 63 + Math.floor(i / 8) * 0.9);
  for (let i = 0; i < 6; i++) world.spawnUnit('company_worker', V, 56 + (i % 3), 66 + Math.floor(i / 3));
  world.spawnUnit('warship', V, 30, 46.5, 'hector');
  world.spawnUnit('yacht', V, 36, 47.5);
  world.spawnUnit('longboat', V, 42, 48.5);
  world.spawnUnit('longboat', V, 44, 47.5);
}
