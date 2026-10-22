// World state: entity storage, factions, tide, and the command queue (spec §10.2–10.3).
import { T, type GameMap, type MapObject } from './map';
import { NavGrids, type MoveClass } from './path/navgrid';
import { PathService } from './path/pathing';
import { Rng } from './rng';
import { initialExt, type ExtState } from './state';
import type { Command } from './commands';
import { PLAYABLE, type Entity, type FactionState, type Owner, type RulesData, type SimData, type SimEvent } from './types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export interface WorldOptions {
  seed: number;
  /** Player faction start resources override (scenario). */
  resources?: Partial<Record<Owner, Partial<Record<string, number>>>>;
  /** Skip spawning preset map buildings (used by focused unit tests). */
  emptyMap?: boolean;
  /** Disable fog of war (tests, sandbox). */
  noFog?: boolean;
  /** Sandbox: enables the debug `sandbox` command. */
  sandbox?: boolean;
  /** Player-controlled faction (difficulty modifiers apply to it). */
  player?: Owner;
  chapter?: number;
}

export class World {
  tick = 0;
  readonly rng: Rng;
  readonly rules: RulesData;
  readonly nav: NavGrids;
  readonly paths: PathService;
  readonly entities = new Map<number, Entity>();
  /** Entity ids in ascending order; rebuilt lazily. Iterate this, never the Map, for determinism. */
  private sorted: number[] = [];
  private sortedDirty = false;
  nextId = 1;
  readonly factions = new Map<Owner, FactionState>();
  /** Index into rules.tide.phases and ticks elapsed within it. */
  tidePhase = 0;
  tideTick = 0;
  chapter: number;
  /** Commands waiting to execute at the start of the next tick. */
  pending: Command[] = [];
  /** Every executed command with the tick it ran on (for save/replay, spec §10.5). */
  readonly commandLog: { tick: number; cmd: Command }[] = [];
  /** Events produced during the last tick, drained by the client. */
  events: SimEvent[] = [];
  /** Wood left per forest tile (spec §4.1). */
  readonly woodLeft: Float32Array;
  /** Building id occupying each tile (0 = none), including walkable ones (farms, trenches). */
  readonly occupancy: Int32Array;
  /** The scenario being played, if any (static data; progress lives in ext.flags). */
  scenario: import('./scenario/types').Scenario | null = null;
  /** Campaign-system state (diplomacy, supply, typhoon, events). */
  ext: ExtState = initialExt();
  /** Active weather effects (typhoon, spec §4.10). */
  weather = { active: false, sightMul: 1, rangedHitPenalty: 0 };
  private heroCache: { tick: number; list: Entity[] } = { tick: -1, list: [] };
  private buildingCache: Entity[] | null = null;
  /** Spatial hash for units: cell → ids. */
  private grid = new Map<number, number[]>();
  static readonly CELL = 2;

  readonly map: GameMap;

  constructor(
    readonly data: SimData,
    map: GameMap,
    readonly opts: WorldOptions,
  ) {
    // Terrain can change during play (forests are cut down), so each world owns a copy.
    this.map = { ...map, terrain: new Uint8Array(map.terrain) };
    this.rng = new Rng(opts.seed);
    this.rules = clone(data.rules);
    this.chapter = opts.chapter ?? 1;
    this.nav = new NavGrids(this.map, this.rules.terrain);
    this.paths = new PathService(this.nav);
    for (const f of data.factions.playable) {
      this.factions.set(f.id, {
        id: f.id,
        resources: { ...f.startResources, ...(opts.resources?.[f.id] ?? {}) },
        basePopCap: f.basePopCap,
        techs: [],
        stage: 1,
        castleMorale: f.id === 'faction_voc' ? this.rules.morale.castle.start : 0,
        defeated: false,
        unitMods: {},
        buildingMods: {},
        revealTerrain: [],
        starvingUntil: 0,
        mainBaseCannonBonus: 0,
      });
    }
    this.woodLeft = new Float32Array(map.width * map.height);
    this.occupancy = new Int32Array(map.width * map.height);
    for (let i = 0; i < map.terrain.length; i++) if (this.map.terrain[i] === T.forest) this.woodLeft[i] = this.rules.terrain.types.forest.woodPerTile;
    this.nav.setTide(this.tideHigh);
    if (!opts.emptyMap) for (const o of this.map.objects) this.spawnMapObject(o);
  }

  // --- tide -----------------------------------------------------------------------------------
  get tidePhaseId(): string {
    return this.rules.tide.phases[this.tidePhase].id;
  }
  get tideHigh(): boolean {
    return this.rules.tide.phases[this.tidePhase].high;
  }
  get ticksPerSecond(): number {
    return this.rules.sim.tickHz;
  }
  get day(): number {
    return Math.floor(this.tick / this.rules.sim.ticksPerDay);
  }

  // --- entities -------------------------------------------------------------------------------
  ids(): number[] {
    if (this.sortedDirty) {
      this.sorted = [...this.entities.keys()].sort((a, b) => a - b);
      this.sortedDirty = false;
    }
    return this.sorted;
  }

  /** Live entities in ascending id order. */
  *all(): Iterable<Entity> {
    for (const id of this.ids()) {
      const e = this.entities.get(id);
      if (e && !e.dead) yield e;
    }
  }

  get(id: number): Entity | undefined {
    const e = this.entities.get(id);
    return e && !e.dead ? e : undefined;
  }

  private add(e: Entity): Entity {
    this.entities.set(e.id, e);
    this.sortedDirty = true;
    if (e.kind === 'building') this.buildingCache = null;
    return e;
  }

  remove(id: number) {
    const e = this.entities.get(id);
    if (!e) return;
    e.dead = true;
    if (e.kind === 'building') {
      if (e.blocks) this.nav.setBlocked(e.tx!, e.ty!, e.w!, e.h!, false);
      if (e.type !== 'mine') this.setOccupancy(e, 0);
    }
    this.entities.delete(id);
    this.sortedDirty = true;
    if (e.kind === 'building') this.buildingCache = null;
  }

  moveClassOf(unitType: string): MoveClass {
    const def = this.data.units.get(unitType)!;
    return def.naval ? (def.smallCraft ? 'small_craft' : 'ship') : 'foot';
  }

  spawnUnit(type: string, owner: Owner, x: number, y: number, tag?: string): Entity {
    const def = this.data.units.get(type);
    if (!def) throw new Error(`unknown unit ${type}`);
    const naval = def.naval;
    return this.add({
      id: this.nextId++,
      kind: 'unit',
      type,
      owner,
      x,
      y,
      px: x,
      py: y,
      hp: def.hp,
      maxHp: def.hp,
      radius: naval ? (def.smallCraft ? 0.6 : 1.0) : 0.3,
      tag,
      moveClass: this.moveClassOf(type),
      order: { type: 'idle' },
      path: null,
      pathIdx: 0,
      morale: this.rules.morale.unitStart,
      cooldown: 0,
      deployTicks: 0,
      facing: 0,
    });
  }

  /** Places a building by its top-left tile. `built` 1 = complete. */
  spawnBuilding(type: string, owner: Owner, tx: number, ty: number, built = 1, tag?: string, sizeOverride?: number): Entity {
    const def = this.data.buildings.get(type);
    if (!def) throw new Error(`unknown building ${type}`);
    const size = sizeOverride ?? def.size;
    const terrain = this.map.terrain[ty * this.map.width + tx];
    const hpMul = terrain === T.sand ? this.rules.siege.sandBuildingHpMul : 1;
    const maxHp = Math.round(def.hp * hpMul);
    const e = this.add({
      id: this.nextId++,
      kind: 'building',
      type,
      owner,
      x: tx + size / 2,
      y: ty + size / 2,
      px: tx + size / 2,
      py: ty + size / 2,
      hp: built >= 1 ? maxHp : Math.max(1, Math.round(maxHp * 0.1)),
      maxHp,
      radius: size / 2,
      tag,
      tx,
      ty,
      w: size,
      h: size,
      built,
      queue: [],
      rally: null,
      garrisoned: [],
      cooldown: 0,
    });
    // Farms are walkable gather points; everything else blocks movement.
    e.blocks = !('gatherPoint' in def) && !('walkable' in def);
    if (e.blocks) this.nav.setBlocked(tx, ty, size, size, true);
    // Mines run underground and must not displace the trench they start from.
    if (type !== 'mine') this.setOccupancy(e, e.id);
    return e;
  }

  private setOccupancy(e: Entity, value: number) {
    for (let y = e.ty!; y < e.ty! + e.h!; y++)
      for (let x = e.tx!; x < e.tx! + e.w!; x++)
        if (x >= 0 && y >= 0 && x < this.map.width && y < this.map.height) this.occupancy[y * this.map.width + x] = value;
  }

  /** Replaces all entities (save restore): re-derives blocking footprints and occupancy. */
  restoreEntities(list: Entity[]) {
    this.entities.clear();
    this.occupancy.fill(0);
    this.nav.blocked.fill(0);
    for (const e of list) {
      this.entities.set(e.id, e);
      if (e.kind !== 'building') continue;
      if (e.blocks) this.nav.setBlocked(e.tx!, e.ty!, e.w!, e.h!, true);
      if (e.type !== 'mine') this.setOccupancy(e, e.id);
    }
    this.sortedDirty = true;
    this.buildingCache = null;
    this.heroCache = { tick: -1, list: [] };
  }

  /** Building occupying a tile, if any. */
  buildingAt(x: number, y: number): Entity | undefined {
    if (x < 0 || y < 0 || x >= this.map.width || y >= this.map.height) return undefined;
    const id = this.occupancy[y * this.map.width + x];
    return id ? this.get(id) : undefined;
  }

  spawnResource(type: 'deer_herd', x: number, y: number, amount: number, village?: string): Entity {
    return this.add({
      id: this.nextId++,
      kind: 'resource',
      type,
      owner: 'faction_neutral',
      x: x + 0.5,
      y: y + 0.5,
      px: x + 0.5,
      py: y + 0.5,
      hp: 1,
      maxHp: 1,
      radius: 0.5,
      amount,
      maxAmount: amount,
      village,
    });
  }

  private spawnMapObject(o: MapObject) {
    if (o.type === 'deer_herd') {
      this.spawnResource('deer_herd', o.x, o.y, this.rules.gather.deerHerd.amount, o.props.village as string | undefined);
      return;
    }
    if (!this.data.buildings.has(o.type)) return;
    const owner =
      o.type === 'village_center' ? `village_${o.props.village}` : ((o.props.owner as string | undefined) ?? 'faction_neutral');
    const e = this.spawnBuilding(o.type, owner, o.x, o.y, 1, o.name || undefined, o.w);
    if (o.type === 'village_center') e.village = String(o.props.village);
  }

  /** Changes a tile's terrain (e.g. depleted forest → plain) and updates navigation. */
  setTerrain(i: number, terrain: number) {
    this.map.terrain[i] = terrain;
    this.nav.updateTile(i, this.rules.terrain);
    this.emit({ type: 'terrain', tile: i });
  }

  /** Living hero units (cached per tick). */
  heroes(): Entity[] {
    if (this.heroCache.tick !== this.tick) {
      this.heroCache = {
        tick: this.tick,
        list: [...this.all()].filter((e) => e.kind === 'unit' && !e.insideOf && this.data.units.get(e.type)!.traits.includes('hero')),
      };
    }
    return this.heroCache.list.filter((e) => !e.dead);
  }

  /** All live buildings in ascending id (cached until a building is added or removed). */
  buildings(): Entity[] {
    if (!this.buildingCache) this.buildingCache = [...this.all()].filter((e) => e.kind === 'building');
    return this.buildingCache;
  }

  buildingsOf(owner: Owner): Entity[] {
    return this.buildings().filter((e) => e.owner === owner);
  }

  /** Buildings whose footprint is within r of (x, y), ascending id. */
  buildingsNear(x: number, y: number, r: number): Entity[] {
    const out: Entity[] = [];
    for (const e of this.buildings()) {
      const dx = Math.max(e.tx! - x, 0, x - (e.tx! + e.w!));
      const dy = Math.max(e.ty! - y, 0, y - (e.ty! + e.h!));
      if (dx * dx + dy * dy <= r * r) out.push(e);
    }
    return out;
  }

  // --- factions -------------------------------------------------------------------------------
  faction(owner: Owner): FactionState | undefined {
    return this.factions.get(owner);
  }

  isPlayable(owner: Owner) {
    return PLAYABLE.includes(owner);
  }

  // --- spatial hash -------------------------------------------------------------------------
  private cellKey(cx: number, cy: number) {
    return cy * 1024 + cx;
  }

  rebuildSpatial() {
    this.grid.clear();
    for (const e of this.all()) {
      if (e.kind !== 'unit' || e.insideOf) continue;
      const k = this.cellKey(Math.floor(e.x / World.CELL), Math.floor(e.y / World.CELL));
      const list = this.grid.get(k);
      if (list) list.push(e.id);
      else this.grid.set(k, [e.id]);
    }
  }

  /** Units within `r` tiles of (x, y), ascending id. Uses the hash from the last rebuild. */
  unitsNear(x: number, y: number, r: number): Entity[] {
    const out: Entity[] = [];
    const c0x = Math.floor((x - r) / World.CELL);
    const c1x = Math.floor((x + r) / World.CELL);
    const c0y = Math.floor((y - r) / World.CELL);
    const c1y = Math.floor((y + r) / World.CELL);
    for (let cy = c0y; cy <= c1y; cy++)
      for (let cx = c0x; cx <= c1x; cx++) {
        const list = this.grid.get(this.cellKey(cx, cy));
        if (!list) continue;
        for (const id of list) {
          const e = this.entities.get(id);
          if (e && !e.dead && (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r) out.push(e);
        }
      }
    return out.sort((a, b) => a.id - b.id);
  }

  emit(ev: SimEvent) {
    this.events.push(ev);
  }

  enqueue(cmd: Command) {
    this.pending.push(cmd);
  }
}
