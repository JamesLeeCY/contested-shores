// Who killed whom in a scenario's AI-vs-AI run: kills by (victim type @ terrain) ← (killer type @ terrain),
// plus damage dealt by each side's unit types. For balancing.
//   tsx scripts/dev/battle-log.ts yiwei1 [seed] [seconds]
import { loadGameData } from '../../src/data/load';
import { loadMap } from '../../src/data/map';
import { scenarioById } from '../../src/data/scenarios';
import { enableAi } from '../../src/sim/ai';
import { step } from '../../src/sim/loop';
import { TERRAIN_IDS } from '../../src/sim/map';
import { applyScenario } from '../../src/sim/scenario/setup';
import { World } from '../../src/sim/world';

const [id = 'yiwei1', seedArg = '101', secArg = '300'] = process.argv.slice(2);
const sc = scenarioById(id);
const w = new World(loadGameData(), loadMap(sc.map ?? 'taijiang'), { seed: Number(seedArg), factions: sc.factions });
applyScenario(w, sc);
for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
const tile = (x: number, y: number) => TERRAIN_IDS[w.map.terrain[Math.floor(y) * w.map.width + Math.floor(x)]];
const last = new Map<number, { type: string; tile: string }>();
const kills: Record<string, number> = {};
const dmg: Record<string, number> = {};
const hp = new Map<number, number>();
while (!w.ext.flags.missionOver && w.tick < Number(secArg) * 20) {
  for (const e of w.all()) hp.set(e.id, e.hp);
  step(w);
  for (const ev of w.events as unknown as Record<string, never>[]) {
    if (ev.type === 'shot' && ev.hit) {
      const a = w.entities.get(ev.from);
      const t = w.entities.get(ev.to);
      if (a) last.set(ev.to, { type: a.type, tile: tile(a.x, a.y) });
      if (a && t) dmg[`${a.owner.slice(8)}:${a.type}`] = (dmg[`${a.owner.slice(8)}:${a.type}`] ?? 0) + Math.max(0, (hp.get(t.id) ?? t.hp) - t.hp);
    }
    if (ev.type === 'death' && ev.kind === 'unit') {
      const k = last.get(ev.id);
      const key = `${ev.unitType}@${tile(ev.x, ev.y)} <- ${k ? `${k.type}@${k.tile}` : 'melee/other'}`;
      kills[key] = (kills[key] ?? 0) + 1;
    }
  }
}
for (const [k, n] of Object.entries(kills).sort((a, b) => b[1] - a[1]).slice(0, 14)) console.log(String(n).padStart(4), k);
console.log('damage', JSON.stringify(Object.fromEntries(Object.entries(dmg).map(([k, v]) => [k, Math.round(v)]))));
console.log('end', Math.round(w.tick / 20), 's', String(w.ext.flags[`outcomeReason:${sc.factions?.[0]}`] ?? ''));
