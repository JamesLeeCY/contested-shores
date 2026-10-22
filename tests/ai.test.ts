import { describe, expect, it } from 'vitest';
import { scenarioById } from '../src/data/scenarios';
import { enableAi } from '../src/sim/ai';
import { applyScenario } from '../src/sim/scenario/setup';
import { hashWorld } from '../src/sim/hash';
import { makeWorld, run } from './helpers';

const Z = 'faction_zheng';
const V = 'faction_voc';

function chapterWorld(ch: number, seed = 1) {
  const w = makeWorld({ seed });
  const sc = scenarioById(`ch${ch}`);
  applyScenario(w, sc);
  for (const [o, s] of Object.entries(sc.ai ?? {})) enableAi(w, o, s);
  return w;
}

describe('AI (spec §8)', () => {
  it('puts idle workers to work', () => {
    const w = chapterWorld(2);
    run(w, 20 * 8);
    const labs = [...w.all()].filter((e) => e.owner === Z && e.type === 'laborer');
    expect(labs.filter((l) => l.order?.type === 'gather' || l.order?.type === 'build').length).toBeGreaterThan(labs.length / 2);
  });

  it('switches to DEFEND when enemies come near its base, and back after 15 s of calm', () => {
    const w = chapterWorld(4);
    w.ext.ai[V].plans = [];
    run(w, 20);
    w.faction(V)!.resources.powder = 0;
    const raiders = [0, 1, 2].map((i) => w.spawnUnit('iron_man', Z, 40 + i, 63));
    for (const r of raiders) r.hp = r.maxHp = 5000;
    run(w, 20 * 6);
    expect(w.ext.ai[V].state).toBe('DEFEND');
    for (const r of raiders) w.remove(r.id);
    run(w, 20 * 25);
    expect(w.ext.ai[V].state).not.toBe('DEFEND');
  });

  it('persistent plan steps keep running in the background (hold_utrecht)', () => {
    const w = chapterWorld(4);
    run(w, 20 * 6);
    expect(w.ext.ai[V].background).toEqual(['hold:utrecht_redoubt', 'sortie:battery', 'counter_mine']);
  });

  it('take_provintia builds batteries that outrange the fort and bombards it', () => {
    const w = chapterWorld(2);
    run(w, 20 * 100);
    const bats = w.buildings().filter((b) => b.type === 'battery' && b.owner === Z);
    expect(bats.length).toBeGreaterThan(0);
    const fort = w.buildings().find((b) => b.type === 'provintia_fort')!;
    expect(fort.hp).toBeLessThan(fort.maxHp);
  });

  it('AI vs AI is deterministic', () => {
    const a = chapterWorld(2, 5);
    const b = chapterWorld(2, 5);
    run(a, 20 * 60);
    run(b, 20 * 60);
    expect(hashWorld(a)).toBe(hashWorld(b));
  });

  it('difficulty scales AI income', async () => {
    const { incomeMul } = await import('../src/sim/systems/economy');
    const w = chapterWorld(2);
    w.ext.ai[Z].difficulty = 'hard';
    expect(incomeMul(w, Z)).toBe(1.25);
    w.ext.ai[Z].difficulty = 'easy';
    expect(incomeMul(w, Z)).toBe(0.7);
  });
});
