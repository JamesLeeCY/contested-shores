// Ordered list of per-tick systems. Importing this module also registers every command handler.
import type { World } from '../world';
import { buildSystem } from './build';
import { economySystem } from './economy';
import { movementSystem } from './movement';
import { productionSystem } from './production';
import { tideSystem } from './tide';

export type System = (world: World) => void;

export const SYSTEMS: { name: string; fn: System }[] = [
  { name: 'tide', fn: tideSystem },
  { name: 'production', fn: productionSystem },
  { name: 'build', fn: buildSystem },
  { name: 'economy', fn: economySystem },
  { name: 'movement', fn: movementSystem },
];
