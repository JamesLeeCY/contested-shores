// AI decision cost per scenario: plays each one AI vs AI and prints the slowest decisions.
//   tsx scripts/dev/ai-timing.ts [劇本…] [--seeds 2]   (no scenario ids = all of them)
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { SCENARIOS, scenarioById } from '../../src/data/scenarios';
import { aiTiming, enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const args = process.argv.slice(2);
const si = args.indexOf('--seeds');
const seeds = si >= 0 ? Number(args.splice(si, 2)[1]) : 1;
const ids = args.length ? args : SCENARIOS.map((s) => s.id);
const data = loadGameData();
aiTiming.enabled = true;
aiTiming.now = () => performance.now();

function play(id: string, seed: number) {
  const sc = scenarioById(id)!;
  const w = new World(data, loadMap(sc.map ?? 'taijiang'), { seed, factions: sc.factions });
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
  const limit = sc.timerMinutes * 60 * w.ticksPerSecond + 10;
  for (let t = 0; t < limit && !w.ext.flags.missionOver; t++) step(w);
  return w.tick;
}

// Warm V8 up so the first scenario's numbers are not compile time.
play(ids[0], 1);
for (const id of ids) {
  aiTiming.samples = [];
  aiTiming.worst = { ms: 0, layer: '', owner: '', tick: 0 };
  let ticks = 0;
  for (let s = 0; s < seeds; s++) ticks += play(id, 101 + s);
  const xs = [...aiTiming.samples].sort((a, b) => a - b);
  const p = (q: number) => (xs.length ? xs[Math.floor((xs.length - 1) * q)] : 0).toFixed(2);
  const wst = aiTiming.worst;
  console.log(
    `${id.padEnd(8)} decisions=${String(xs.length).padStart(5)} p50=${p(0.5)} p99=${p(0.99)} max=${p(1)} ms  over2ms=${xs.filter((x) => x > 2).length}  worst=${wst.layer}/${wst.owner}@${Math.round(wst.tick / 20)}s  (${Math.round(ticks / 20)}s played)`,
  );
}
