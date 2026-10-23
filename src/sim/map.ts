// Logical map: square grid loaded from a Tiled JSON export (spec §6.1).

export const TERRAIN_IDS = [
  'deep_water',
  'shallow',
  'tidal_flat',
  'sand',
  'plain',
  'farmland',
  'forest',
  'hill',
  'road',
  // 恆春半島 (1874 scenarios): stream beds and steep mountain slopes.
  'stream',
  'mountain',
] as const;
export type TerrainId = (typeof TERRAIN_IDS)[number];
export const T = Object.fromEntries(TERRAIN_IDS.map((id, i) => [id, i])) as Record<TerrainId, number>;

export interface MapObject {
  /** Building or marker type, e.g. `zeelandia_castle`, `deer_herd`. */
  type: string;
  /** Optional scenario tag (e.g. `hector`) or village id. */
  name: string;
  /** Top-left tile. */
  x: number;
  y: number;
  w: number;
  h: number;
  props: Record<string, string | number | boolean>;
}

export interface MapRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GameMap {
  id: string;
  width: number;
  height: number;
  /** Terrain index per tile (see TERRAIN_IDS), row-major. */
  terrain: Uint8Array;
  objects: MapObject[];
  regions: MapRegion[];
}

// Minimal subset of the Tiled 1.10 JSON format we read and write.
export interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool';
  value: string | number | boolean;
}
export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: 0;
  visible: true;
  properties?: TiledProperty[];
}
export interface TiledLayer {
  id: number;
  name: string;
  type: 'tilelayer' | 'objectgroup';
  data?: number[];
  objects?: TiledObject[];
  width?: number;
  height?: number;
  x: 0;
  y: 0;
  opacity: 1;
  visible: true;
}
export interface TiledMap {
  type: 'map';
  orientation: 'isometric';
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  layers: TiledLayer[];
  properties?: TiledProperty[];
  [k: string]: unknown;
}

export const idx = (m: { width: number }, x: number, y: number) => y * m.width + x;
export const inBounds = (m: { width: number; height: number }, x: number, y: number) =>
  x >= 0 && y >= 0 && x < m.width && y < m.height;

/**
 * Converts a Tiled JSON map. On isometric Tiled maps object pixel coordinates are measured
 * in tileheight units along both grid axes, so tile = px / tileheight.
 */
export function mapFromTiled(id: string, tm: TiledMap): GameMap {
  const terrainLayer = tm.layers.find((l) => l.type === 'tilelayer' && l.name === 'terrain');
  if (!terrainLayer?.data) throw new Error('map: missing terrain layer');
  const terrain = new Uint8Array(tm.width * tm.height);
  terrainLayer.data.forEach((gid, i) => (terrain[i] = Math.max(0, gid - 1)));
  const u = tm.tileheight;
  const toObj = (o: TiledObject): MapObject => ({
    type: o.type,
    name: o.name,
    x: Math.round(o.x / u),
    y: Math.round(o.y / u),
    w: Math.max(1, Math.round(o.width / u)),
    h: Math.max(1, Math.round(o.height / u)),
    props: Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value])),
  });
  const group = (name: string) =>
    tm.layers.find((l) => l.type === 'objectgroup' && l.name === name)?.objects ?? [];
  return {
    id,
    width: tm.width,
    height: tm.height,
    terrain,
    objects: group('objects').map(toObj),
    regions: group('regions').map((o) => {
      const r = toObj(o);
      return { id: r.name, x: r.x, y: r.y, w: r.w, h: r.h };
    }),
  };
}

export function regionContains(r: MapRegion, x: number, y: number) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

export function findRegion(m: GameMap, id: string): MapRegion {
  const r = m.regions.find((r) => r.id === id);
  if (!r) throw new Error(`map: unknown region ${id}`);
  return r;
}

export function objectCenter(o: { x: number; y: number; w: number; h: number }): [number, number] {
  return [o.x + o.w / 2, o.y + o.h / 2];
}
