// Map registry. 臺江 (1661, the tutorial, the sandboxes and the menu) ships with the game; every other
// map is its own download, fetched when its chapter starts (`preloadMap`). Under Node (tests, dev
// scripts) a map that was never preloaded is read from disk on first use.
import taijiang from '../../data/maps/taijiang.json';
import { mapFromTiled, type GameMap, type TiledMap } from '../sim/map';

const MAPS: Record<string, unknown> = { taijiang };
const LOADERS: Record<string, () => Promise<{ default: unknown }>> = {
  hengchun: () => import('../../data/maps/hengchun.json'),
  penghu: () => import('../../data/maps/penghu.json'),
  tainan: () => import('../../data/maps/tainan.json'),
  taipei: () => import('../../data/maps/taipei.json'),
  taroko: () => import('../../data/maps/taroko.json'),
  wushe: () => import('../../data/maps/wushe.json'),
  tamsui: () => import('../../data/maps/tamsui.json'),
  keelung: () => import('../../data/maps/keelung.json'),
};
const cache = new Map<string, GameMap>();

/** Fetches a map's file (once) so that `loadMap` can build it. */
export async function preloadMap(id = 'taijiang') {
  if (MAPS[id]) return;
  const load = LOADERS[id];
  if (!load) throw new Error(`unknown map ${id}`);
  MAPS[id] = (await load()).default;
}

/** Node only: the map file read synchronously (the bundler never sees this path). */
function readFromDisk(id: string): unknown {
  const fs = (globalThis as { process?: { getBuiltinModule?: (m: string) => { readFileSync: (p: URL, enc: string) => string } } }).process?.getBuiltinModule?.('fs');
  if (!fs || !LOADERS[id]) return undefined;
  return JSON.parse(fs.readFileSync(new URL(['..', '..', 'data', 'maps', `${id}.json`].join('/'), import.meta.url), 'utf8'));
}

export function loadMap(id = 'taijiang'): GameMap {
  const tm = (MAPS[id] ??= readFromDisk(id));
  if (!tm) throw new Error(`map ${id} not loaded (preloadMap first)`);
  let m = cache.get(id);
  if (!m) cache.set(id, (m = mapFromTiled(id, tm as TiledMap)));
  return m;
}
