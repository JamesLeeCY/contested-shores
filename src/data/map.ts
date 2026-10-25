import hengchun from '../../data/maps/hengchun.json';
import penghu from '../../data/maps/penghu.json';
import tainan from '../../data/maps/tainan.json';
import taipei from '../../data/maps/taipei.json';
import taroko from '../../data/maps/taroko.json';
import taijiang from '../../data/maps/taijiang.json';
import { mapFromTiled, type GameMap, type TiledMap } from '../sim/map';

const MAPS: Record<string, unknown> = { taijiang, hengchun, penghu, taipei, tainan, taroko };
const cache = new Map<string, GameMap>();

export function loadMap(id = 'taijiang'): GameMap {
  const tm = MAPS[id];
  if (!tm) throw new Error(`unknown map ${id}`);
  let m = cache.get(id);
  if (!m) cache.set(id, (m = mapFromTiled(id, tm as TiledMap)));
  return m;
}
