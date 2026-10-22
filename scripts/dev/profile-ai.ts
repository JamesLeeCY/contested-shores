// Finds slow AI decisions: wraps plan step handlers and strategic/tactical layers with timers.
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { STEP_HANDLERS } from '../../src/sim/ai/plans';
import * as strat from '../../src/sim/ai/strategic';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const ch = Number(process.argv[2] ?? 2);
const secs = Number(process.argv[3] ?? 300);
const worst = new Map<string, number>();
for (const k of Object.keys(STEP_HANDLERS)) {
  const f = STEP_HANDLERS[k];
  STEP_HANDLERS[k] = (ctx, arg) => {
    const t = performance.now();
    const r = f(ctx, arg);
    const d = performance.now() - t;
    worst.set('step:' + k, Math.max(worst.get('step:' + k) ?? 0, d));
    return r;
  };
}
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed: 1 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
let worstStrat = 0;
for (let t = 0; t < secs * 20; t++) {
  const due = Object.values(w.ext.ai).some((ai) => w.tick - ai.lastStrategic >= w.rules.difficulty[ai.difficulty].strategicSeconds * 20);
  const a = performance.now();
  step(w);
  if (due) worstStrat = Math.max(worstStrat, performance.now() - a);
}
void strat;
console.log('worst full tick containing a strategic decision:', worstStrat.toFixed(2), 'ms');
console.log([...worst].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}ms`).join('\n'));
