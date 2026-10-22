import type { Entity } from '../types';
import type { World } from '../world';

export interface AttackCtx {
  world: World;
  attacker: Entity;
  target: Entity;
  atkType: string;
  /** True when the attacker is a building gun or a unit firing from inside a building. */
  fromBuilding: boolean;
}

/**
 * A trait hooks into combat/movement at well-defined points. All hooks are optional; a trait
 * that only flags behaviour elsewhere (e.g. `gatherer`) has an empty handler.
 */
export interface TraitHandler {
  /** Additive outgoing damage bonus (Σbonus in the §4.5 formula). */
  damageBonus?(ctx: AttackCtx): number;
  /** Additive hit-chance bonus. */
  hitBonus?(ctx: AttackCtx): number;
  /** Multiplier on incoming damage for the target that has this trait (0 = blocked). */
  incomingMul?(ctx: AttackCtx): number;
  /** Whether the attacker may fire right now. */
  canFire?(world: World, e: Entity): boolean;
  /** Side effects after a hit lands (cleave, splash). */
  afterHit?(ctx: AttackCtx, damage: number): void;
  /** Additional targets fired at in the same volley (broadside). */
  extraTargets?(ctx: AttackCtx, candidates: Entity[]): Entity[];
  /** Movement speed multiplier. */
  speedMul?(world: World, e: Entity): number;
}
