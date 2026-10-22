import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const sc = scenarioById('ch4');
const w = new World(loadGameData(), loadMap(), { seed: Number(process.argv[2] ?? 7) });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const fort = w.buildings().find((b) => b.type === 'utrecht_redoubt')!;
const shots = new Map<string, number>();
for (let t = 0; t < 20 * Number(process.argv[3] ?? 220); t++) {
  step(w);
  for (const e of w.events) if (e.type === 'shot' && e.hit) {
    const src = w.entities.get(e.from as number);
    const dst = w.entities.get(e.to as number);
    if (src && dst && dst.owner === 'faction_zheng') shots.set(src.type, (shots.get(src.type) ?? 0) + 1);
  }
}
console.log('fort', fort.owner, fort.hp.toFixed(0), '/', fort.maxHp, 'garrison', fort.garrisoned?.length, 'capture', fort.captureTicks, 'powder voc', w.faction('faction_voc')!.resources.powder.toFixed(0));
console.log('hits on zheng by type', Object.fromEntries(shots));
const orders = new Map<string, number>();
for (const e of w.all()) if (e.owner === 'faction_zheng' && e.kind === 'unit') { const k = e.type + ':' + e.order?.type + (e.attackTarget ? '+t' : ''); orders.set(k, (orders.get(k) ?? 0) + 1); }
console.log('zheng orders', Object.fromEntries(orders));
for (const e of w.all()) if (e.owner === 'faction_voc' && e.kind === 'unit' && e.x > 46 && e.y > 60) console.log('voc', e.type, e.x.toFixed(1), e.y.toFixed(1), e.order?.type, e.insideOf ?? '');
for (const e of [...w.all()].filter((e) => e.owner === 'faction_zheng' && e.kind === 'unit' && e.type !== 'laborer').slice(0, 14)) {
  const t = e.attackTarget !== undefined ? w.get(e.attackTarget) : undefined;
  console.log(e.type.padEnd(16), `(${e.x.toFixed(1)},${e.y.toFixed(1)})`, 'order', JSON.stringify(e.order), 'tgt', t ? `${t.type}(${t.x.toFixed(1)},${t.y.toFixed(1)}) d=${Math.hypot(t.x - e.x, t.y - e.y).toFixed(1)}` : '-', 'goal', e.goalX?.toFixed(1), e.goalY?.toFixed(1), 'chasing', e.chasing, 'pend', e.pathPending, 'stuck', e.stuck, 'morale', e.morale?.toFixed(0));
}
