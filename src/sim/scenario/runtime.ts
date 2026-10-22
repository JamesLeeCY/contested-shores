// Per-tick scenario bookkeeping: chapter + global triggers, relief fleet, scenario choices.
import globalRules from '../../../data/scenarios/global.json';
import { registerCommand } from '../commands';
import { deathHooks } from '../systems/combat';
import { changeFavor, ensureParties, SETTLERS } from '../systems/diplomacy';
import { changeCastleMorale } from '../systems/morale';
import { captureBuilding } from '../systems/siege';
import { formationSlots } from '../systems/movement';
import type { World } from '../world';
import { spawnRelief } from './setup';
import { act, evaluate, noteDeath, runTriggers, type Condition, type Trigger } from './triggers';

const GLOBAL = (globalRules as { triggers: Trigger[] }).triggers;
const TRIGGER_TICKS = 5;

deathHooks.push((world, e) => {
  if (world.scenario) noteDeath(world, { owner: e.owner, unitType: e.type, kind: e.kind });
});

export interface ScenarioChoice {
  id: string;
  faction: string;
  labelKey: string;
  while: Condition;
}

export function availableChoices(world: World, faction: string): ScenarioChoice[] {
  const list = (world.scenario?.choices ?? []) as ScenarioChoice[];
  return list.filter((c) => c.faction === faction && !world.ext.flags[`choice:${c.id}`] && !world.ext.flags.missionOver && evaluate(world, c.while));
}

registerCommand('choice', (world, cmd) => {
  const c = availableChoices(world, cmd.owner).find((x) => x.id === cmd.id);
  if (!c) return;
  world.ext.flags[`choice:${c.id}`] = true;
  if (c.id === 'negotiate_provintia') {
    const fort = world.buildings().find((b) => b.type === 'provintia_fort');
    const castle = world.buildings().find((b) => b.type === 'zeelandia_castle');
    if (!fort || !castle) return;
    // The garrison marches out with its arms and is shipped back to Tayouan.
    const garrison = [...(fort.garrisoned ?? [])].map((id) => world.entities.get(id)!).filter(Boolean);
    fort.garrisoned = [];
    const slots = formationSlots(world, 'foot', castle.x + 6, castle.y + 4, garrison.length);
    garrison.forEach((u, i) => {
      u.insideOf = null;
      u.order = { type: 'idle' };
      u.x = u.px = slots[i][0];
      u.y = u.py = slots[i][1];
    });
    captureBuilding(world, fort, 'faction_zheng');
    const s = ensureParties(world)[SETTLERS];
    if (s) changeFavor(world, s, 'faction_voc', 20, 'scenario');
    changeCastleMorale(world, 'faction_voc', -10, 'negotiated');
    world.emit({ type: 'message', textKey: 'ch2.negotiated', kind: 'info' });
  } else if (c.id === 'sue_for_peace') {
    act(world, { type: 'show_cutscene', id: 'ch4_treaty' });
    act(world, { type: 'win_mission', faction: 'faction_voc', rating: 'historical', reasonKey: 'ch4.end.treaty', keepOpen: true });
    act(world, { type: 'win_mission', faction: 'faction_zheng', rating: 'victory', reasonKey: 'ch4.end.treaty' });
  }
});

export function scenarioSystem(world: World) {
  const sc = world.scenario;
  if (!sc) return;
  const r = sc.relief as (typeof sc.relief & { manual?: boolean }) | undefined;
  if (r && !r.manual && !world.ext.flags.reliefSpawned && world.tick >= r.atSeconds * world.ticksPerSecond) {
    world.ext.flags.reliefSpawned = true;
    spawnRelief(world, sc);
  }
  if (world.ext.flags.missionOver || world.tick % TRIGGER_TICKS !== 0) return;
  runTriggers(world, (sc.triggers ?? []) as Trigger[]);
  runTriggers(world, GLOBAL);
}

/** Seconds left on the chapter timer (null outside scenarios). */
export function timerSecondsLeft(world: World): number | null {
  const t = world.ext.flags.timerTicks;
  return typeof t === 'number' ? Math.max(0, (t - world.tick) / world.ticksPerSecond) : null;
}
