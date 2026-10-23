// World snapshots for save/load (spec §10.5). A snapshot holds everything that influences later
// ticks; caches (spatial hash, flow fields, components, hero/building lists) are rebuilt.
import type { GameMap } from './map';
import type { Scenario } from './scenario/types';
import { detectedMines, fogOf } from './systems/fog';
import type { Entity, FactionState, Owner, SimData } from './types';
import { World, type WorldOptions } from './world';

export const SNAPSHOT_VERSION = 1;

export interface Snapshot {
  version: number;
  opts: WorldOptions;
  scenarioId: string | null;
  mapId?: string;
  tick: number;
  rng: number;
  nextId: number;
  tidePhase: number;
  tideTick: number;
  chapter: number;
  rules: unknown;
  entities: Entity[];
  factions: FactionState[];
  terrain: string;
  woodLeft: string;
  ext: unknown;
  weather: World['weather'];
  pending: unknown[];
  paths: unknown[];
  fog: Record<Owner, { visible: string; explored: string }>;
  mines: Record<Owner, number[]>;
}

// --- base64 for typed arrays (works the same in the browser and Node) --------------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToB64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}

export function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) | ((B64.indexOf(clean[i + 2] ?? 'A') & 63) << 6) | (B64.indexOf(clean[i + 3] ?? 'A') & 63);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const enc = (a: Uint8Array | Float32Array) => bytesToB64(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export function snapshotWorld(world: World): Snapshot {
  const fog: Snapshot['fog'] = {};
  const mines: Snapshot['mines'] = {};
  for (const owner of world.factions.keys()) {
    const f = fogOf(world, owner);
    if (f) fog[owner] = { visible: enc(f.visible), explored: enc(f.explored) };
    const m = detectedMines.get(world)?.get(owner);
    if (m) mines[owner] = [...m].sort((a, b) => a - b);
  }
  return {
    version: SNAPSHOT_VERSION,
    opts: clone(world.opts),
    scenarioId: world.scenario?.id ?? null,
    mapId: world.map.id,
    tick: world.tick,
    rng: world.rng.state,
    nextId: world.nextId,
    tidePhase: world.tidePhase,
    tideTick: world.tideTick,
    chapter: world.chapter,
    rules: clone(world.rules),
    entities: clone([...world.ids()].map((id) => world.entities.get(id)!)),
    factions: clone([...world.factions.values()]),
    terrain: enc(world.map.terrain),
    woodLeft: enc(world.woodLeft),
    ext: clone(world.ext),
    weather: { ...world.weather },
    pending: clone(world.pending),
    paths: clone(world.paths.pending),
    fog,
    mines,
  };
}

export function restoreWorld(data: SimData, mapOrResolver: GameMap | ((id: string) => GameMap), snap: Snapshot, scenarios: (id: string) => Scenario): World {
  const map = typeof mapOrResolver === 'function' ? mapOrResolver(snap.mapId ?? 'taijiang') : mapOrResolver;
  if (snap.version !== SNAPSHOT_VERSION) throw new Error(`unsupported save version ${snap.version}`);
  const terrain = b64ToBytes(snap.terrain).slice(0, map.width * map.height);
  const w = new World(data, { ...map, terrain }, { ...snap.opts, emptyMap: true });
  w.tick = snap.tick;
  w.rng.state = snap.rng;
  w.nextId = snap.nextId;
  w.tidePhase = snap.tidePhase;
  w.tideTick = snap.tideTick;
  w.chapter = snap.chapter;
  Object.assign(w.rules, clone(snap.rules));
  w.scenario = snap.scenarioId ? scenarios(snap.scenarioId) : null;
  const wood = new Float32Array(b64ToBytes(snap.woodLeft).slice().buffer);
  w.woodLeft.set(wood.subarray(0, w.woodLeft.length));
  w.factions.clear();
  for (const f of clone(snap.factions)) w.factions.set(f.id, f);
  w.ext = clone(snap.ext) as World['ext'];
  w.weather = { ...snap.weather };
  w.pending = clone(snap.pending) as World['pending'];
  w.paths.pending = clone(snap.paths) as typeof w.paths.pending;
  w.restoreEntities(clone(snap.entities));
  w.nav.setTide(w.tideHigh);
  for (const [owner, f] of Object.entries(snap.fog)) {
    const fog = fogOf(w, owner);
    if (!fog) continue;
    fog.visible.set(b64ToBytes(f.visible).subarray(0, fog.visible.length));
    fog.explored.set(b64ToBytes(f.explored).subarray(0, fog.explored.length));
  }
  const m = new Map<Owner, Set<number>>();
  for (const [owner, ids] of Object.entries(snap.mines)) m.set(owner, new Set(ids));
  if (m.size) detectedMines.set(w, m);
  w.rebuildSpatial();
  return w;
}
