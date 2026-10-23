// Breaks down a faction's population loss by cause (dev tool).  tsx scripts/dev/deaths.ts 4 300
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { armyPop } from '../../src/sim/ai/common';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const [ch, secs] = [Number(process.argv[2] ?? 4), Number(process.argv[3] ?? 300)];
const data = loadGameData();
const sc = scenarioById(`ch${ch}`);
const w = new World(data, loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const causes = new Map<string, number>();
const start = armyPop(w, 'faction_zheng');
let illness: Set<number>;
for (let t = 0; t < secs * 20; t++) {
  step(w);
  illness = new Set(w.events.filter((e) => e.type === 'illness').map((e) => e.id as number));
  for (const e of w.events) {
    if (e.type !== 'death' || e.owner !== 'faction_zheng' || e.kind !== 'unit') continue;
    const pop = data.units.get(e.unitType as string)!.pop;
    const k = illness.has(e.id as number) ? 'disease' : e.killer ? `killed by ${e.killer}` : 'other (no killer)';
    causes.set(`${k} ${e.unitType}`, (causes.get(`${k} ${e.unitType}`) ?? 0) + pop);
  }
}
console.log('zheng army pop', start, '->', armyPop(w, 'faction_zheng'));
console.log(Object.fromEntries([...causes].sort((a, b) => b[1] - a[1])));
