import { Container, Graphics } from 'pixi.js';
import { TERRAIN_IDS, type GameMap } from '../sim/map';
import { TILE_H, TILE_W, toScreen } from './iso';

const shade = (hex: number, f: number) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
  const b = Math.min(255, Math.round((hex & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/** Static terrain as batched diamond geometry, split into 16×16-tile chunks for culling. */
export function buildTerrain(map: GameMap, colors: Record<string, string>): Container {
  const root = new Container();
  const base = TERRAIN_IDS.map((id) => parseInt(colors[id].slice(1), 16));
  const CHUNK = 16;
  for (let cy = 0; cy < map.height; cy += CHUNK)
    for (let cx = 0; cx < map.width; cx += CHUNK) {
      const g = new Graphics();
      for (let y = cy; y < Math.min(map.height, cy + CHUNK); y++)
        for (let x = cx; x < Math.min(map.width, cx + CHUNK); x++) {
          const t = map.terrain[y * map.width + x];
          // Cheap per-tile variation so large areas do not look flat.
          const n = (((x * 73856093) ^ (y * 19349663)) >>> 0) % 7;
          const p = toScreen(x, y);
          g.poly([p.x, p.y, p.x + TILE_W / 2, p.y + TILE_H / 2, p.x, p.y + TILE_H, p.x - TILE_W / 2, p.y + TILE_H / 2]).fill(
            shade(base[t], 0.94 + n * 0.02),
          );
        }
      g.cullable = true;
      root.addChild(g);
    }
  return root;
}
