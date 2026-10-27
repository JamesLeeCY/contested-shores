// Cheat codes, after Age of Empires II (1999): typed into the cheat line (Enter), they arrive as a
// `cheat` command so saves and replays still reproduce the game. The first one marks the game as
// cheated for good: the result screen shows it and no rating is recorded.
import { registerCommand } from './commands';
import { nearestPassable } from './path/astar';
import type { Entity, Owner } from './types';
import type { World } from './world';

export const CHEATS: Record<string, string> = {
  'how do you turn this on': 'cobra',
  '發財啦': 'truck',
  '滷肉飯': 'grain',
  '阿里山': 'wood',
  '火藥庫': 'powder',
  '鹿皮': 'deerskin',
  marco: 'reveal',
  aegis: 'instant',
};
const CODES = new Set(Object.values(CHEATS));

/** The cheat code for what the player typed (case, extra spaces ignored), or null. */
export function cheatCode(text: string): string | null {
  return CHEATS[text.trim().toLowerCase().replace(/\s+/g, ' ')] ?? null;
}

export const cheated = (world: World, owner: Owner) => !!world.ext.flags[`cheated:${owner}`];
export const cheatOn = (world: World, owner: Owner, code: 'reveal' | 'instant') => !!world.ext.flags[`cheat:${code}:${owner}`];

/** Where a cheat vehicle appears: by the player's largest building, else their hero, else any unit. */
function anchor(world: World, owner: Owner): Entity | undefined {
  const mine = [...world.all()].filter((e) => e.owner === owner && !e.insideOf);
  const buildings = mine.filter((e) => e.kind === 'building' && (e.built ?? 1) >= 1).sort((a, b) => b.w! * b.h! - a.w! * a.h! || a.id - b.id);
  const units = mine.filter((e) => e.kind === 'unit' && e.moveClass === 'foot');
  const hero = units.find((e) => world.data.units.get(e.type)!.traits.includes('hero'));
  return buildings[0] ?? hero ?? units[0];
}

registerCommand('cheat', (world, cmd) => {
  if (!CODES.has(cmd.code) || !world.faction(cmd.owner)) return;
  world.ext.flags[`cheated:${cmd.owner}`] = true;
  const f = world.faction(cmd.owner)!;
  let key = `cheat.ok.${cmd.code}`;
  switch (cmd.code) {
    case 'cobra':
    case 'truck': {
      const a = anchor(world, cmd.owner);
      if (!a) return;
      const ox = a.kind === 'building' ? a.x + a.w! / 2 + 1 : a.x + 1;
      const oy = a.kind === 'building' ? a.y + a.h! / 2 + 1 : a.y + 1;
      const p = nearestPassable(world.nav, 'foot', Math.floor(ox), Math.floor(oy), 12);
      if (!p) return;
      const u = world.spawnUnit(cmd.code === 'cobra' ? 'cobra_car' : 'fatsai_truck', cmd.owner, p[0] + 0.5, p[1] + 0.5);
      world.emit({ type: 'horn', id: u.id, owner: cmd.owner, x: u.x, y: u.y });
      break;
    }
    case 'grain':
    case 'wood':
    case 'powder':
    case 'deerskin':
      f.resources[cmd.code] += 1000;
      break;
    case 'reveal':
    case 'instant': {
      const k = `cheat:${cmd.code}:${cmd.owner}`;
      world.ext.flags[k] = !world.ext.flags[k];
      if (!world.ext.flags[k]) key += '_off';
      break;
    }
  }
  world.emit({ type: 'message', to: cmd.owner, textKey: key, kind: 'good' });
});
