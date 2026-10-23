// Save files (spec §10.5): seed + map + chapter + full command log + periodic snapshots. Loading
// restores the latest snapshot at or before the save point and replays the commands after it.
import type { Command } from '../sim/commands';
import { step } from '../sim/loop';
import type { GameMap } from '../sim/map';
import { restoreWorld, snapshotWorld, type Snapshot } from '../sim/snapshot';
import type { Scenario } from '../sim/scenario/types';
import type { SimData } from '../sim/types';
import type { World } from '../sim/world';

export const SAVE_KEY = 'tayouan1661.save';
export const SNAPSHOT_EVERY = 1200;

export interface SaveMeta {
  kind: 'chapter' | 'sandbox';
  /** Scenario id (saves before 1874 have only `chapter`). */
  scenario?: string;
  chapter?: number;
  sandboxMode?: string;
  player: string;
  difficulty: string;
  savedAt: string;
}

export interface SaveFile {
  format: 'tayouan1661-save';
  version: 1;
  meta: SaveMeta;
  seed: number;
  map: string;
  tick: number;
  commandLog: { tick: number; cmd: Command }[];
  /** Commands issued after the last executed tick (not yet in the log). */
  pending: Command[];
  snapshot: Snapshot;
}

/** Keeps the latest periodic snapshots of a running world. */
export class SnapshotKeeper {
  private snaps: Snapshot[] = [];
  constructor(world: World) {
    this.snaps.push(snapshotWorld(world));
  }
  tick(world: World) {
    if (world.tick % SNAPSHOT_EVERY !== 0 || this.snaps.some((s) => s.tick === world.tick)) return;
    this.snaps.push(snapshotWorld(world));
    if (this.snaps.length > 2) this.snaps.shift();
  }
  latest(atOrBefore: number): Snapshot {
    return [...this.snaps].reverse().find((s) => s.tick <= atOrBefore) ?? this.snaps[0];
  }
}

export function buildSave(world: World, keeper: SnapshotKeeper, meta: Omit<SaveMeta, 'savedAt'>): SaveFile {
  return {
    format: 'tayouan1661-save',
    version: 1,
    meta: { ...meta, savedAt: new Date().toISOString() },
    seed: world.opts.seed,
    map: world.map.id,
    tick: world.tick,
    commandLog: world.commandLog.map((c) => ({ tick: c.tick, cmd: c.cmd })),
    pending: [...world.pending],
    snapshot: keeper.latest(world.tick),
  };
}

/** Rebuilds the world exactly as it was when saved. */
export function loadSave(save: SaveFile, data: SimData, maps: GameMap | ((id: string) => GameMap), scenarios: (id: string) => Scenario): World {
  if (save.format !== 'tayouan1661-save') throw new Error('not a save file');
  const map = typeof maps === 'function' ? maps(save.map ?? 'taijiang') : maps;
  const w = restoreWorld(data, map, save.snapshot, scenarios);
  // Replay everything after the snapshot from the command log (pending at snapshot time are in it).
  w.pending = [];
  const byTick = new Map<number, Command[]>();
  for (const { tick, cmd } of save.commandLog) {
    // AI commands are not replayed: the deterministic AI issues them again itself.
    if (tick < w.tick || cmd.ai) continue;
    const list = byTick.get(tick) ?? [];
    list.push(cmd);
    byTick.set(tick, list);
  }
  for (const { tick, cmd } of save.commandLog) if (tick < w.tick) w.commandLog.push({ tick, cmd });
  while (w.tick < save.tick) {
    for (const c of byTick.get(w.tick) ?? []) w.enqueue(c);
    step(w);
  }
  w.pending = [...save.pending];
  return w;
}

export function storeSave(save: SaveFile): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readStoredSave(): SaveFile | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveFile) : null;
  } catch {
    return null;
  }
}

export function downloadSave(save: SaveFile) {
  const blob = new Blob([JSON.stringify(save)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tayouan1661-${save.meta.kind}${save.meta.chapter ?? ''}-${save.tick}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function pickSaveFile(): Promise<SaveFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      try {
        resolve(JSON.parse(await f.text()) as SaveFile);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
