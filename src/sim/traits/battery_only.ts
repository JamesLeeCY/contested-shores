// 重砲: may only fire while standing on a completed battery.
import { onBattery } from '../systems/combat';
import type { TraitHandler } from './types';

export const battery_only: TraitHandler = {
  canFire(world, e) {
    return onBattery(world, e);
  },
};
