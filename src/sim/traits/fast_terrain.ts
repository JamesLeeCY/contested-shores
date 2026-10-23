// 社戰士 and 排灣族: no speed penalty in forest, on tidal flats and stream beds; mountain trails
// they know are walked at `terrain.types.mountain.trailSpeed` instead of the climb speed.
import { T } from '../map';
import type { TraitHandler } from './types';

export const fast_terrain: TraitHandler = {
  speedMul(world, e) {
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    const t = world.map.terrain[ty * world.map.width + tx];
    const s = world.nav.speedAt('foot', tx, ty);
    if (t === T.mountain) {
      const trail = (world.rules.terrain.types.mountain as { trailSpeed?: number }).trailSpeed ?? 1;
      return s > 0 && s < trail ? trail / s : 1;
    }
    if (t !== T.forest && t !== T.tidal_flat && t !== T.stream) return 1;
    return s > 0 && s < 1 ? 1 / s : 1;
  },
};
