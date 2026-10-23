// Balance sweep: applies JSON-path overrides to the data, plays a chapter AI vs AI for N seeds,
// and prints the Zheng success rate (same metric as headless-battle).
//   tsx scripts/dev/sweep.ts 2 8 'buildings.provintia_fort.hp=4000' 'units.light_cannon.range=7'
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { armyPop } from '../../src/sim/ai/common';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const [chArg, nArg, ...overrides] = process.argv.slice(2);
const chapter = Number(chArg);
const N = Number(nArg ?? 8);
const data = loadGameData();
const map = loadMap();
const sc = JSON.parse(JSON.stringify(scenarioById(`ch${chapter}`)));

function set(path: string, value: unknown) {
  const [root, id, ...rest] = path.split('.');
  let obj: Record<string, unknown>;
  if (root === 'rules') {
    obj = data.rules as unknown as Record<string, unknown>;
    rest.unshift(id);
  } else if (root === 'scenario') {
    obj = sc;
    rest.unshift(id);
  } else obj = (data as unknown as Record<string, Map<string, Record<string, unknown>>>)[root].get(id)!;
  for (const k of rest.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
  obj[rest[rest.length - 1]] = value;
}
for (const o of overrides) {
  const [p, v] = o.split('=');
  set(p, JSON.parse(v));
}

let wins = 0;
const lines: string[] = [];
for (let seed = 101; seed < 101 + N; seed++) {
  const w = new World(data, map, { seed });
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s as never);
  const limit = sc.timerMinutes * 60 * 20 + 10;
  let won = false;
  let t = 0;
  for (; t < limit; t++) {
    step(w);
    if (chapter === 2) {
      const fort = w.buildings().find((b) => b.type === 'provintia_fort');
      if (fort?.owner === 'faction_zheng') {
        won = w.tick <= 600 * 20;
        break;
      }
      if (w.tick > 600 * 20) break;
    }
    if (w.ext.flags.missionOver) {
      const z = String(w.ext.flags['outcome:faction_zheng']);
      const v = String(w.ext.flags['outcome:faction_voc']);
      won = z !== 'defeat' && v !== 'victory';
      break;
    }
  }
  if (won) wins++;
  lines.push(`${won ? 'Z' : 'V'}@${Math.round(w.tick / 20)}s(z${armyPop(w, 'faction_zheng')},v${armyPop(w, 'faction_voc')})`);
}
console.log(`ch${chapter} ${overrides.join(' ') || '(baseline)'}: Zheng ${wins}/${N}  ${lines.join(' ')}`);
