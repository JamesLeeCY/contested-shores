// Times the AI system per call, with a breakdown via a patched strategic module.
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { aiSystem, enableAi } from '../../src/sim/ai';
import { SYSTEMS } from '../../src/sim/systems';
import { executeCommand } from '../../src/sim/commands';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const ch = Number(process.argv[2] ?? 2);
const secs = Number(process.argv[3] ?? 300);
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const samples: { ms: number; tick: number }[] = [];
for (let t = 0; t < secs * 20; t++) {
  w.events = [];
  const c = w.pending;
  w.pending = [];
  for (const x of c) executeCommand(w, x);
  for (const s of SYSTEMS) {
    if (s.fn === aiSystem) {
      const a = performance.now();
      s.fn(w);
      samples.push({ ms: performance.now() - a, tick: w.tick });
    } else s.fn(w);
  }
  w.tick++;
}
samples.sort((a, b) => b.ms - a.ms);
console.log('top AI calls:', samples.slice(0, 8).map((s) => `${s.ms.toFixed(2)}ms@${s.tick}`).join(' '));
console.log('p99', samples[Math.floor(samples.length * 0.01)].ms.toFixed(3));
