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

/** Fastest foot travel time (tile / speed units) between two tiles, or Infinity. */
function travelCost(nav: NavGrids, from: [number, number], to: [number, number], allow: (x: number, y: number) => boolean = () => true): number {
  const { width, height } = nav;
  const dist = new Float64Array(width * height).fill(Infinity);
  const done = new Uint8Array(width * height);
  const start = from[1] * width + from[0];
  const goal = to[1] * width + to[0];
  dist[start] = 0;
  // Simple bucketed Dijkstra (maps are small; this only runs in checks).
  const open = new Set<number>([start]);
  while (open.size) {
    let i = -1;
    let best = Infinity;
    for (const j of open)
      if (dist[j] < best) {
        best = dist[j];
        i = j;
      }
    open.delete(i);
    if (i === goal) return best;
    done[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        const s = nav.speedAt('foot', nx, ny, true);
        if (done[j] || s <= 0 || !allow(nx, ny)) continue;
        const d = best + Math.hypot(dx, dy) / s;
        if (d < dist[j]) {
          dist[j] = d;
          open.add(j);
        }
      }
  }
  return Infinity;
}

/** Acceptance checks for the 1874 map (恆春半島): the valley route, the gorge and the refuge. */
export function checkHengchun(map: GameMap, rules: RulesLike, hunterRange: number): CheckResult[] {
  const nav = new NavGrids(map, rules.terrain);
  for (const o of map.objects) nav.setBlocked(o.x, o.y, o.w, o.h, true);
  const centre = (id: string): [number, number] => {
    const r = findRegion(map, id);
    for (let d = 0; d < 6; d++)
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          if (Math.abs(x - (r.x + (r.w >> 1))) + Math.abs(y - (r.y + (r.h >> 1))) <= d && nav.passable('foot', x, y, true)) return [x, y];
    throw new Error(`region ${id} has no passable tile`);
  };
  const results: CheckResult[] = [];
  const camp = centre('sialiao');
  const mudan = findRegion(map, 'mudan');
  results.push({ name: '日軍可從射寮沿四重溪走到牡丹社', ok: reachable(nav, 'foot', true, camp, (x, y) => regionContains(mudan, x, y)) });

  const refuge = findRegion(map, 'refuge');
  const cut = ['mudan', 'nunai', 'kuskus'].filter((id) => !reachable(nav, 'foot', true, centre(id), (x, y) => regionContains(refuge, x, y)));
  results.push({ name: '三社族人都能走到深山避難處', ok: cut.length === 0, detail: cut.join(', ') });

  // The gorge floor is narrow: at most 5 open tiles between the cliffs.
  const gorge = findRegion(map, 'gorge');
  let widest = 0;
  for (let x = gorge.x; x < gorge.x + gorge.w; x++) {
    let open = 0;
    for (let y = gorge.y - 2; y <= gorge.y + gorge.h + 1; y++) if (map.terrain[y * map.width + x] !== T.mountain) open++;
    widest = Math.max(widest, open);
  }
  results.push({ name: '石門峽谷底寬不超過 5 格', ok: widest <= 5, detail: `最寬 ${widest}` });

  // Both heights overlook the stream within a hunter's range (+ elevation).
  const reach = hunterRange + rules.combat.elevatedRangeBonus;
  const covers = (id: string) => {
    const r = findRegion(map, id);
    for (let y = r.y; y < r.y + r.h; y++)
      for (let x = r.x; x < r.x + r.w; x++)
        if (map.terrain[y * map.width + x] === T.hill && Math.abs(y - (gorge.y + (gorge.h >> 1))) <= reach) return true;
    return false;
  };
  results.push({ name: '石門兩側高地居高臨下、射程涵蓋溪谷', ok: covers('shimen_n') && covers('shimen_s') });

  // Climbing round the gorge is possible but much slower than forcing it.
  const a = centre('gorge_mouth');
  const b = centre('beyond_gorge');
  const through = travelCost(nav, a, b);
  const around = travelCost(nav, a, b, (x, y) => !regionContains(gorge, x, y));
  results.push({ name: '繞過石門翻山的路程至少是穿越峽谷的 2 倍', ok: Number.isFinite(around) && around >= 2 * through, detail: `穿越 ${through.toFixed(0)}、繞山 ${around.toFixed(0)}` });
  return results;
}

/** Acceptance checks for the 1683 map (澎湖): sea lanes, the escape through 吼門, the harbour guns. */
export function checkPenghu(map: GameMap, rules: RulesLike, buildings: BuildingLike[]): CheckResult[] {
  const nav = new NavGrids(map, rules.terrain);
  for (const o of map.objects) nav.setBlocked(o.x, o.y, o.w, o.h, true);
  const deepIn = (id: string): [number, number] => {
    const r = findRegion(map, id);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (nav.passable('ship', x, y, false)) return [x, y];
    throw new Error(`region ${id} has no deep water`);
  };
  const results: CheckResult[] = [];
  const inRegion = (id: string) => {
    const r = findRegion(map, id);
    return (x: number, y: number) => regionContains(r, x, y);
  };
  const lanes = [true, false].every((tide) => reachable(nav, 'ship', tide, deepIn('qing_start'), inRegion('inner_harbor')));
  results.push({ name: '大船可從南方經港口入口駛入娘媽宮內港（任何潮位）', ok: lanes });
  const escape = [true, false].every((tide) => reachable(nav, 'ship', tide, deepIn('inner_harbor'), inRegion('north_exit')));
  results.push({ name: '大船可從內港經吼門駛出北方（劉國軒的退路）', ok: escape });
  const anchorage = reachable(nav, 'ship', false, deepIn('qing_start'), inRegion('bazhao'));
  results.push({ name: '八罩有大船可泊的海域', ok: anchorage });
  // The forts at the harbour mouth and at 娘媽宮 reach the water they guard.
  const covers = (fortName: string, region: string) => {
    const o = map.objects.find((x) => x.name === fortName)!;
    const range = buildings.find((b) => b.id === o.type)!.attack!.range;
    const r = findRegion(map, region);
    const [cx, cy] = [r.x + r.w / 2, r.y + r.h / 2];
    return Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) <= range + 2;
  };
  results.push({ name: '風櫃尾砲城的射程涵蓋港口入口、娘媽宮砲城涵蓋內港', ok: covers('fenggui', 'bay_mouth') && covers('niangmagong', 'inner_harbor') });
  return results;
}

/** Foot routes between named regions (1895 maps): every pair must be connected at any tide. */
export function checkRoutes(map: GameMap, rules: RulesLike, routes: [from: string, to: string, label: string][]): CheckResult[] {
  const nav = new NavGrids(map, rules.terrain);
  for (const o of map.objects) nav.setBlocked(o.x, o.y, o.w, o.h, true);
  const start = (id: string): [number, number] => {
    const r = findRegion(map, id);
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (nav.passable('foot', x, y, false)) return [x, y];
    throw new Error(`region ${id} has no passable tile`);
  };
  return routes.map(([from, to, label]) => {
    const r = findRegion(map, to);
    const ok = [true, false].every((tide) => reachable(nav, 'foot', tide, start(from), (x, y) => regionContains(r, x, y)));
    return { name: label, ok };
  });
}
