// Prints a scenario's AI-vs-AI course every N seconds: army sizes per region, deaths, outcome.
//   tsx scripts/dev/trace-scenario.ts mudan1 [seed] [everySeconds]
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { army } from '../../src/sim/ai/common';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const [id = 'mudan1', seedArg = '101', everyArg = '10'] = process.argv.slice(2);
const sc = scenarioById(id);
const w = new World(loadGameData(), loadMap(sc.map ?? 'taijiang'), { seed: Number(seedArg), factions: sc.factions });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const every = Number(everyArg) * 20;
const where = (x: number, y: number) => w.map.regions.find((r) => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h)?.id ?? '-';
const deaths: Record<string, number> = {};
while (!w.ext.flags.missionOver && w.tick < sc.timerMinutes * 60 * 20 + 40) {
  step(w);
  for (const ev of w.events) if (ev.type === 'death' || ev.type === 'unit_died') deaths[String(ev.owner)] = (deaths[String(ev.owner)] ?? 0) + 1;
  if (w.tick % every === 0) {
    const parts = (sc.factions ?? []).map((f) => {
      const by: Record<string, number> = {};
      // Land armies, or the fleet on the sea maps.
      const force = army(w, f).length ? army(w, f) : [...w.all()].filter((e) => e.kind === 'unit' && e.owner === f && e.moveClass !== 'foot');
      for (const u of force) by[where(u.x, u.y)] = (by[where(u.x, u.y)] ?? 0) + 1;
      const ai = w.ext.ai[f];
      return `${f.replace('faction_', '')}=${Object.values(by).reduce((a, b) => a + b, 0)} ${JSON.stringify(by)} step=${ai?.plans[ai.planIdx] ?? ''}#${ai?.stepIdx}`;
    });
    console.log(`${w.tick / 20}s ${parts.join(' | ')}`);
  }
}
console.log('outcome', JSON.stringify(Object.fromEntries(Object.entries(w.ext.flags).filter(([k]) => k.startsWith('outcome')))));
