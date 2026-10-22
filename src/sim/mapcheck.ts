// The five map acceptance checks of spec §6.4, shared by scripts/validate-map.ts and tests.
import { T, findRegion, regionContains, type GameMap, type MapObject } from './map';
import { NavGrids, reachable, type TerrainRules } from './path/navgrid';

export interface CheckResult {
  name: string;
  ok: boolean;
  detail?: string;
}

interface RulesLike {
  terrain: TerrainRules;
  diplomacy: { territoryRadius: number };
  combat: { elevatedRangeBonus: number };
}
interface BuildingLike {
  id: string;
  attack: { range: number } | null;
  size: number;
}

const touches = (o: MapObject) => (x: number, y: number) =>
  x >= o.x - 1 && y >= o.y - 1 && x <= o.x + o.w && y <= o.y + o.h;

/** Tiles within `radius` of a village centre (its territory). */
export function territoryTiles(map: GameMap, cx: number, cy: number, radius: number): number[] {
  const out: number[] = [];
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++)
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++)
      if (x >= 0 && y >= 0 && x < map.width && y < map.height && (x - cx) ** 2 + (y - cy) ** 2 <= radius * radius)
        out.push(y * map.width + x);
  return out;
}

export function checkMap(map: GameMap, rules: RulesLike, buildings: BuildingLike[]): CheckResult[] {
  const nav = new NavGrids(map, rules.terrain);
  const one = (type: string) => {
    const o = map.objects.find((o) => o.type === type);
    if (!o) throw new Error(`map has no ${type}`);
    return o;
  };
  // Buildings and walls block movement.
  for (const o of map.objects) if (o.type !== 'deer_herd') nav.setBlocked(o.x, o.y, o.w, o.h, true);

  const results: CheckResult[] = [];
  const openSea = findRegion(map, 'open_sea');
  const seaStart: [number, number] = [openSea.x + 5, 46];

  // 1. Deep-water route for big ships from the open sea to the Zeelandia dock, at any tide.
  const dock = one('dock_voc');
  const shipOk = [true, false].every((tide) => reachable(nav, 'ship', tide, seaStart, touches(dock)));
  results.push({ name: '大船可經主航道抵達熱蘭遮城碼頭（任何潮位）', ok: shipOk });

  // 2. Shallow route via Luermen to Heliao: open only at high tide. Exclude the main channel and
  //    deep water so the route has to go through the Luermen shallows.
  const heliao = findRegion(map, 'heliao');
  const main = findRegion(map, 'main_channel');
  const luermen = findRegion(map, 'luermen');
  const nearHeliao = (x: number, y: number) =>
    x >= heliao.x - 2 && y >= heliao.y - 2 && x <= heliao.x + heliao.w + 1 && y <= heliao.y + heliao.h + 1;
  const viaLuermen = (x: number, y: number) => !regionContains(main, x, y) && (x < 20 || map.terrain[y * map.width + x] !== T.deep_water);
  const luermenStart: [number, number] = [openSea.x + 15, luermen.y + 6];
  const high = reachable(nav, 'small_craft', true, luermenStart, nearHeliao, viaLuermen);
  const low = reachable(nav, 'small_craft', false, luermenStart, nearHeliao, viaLuermen);
  results.push({ name: '鹿耳門淺水道：漲潮可通禾寮港、退潮不通', ok: high && !low, detail: `漲潮=${high} 退潮=${low}` });

  // 3. At low tide infantry can walk from the southern spits to the Tayouan sand bar.
  const spits = findRegion(map, 'southern_spits');
  const tayouan = findRegion(map, 'tayouan');
  let spitStart: [number, number] | null = null;
  for (let y = spits.y + spits.h - 1; y >= spits.y && !spitStart; y--)
    for (let x = spits.x; x < spits.x + spits.w; x++)
      if (map.terrain[y * map.width + x] === T.sand) {
        spitStart = [x, y];
        break;
      }
  const walk = !!spitStart && reachable(nav, 'foot', false, spitStart, (x, y) => regionContains(tayouan, x, y) && y < 70);
  results.push({ name: '退潮時步兵可從南方沙洲走到大員', ok: walk, detail: spitStart ? `起點 ${spitStart}` : '找不到南方沙洲' });

  // 4. Utrecht redoubt sits on a hill and its guns (+elevation) reach the castle.
  const utrecht = one('utrecht_redoubt');
  const castle = one('zeelandia_castle');
  const [ux, uy] = [utrecht.x + Math.floor(utrecht.w / 2), utrecht.y + Math.floor(utrecht.h / 2)];
  const onHill = map.terrain[uy * map.width + ux] === T.hill;
  const range = (buildings.find((b) => b.id === 'utrecht_redoubt')?.attack?.range ?? 0) + rules.combat.elevatedRangeBonus;
  const cx = Math.max(castle.x, Math.min(ux, castle.x + castle.w - 1));
  const cy = Math.max(castle.y, Math.min(uy, castle.y + castle.h - 1));
  const dist = Math.hypot(cx - ux, cy - uy);
  results.push({ name: '烏特勒支堡位於高地且射程覆蓋主堡', ok: onHill && dist <= range, detail: `高地=${onHill} 距離=${dist.toFixed(1)} 射程=${range}` });

  // 5. Village territories do not overlap.
  const villages = map.objects.filter((o) => o.type === 'village_center');
  const owner = new Map<number, string>();
  const overlaps: string[] = [];
  for (const v of villages) {
    const c = [v.x + v.w / 2 - 0.5, v.y + v.h / 2 - 0.5];
    for (const i of territoryTiles(map, c[0], c[1], rules.diplomacy.territoryRadius)) {
      const prev = owner.get(i);
      if (prev && prev !== v.name && !overlaps.includes(`${prev}/${v.name}`)) overlaps.push(`${prev}/${v.name}`);
      owner.set(i, v.name);
    }
  }
  results.push({
    name: '各社領地互不重疊',
    ok: villages.length === 4 && overlaps.length === 0,
    detail: overlaps.length ? `重疊：${overlaps.join(', ')}` : `${villages.length} 社`,
  });
  return results;
}
