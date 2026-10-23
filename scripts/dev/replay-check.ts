// Save/replay check: runs mudan1 with a player command and the AI, then restores the initial
// snapshot and replays only player commands; prints the first diverging tick (or 'identical').
//   tsx scripts/dev/replay-check.ts [ticks]
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { hashWorld } from '../../src/sim/hash';
import { applyScenario } from '../../src/sim/scenario/setup';
import { restoreWorld, snapshotWorld } from '../../src/sim/snapshot';
import { World } from '../../src/sim/world';
const data = loadGameData();
const sc = scenarioById('mudan1');
const w = new World(data, loadMap('hengchun'), { seed: 7, factions: sc.factions, player: 'faction_paiwan' });
applyScenario(w, sc);
enableAi(w, 'faction_japan', sc.ai!.faction_japan);
const snap = snapshotWorld(w);
const N = Number(process.argv[2] ?? 1300);
const hashes: string[] = [];
const ids = [...w.all()].filter((e) => e.type === 'paiwan_hunter').map((e) => e.id);
w.enqueue({ type: 'stance', owner: 'faction_paiwan', ids, hold: true });
const snaps: Record<number, string> = {};
for (let i = 0; i < N; i++) { step(w); hashes.push(hashWorld(w)); if (i >= 95 && i <= 105) snaps[i] = JSON.stringify(snapshotWorld(w).entities); }
const log = [...w.commandLog];
const r = restoreWorld(data, loadMap, snap, scenarioById);
for (let i = 0; i < N; i++) { for (const c of log) if (c.tick === r.tick && !c.cmd.ai) r.enqueue(c.cmd); step(r); const h = hashWorld(r); if (h !== hashes[i]) {
    console.log('diverged at step', i, 'tick', r.tick);
    const a = JSON.parse(snaps[i]); const b = snapshotWorld(r).entities as unknown[];
    for (let k = 0; k < Math.max(a.length, b.length); k++) { const x = JSON.stringify(a[k]); const y = JSON.stringify(b[k]); if (x !== y) { console.log('A', x?.slice(0, 600)); console.log('B', y?.slice(0, 600)); break; } }
    process.exit(0); } }
console.log('identical');
