// Prints AI steps/states and army sizes over a chapter run (dev tool).  tsx scripts/dev/trace-chapter.ts 2 2 600
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { army, armyPop, centroid } from '../../src/sim/ai/common';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const [ch, seed, secs] = [Number(process.argv[2] ?? 2), Number(process.argv[3] ?? 1), Number(process.argv[4] ?? 600)];
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const deaths: Record<string, number> = {};
for (let t = 0; t < secs * 20; t++) {
  step(w);
  for (const e of w.events) {
    if (e.type === 'ai_step' || e.type === 'ai_state' || e.type === 'captured' || e.type === 'garrison_ejected' || e.type === 'disease') console.log(`${(w.tick / 20).toFixed(0)}s`, JSON.stringify(e));
    if (e.type === 'death' && e.kind === 'unit') deaths[`${e.owner}:${e.unitType}`] = (deaths[`${e.owner}:${e.unitType}`] ?? 0) + 1;
  }
  if (t % 600 === 0) {
    const z = army(w, 'faction_zheng'), v = army(w, 'faction_voc');
    console.log(`${(w.tick / 20).toFixed(0)}s zheng pop ${armyPop(w, 'faction_zheng')} at ${centroid(z).map((n) => n.toFixed(0))} voc pop ${armyPop(w, 'faction_voc')} at ${centroid(v).map((n) => n.toFixed(0))} tide ${w.tidePhaseId}`);
  }
}
console.log(deaths);
