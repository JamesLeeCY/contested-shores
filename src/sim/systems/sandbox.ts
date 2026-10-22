// Sandbox-only debug command (spec §11 stage 5: trigger every system by hand). Routed through the
// command queue so sandbox sessions still replay deterministically.
import { registerCommand } from '../commands';
import type { World } from '../world';
import { changeFavor, ensureParties, SETTLERS } from './diplomacy';
import { diseaseTick } from './disease';
import { dispatchSupply } from './supply';
import { scheduleTyphoon } from './weather';

function nextDay(world: World) {
  // Run the full daily settlement now (upkeep, disease, drift, tributes…).
  const tpd = world.rules.sim.ticksPerDay;
  world.tick = (Math.floor(world.tick / tpd) + 1) * tpd;
}

registerCommand('sandbox', (world, cmd) => {
  if (!world.opts.sandbox) return;
  const f = world.faction(cmd.owner);
  switch (cmd.action) {
    case 'next_day':
      nextDay(world);
      break;
    case 'disease':
      diseaseTick(world);
      break;
    case 'supply':
      dispatchSupply(world);
      break;
    case 'typhoon':
      scheduleTyphoon(world, world.tick + 30 * world.ticksPerSecond);
      break;
    case 'tatu': {
      // March 31 fresh soldiers into the northern exit.
      for (let i = 0; i < 31; i++) world.spawnUnit('shield_soldier', 'faction_zheng', 148.5 + (i % 5) * 0.6, 1.5 + Math.floor(i / 5) * 0.3);
      break;
    }
    case 'favor': {
      ensureParties(world);
      const p = world.ext.parties[String(cmd.arg ?? 'sinkan').split(':')[0]];
      const delta = Number(String(cmd.arg ?? 'sinkan:20').split(':')[1] ?? 20);
      if (p) changeFavor(world, p, cmd.owner, delta, 'sandbox');
      break;
    }
    case 'settlers': {
      const p = ensureParties(world)[SETTLERS];
      if (p) changeFavor(world, p, cmd.owner, 30, 'sandbox');
      break;
    }
    case 'stage':
      if (f) f.stage = Math.min(4, f.stage + 1);
      break;
    case 'resources':
      if (f) for (const k of ['grain', 'wood', 'powder', 'deerskin'] as const) f.resources[k] += 500;
      break;
  }
});
