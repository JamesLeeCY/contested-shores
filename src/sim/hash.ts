// State hash for determinism checks (spec §10.3: compared every 100 ticks).
import type { World } from './world';

const q = (v: number) => Math.round(v * 1000);

export function hashWorld(world: World): string {
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    h ^= v | 0;
    h = Math.imul(h, 0x01000193);
    h ^= (v / 4294967296) | 0;
    h = Math.imul(h, 0x01000193);
  };
  mix(world.tick);
  mix(world.rng.state);
  mix(world.tidePhase);
  mix(world.tideTick);
  for (const e of world.all()) {
    mix(e.id);
    mix(q(e.x));
    mix(q(e.y));
    mix(q(e.hp));
    mix(q(e.morale ?? 0));
    mix(e.stranded ? 1 : 0);
    mix(q(e.amount ?? 0));
    mix(q(e.built ?? 0));
  }
  for (const id of [...world.factions.keys()].sort()) {
    const f = world.factions.get(id)!;
    for (const k of Object.keys(f.resources).sort()) mix(q(f.resources[k as keyof typeof f.resources]));
    mix(q(f.castleMorale));
  }
  for (const id of Object.keys(world.ext.parties).sort()) {
    const p = world.ext.parties[id];
    for (const f of Object.keys(p.favor).sort()) mix(q(p.favor[f]));
    mix(p.ally ? p.ally.length : 0);
  }
  mix(world.ext.tatu.batch);
  return (h >>> 0).toString(16).padStart(8, '0');
}
