// Logs each death of a faction's units: time, place, order, killer (dev tool).
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch4');
const w = new World(loadGameData(), loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const lastHitBy = new Map<number, string>();
const snapshot = new Map<number, string>();
for (let t = 0; t < Number(process.argv[2] ?? 200) * 20; t++) {
  for (const e of w.all()) if (e.owner === 'faction_zheng' && e.kind === 'unit') snapshot.set(e.id, `${e.type} (${e.x.toFixed(0)},${e.y.toFixed(0)}) ${e.order?.type}${e.attackTarget ? '+t' : ''} m${Math.round(e.morale ?? 0)}`);
  step(w);
  for (const ev of w.events) {
    if (ev.type === 'shot' && ev.hit) {
      const src = w.entities.get(ev.from as number);
      if (src) lastHitBy.set(ev.to as number, `${src.type}@(${src.x.toFixed(0)},${src.y.toFixed(0)})`);
    }
    if (ev.type === 'ai_step' || ev.type === 'ai_state') console.log((w.tick / 20).toFixed(0), JSON.stringify(ev));
    if (ev.type === 'death' && ev.owner === 'faction_zheng' && ev.kind === 'unit')
      console.log((w.tick / 20).toFixed(0), 'DIED', snapshot.get(ev.id as number), '<-', lastHitBy.get(ev.id as number) ?? '?');
  }
}
