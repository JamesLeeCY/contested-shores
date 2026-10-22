import taijiang from '../../data/maps/taijiang.json';
import { mapFromTiled, type GameMap, type TiledMap } from '../sim/map';

export function loadMap(id = 'taijiang'): GameMap {
  if (id !== 'taijiang') throw new Error(`unknown map ${id}`);
  return mapFromTiled(id, taijiang as unknown as TiledMap);
}
