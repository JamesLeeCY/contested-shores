// Who kills whom in the first N seconds of a chapter (dev tool).  tsx scripts/dev/killers.ts 4 140
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';
const [ch, secs] = [Number(process.argv[2] ?? 4), Number(process.argv[3] ?? 140)];
const sc = scenarioById(`ch${ch}`);
const w = new World(loadGameData(), loadMap(), { seed: 101 });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const dmg = new Map<string, number>();
const where = new Map<string, number>();
for (let t = 0; t < secs * 20; t++) {
  const hp = new Map([...w.all()].filter((e) => e.owner === 'faction_zheng' && e.kind === 'unit').map((e) => [e.id, e.hp]));
  step(w);
  for (const ev of w.events) {
    if (ev.type === 'shot' && ev.hit) {
      const tgt = w.entities.get(ev.to as number);
      const src = w.entities.get(ev.from as number);
      if (tgt?.owner === 'faction_zheng' && src) dmg.set(src.type, (dmg.get(src.type) ?? 0) + (hp.get(tgt.id)! - tgt.hp));
    }
    if (ev.type === 'death' && ev.owner === 'faction_zheng' && ev.kind === 'unit') {
      const k = `${Math.round((ev.x as number) / 4) * 4},${Math.round((ev.y as number) / 4) * 4}`;
      where.set(k, (where.get(k) ?? 0) + 1);
    }
  }
}
console.log('damage to zheng by source', Object.fromEntries([...dmg].map(([k, v]) => [k, Math.round(v)])));
console.log('zheng deaths by area', Object.fromEntries([...where].sort((a, b) => b[1] - a[1])));
