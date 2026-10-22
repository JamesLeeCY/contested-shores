// 社戰士: no speed penalty in forest and on tidal flats.
import { T } from '../map';
import type { TraitHandler } from './types';

export const fast_terrain: TraitHandler = {
  speedMul(world, e) {
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    const t = world.map.terrain[ty * world.map.width + tx];
    if (t !== T.forest && t !== T.tidal_flat) return 1;
    const s = world.nav.speedAt('foot', tx, ty);
    return s > 0 && s < 1 ? 1 / s : 1;
  },
};
