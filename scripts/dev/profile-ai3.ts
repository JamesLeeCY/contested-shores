// Logs strategic-section timings for slow AI decisions.
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { aiSystem, enableAi } from '../../src/sim/ai';
import { sectionTiming } from '../../src/sim/ai/strategic';
import { SYSTEMS } from '../../src/sim/systems';
import { executeCommand } from '../../src/sim/commands';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
sectionTiming.now = () => performance.now();
const ch = Number(process.argv[2] ?? 4);
const sc = scenarioById(`ch${ch}`);
// Warm-up: play other seeds first so V8 has compiled the hot paths.
for (const seed of [7, 8]) {
  const ww = new World(loadGameData(), loadMap(), { seed });
  applyScenario(ww, sc);
  for (const [o, s2] of Object.entries(sc.ai ?? {})) enableAi(ww, o, s2);
  for (let t = 0; t < 20 * 400; t++) {
    ww.events = [];
    const c = ww.pending;
    ww.pending = [];
    for (const x of c) executeCommand(ww, x);
    for (const s3 of SYSTEMS) s3.fn(ww);
    ww.tick++;
  }
}
const w = new World(loadGameData(), loadMap(), { seed: Number(process.argv[4] ?? 1) });
applyScenario(w, sc);
if (process.argv[5] === '300') {
  // Pad to ~300 units for the spec §8.5 timing check.
  for (let i = 0; i < 60; i++) w.spawnUnit(i % 2 ? 'archer_zheng' : 'shield_soldier', 'faction_zheng', 66 + (i % 8) * 0.8, 61 + Math.floor(i / 8) * 0.8);
  for (let i = 0; i < 50; i++) w.spawnUnit(i % 3 ? 'musketeer_voc' : 'pikeman', 'faction_voc', 36 + (i % 8) * 0.8, 62 + Math.floor(i / 8) * 0.8);
}
console.log('units', [...w.all()].filter((e) => e.kind === 'unit').length);
let maxMs = 0;
let calls = 0;
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
for (let t = 0; t < 20 * Number(process.argv[3] ?? 300); t++) {
  w.events = [];
  const c = w.pending;
  w.pending = [];
  for (const x of c) executeCommand(w, x);
  for (const s of SYSTEMS) {
    if (s.fn !== aiSystem) { s.fn(w); continue; }
    const a = performance.now();
    s.fn(w);
    const d = performance.now() - a;
    maxMs = Math.max(maxMs, d);
    calls++;
    if (d > 2 && w.tick > 200) console.log(w.tick, d.toFixed(2), JSON.stringify(Object.fromEntries(Object.entries(sectionTiming.log).map(([k, v]) => [k, +v.toFixed(2)]))), Object.values(w.ext.ai).map((a) => a.owner + ':' + a.stepIdx + ':' + a.state).join(' '));
  }
  w.tick++;
}
console.log('AI calls', calls, 'max ms', maxMs.toFixed(2));
