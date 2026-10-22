// Tide cycle (spec §4.8): rising 90 s → high 30 s → falling 90 s → low 30 s.
import { clearMove, isMoving, moveUnitTo } from './movement';
import type { World } from '../world';

export function tideSystem(world: World) {
  const phases = world.rules.tide.phases;
  world.tideTick++;
  if (world.tideTick < phases[world.tidePhase].seconds * world.ticksPerSecond) return;
  world.tideTick = 0;
  const wasHigh = world.tideHigh;
  world.tidePhase = (world.tidePhase + 1) % phases.length;
  world.emit({ type: 'tide', phase: world.tidePhaseId });
  if (wasHigh === world.tideHigh) return;
  world.nav.setTide(world.tideHigh);
  applyTideChange(world);
}

/** Strands ships on tiles that just dried out, frees stranded ones, and re-plans moving units. */
export function applyTideChange(world: World) {
  for (const e of world.all()) {
    if (e.kind !== 'unit' || e.insideOf) continue;
    const passable = world.nav.passable(e.moveClass!, Math.floor(e.x), Math.floor(e.y));
    if (e.moveClass !== 'foot') {
      if (!passable && !e.stranded) {
        e.stranded = true;
        clearMove(world, e);
        world.emit({ type: 'stranded', id: e.id });
        continue;
      }
      if (passable && e.stranded) e.stranded = false;
    }
    if (isMoving(e) && !e.flowKey) moveUnitTo(world, e, e.goalX!, e.goalY!);
  }
}

/** Seconds until the tide turns (for the UI ring). */
export function tideSecondsLeft(world: World): number {
  const p = world.rules.tide.phases[world.tidePhase];
  return p.seconds - world.tideTick / world.ticksPerSecond;
}
