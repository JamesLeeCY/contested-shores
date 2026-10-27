// Player and AI commands: the only way game state changes from outside the simulation (spec §10.3).
import { clearMove, moveGroup } from './systems/movement';
import type { Owner } from './types';
import type { World } from './world';

/** `ai` marks commands the AI issued: replays skip them because the AI issues them again. */
export type Command = BaseCommand & { ai?: true };

type BaseCommand =
  | { type: 'move'; owner: Owner; ids: number[]; x: number; y: number }
  | { type: 'stop'; owner: Owner; ids: number[] }
  | { type: 'gather'; owner: Owner; ids: number[]; target?: number; tile?: number }
  | { type: 'place'; owner: Owner; building: string; tx: number; ty: number; builders: number[] }
  | { type: 'build'; owner: Owner; ids: number[]; target: number }
  | { type: 'produce'; owner: Owner; building: number; unit: string }
  | { type: 'research'; owner: Owner; building: number; tech: string }
  | { type: 'cancel'; owner: Owner; building: number; index: number }
  | { type: 'rally'; owner: Owner; building: number; x: number; y: number }
  | { type: 'garrison'; owner: Owner; ids: number[]; target: number }
  | { type: 'ungarrison'; owner: Owner; building: number; ids?: number[] }
  | { type: 'attack'; owner: Owner; ids: number[]; target: number }
  | { type: 'attack_move'; owner: Owner; ids: number[]; x: number; y: number }
  | { type: 'attack_ground'; owner: Owner; ids: number[]; x: number; y: number }
  | { type: 'stance'; owner: Owner; ids: number[]; hold: boolean; holdFire?: boolean }
  | { type: 'patrol'; owner: Owner; ids: number[]; x: number; y: number }
  | { type: 'dig_mine'; owner: Owner; ids: number[]; target: number }
  | { type: 'embark'; owner: Owner; ids: number[]; target: number }
  | { type: 'unload'; owner: Owner; ids: number[]; x?: number; y?: number }
  | {
      type: 'diplomacy';
      owner: Owner;
      party: string;
      action: 'gift_grain' | 'gift_deerskin' | 'pacify' | 'request_warriors' | 'raid' | 'requisition';
    }
  | { type: 'sandbox'; owner: Owner; action: string; arg?: string | number }
  | { type: 'choice'; owner: Owner; id: string }
  | { type: 'cheat'; owner: Owner; code: string };

export type CommandHandler<C extends Command = Command> = (world: World, cmd: C) => void;
const handlers = new Map<string, CommandHandler>();

/** Later systems register their command types here. */
export function registerCommand<T extends Command['type']>(type: T, fn: CommandHandler<Extract<Command, { type: T }>>) {
  handlers.set(type, fn as CommandHandler);
}

/** Live, commandable units in `ids` that belong to `owner`, ascending id (routing units ignore orders). */
export function ownedUnits(world: World, owner: Owner, ids: number[]) {
  return [...new Set(ids)]
    .sort((a, b) => a - b)
    .map((id) => world.get(id))
    .filter((e) => e && e.kind === 'unit' && e.owner === owner && !e.insideOf && e.order?.type !== 'rout') as NonNullable<ReturnType<World['get']>>[];
}

registerCommand('move', (world, cmd) => {
  const units = ownedUnits(world, cmd.owner, cmd.ids).filter((u) => !u.stranded);
  for (const u of units) u.order = { type: 'move', x: cmd.x, y: cmd.y };
  moveGroup(world, units, cmd.x, cmd.y);
});

registerCommand('stop', (world, cmd) => {
  for (const u of ownedUnits(world, cmd.owner, cmd.ids)) {
    clearMove(world, u);
    u.order = { type: 'idle' };
  }
});

export function executeCommand(world: World, cmd: Command) {
  const h = handlers.get(cmd.type);
  if (!h) throw new Error(`no handler for command ${cmd.type}`);
  world.commandLog.push({ tick: world.tick, cmd });
  h(world, cmd);
}
