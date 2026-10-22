// Ordered list of per-tick systems. Importing this module also registers every command handler.
import { traitsOf } from '../traits';
import type { World } from '../world';
import { buildSystem } from './build';
import { combatSystem } from './combat';
import { economySystem } from './economy';
import { fogSystem } from './fog';
import { moraleSpeedMul, moraleSystem } from './morale';
import { movementSystem, speedModifiers } from './movement';
import { productionSystem } from './production';
import { siegeSystem } from './siege';
import { tideSystem } from './tide';
import { transportSystem } from './transport';

export type System = (world: World) => void;

export const SYSTEMS: { name: string; fn: System }[] = [
  { name: 'tide', fn: tideSystem },
  { name: 'fog', fn: fogSystem },
  { name: 'production', fn: productionSystem },
  { name: 'build', fn: buildSystem },
  { name: 'economy', fn: economySystem },
  { name: 'combat', fn: combatSystem },
  { name: 'siege', fn: siegeSystem },
  { name: 'morale', fn: moraleSystem },
  { name: 'transport', fn: transportSystem },
  { name: 'movement', fn: movementSystem },
];

if (!speedModifiers.length) {
  speedModifiers.push(moraleSpeedMul);
  speedModifiers.push((world, e) => {
    let m = 1;
    for (const tr of traitsOf(world.data.units.get(e.type)!.traits)) m *= tr.speedMul?.(world, e) ?? 1;
    return m;
  });
}
