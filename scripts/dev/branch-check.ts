// Plays a scenario with a scripted choice taken early (both sides on AI) and prints the outcome per
// seed — for decision scenarios such as the 東寧 epilogue.
//   tsx scripts/dev/branch-check.ts penghu3 faction_tungning luzon [seeds]
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const [id = 'penghu3', owner = 'faction_tungning', choice = '', nArg = '4'] = process.argv.slice(2);
const sc = scenarioById(id);
const data = loadGameData();
const lines: string[] = [];
for (let seed = 101; seed < 101 + Number(nArg); seed++) {
  const w = new World(data, loadMap(sc.map ?? 'taijiang'), { seed, factions: sc.factions });
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
  while (!w.ext.flags.missionOver && w.tick < sc.timerMinutes * 60 * 20 + 20) {
    if (choice && w.tick === 20) w.enqueue({ type: 'choice', owner, id: choice });
    step(w);
    // TRACE=1: every 30 s, each side's units by region and the forts' health.
    if (process.env.TRACE && seed === 101 && w.tick % 600 === 0) {
      const where = (x: number, y: number) => w.map.regions.find((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)?.id ?? '-';
      const by = (o: string) => {
        const m: Record<string, number> = {};
        for (const e of w.all()) if (e.kind === 'unit' && e.owner === o) m[where(e.x, e.y)] = (m[where(e.x, e.y)] ?? 0) + 1;
        return JSON.stringify(m);
      };
      const forts = w.buildings().filter((b) => w.data.buildings.get(b.type)!.attack && w.isPlayable(b.owner)).map((b) => `${b.type}:${Math.round((100 * b.hp) / b.maxHp)}%`);
      console.log(w.tick / 20, sc.factions!.map(by).join(' | '), forts.join(' '));
    }
  }
  const afloat = [...w.all()].filter((e) => e.kind === 'unit' && e.owner === owner && e.moveClass !== 'foot').length;
  lines.push(`${afloat} ships ${Math.round(w.tick / 20)}s ${w.ext.flags[`outcome:${owner}`]} [${w.ext.flags[`outcomeReason:${owner}`]}]`);
}
console.log(`${id} ${choice || '(no choice)'}:`, lines.join(' | '));
