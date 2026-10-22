// Sandbox setups used before the scenario system exists, and by perf checks.
//  - 'armies': both sides with a mixed army and fleets in the sea lanes.
//  - 'economy': Zheng starts from one camp in Saccam with labourers (stage 3 acceptance).
import type { World } from './world';

const Z = 'faction_zheng';
const V = 'faction_voc';

export type SandboxMode = 'armies' | 'economy';

export function setupSandbox(world: World, mode: SandboxMode = 'armies') {
  if (mode === 'economy') return setupEconomy(world);
  for (const f of world.factions.values()) f.stage = 4;
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

function setupEconomy(world: World) {
  const f = world.faction(Z)!;
  f.resources = { grain: 300, wood: 200, powder: 0, deerskin: 0 };
  // A camp on open plain in north Saccam, near the eastern woods.
  world.spawnBuilding('camp_zheng', Z, 124, 38);
  for (let i = 0; i < 6; i++) world.spawnUnit('laborer', Z, 123.5 + (i % 3), 43.5 + Math.floor(i / 3));
  world.spawnUnit('koxinga', Z, 122.5, 41.5);
}
