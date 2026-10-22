import type rulesJson from '../../data/rules.json';
import type { AiPlanDef, BuildingDef, FactionsDef, ResourceId, TechDef, UnitDef } from '../data/schema';
import type { MoveClass } from './path/navgrid';

export type RulesData = typeof rulesJson;

/** Static definitions the simulation reads (never mutated except world.rules, which is a per-game clone). */
export interface SimData {
  units: Map<string, UnitDef>;
  buildings: Map<string, BuildingDef>;
  techs: Map<string, TechDef>;
  rules: RulesData;
  factions: FactionsDef;
  aiPlans?: Map<string, AiPlanDef>;
}

/** Playable factions plus neutral owners: `faction_settlers`, `village_<id>`, `faction_neutral`. */
export type Owner = string;
export const ZHENG = 'faction_zheng';
export const VOC = 'faction_voc';
export const PLAYABLE: Owner[] = [ZHENG, VOC];

export type Resources = Record<ResourceId, number>;

export type Order =
  | { type: 'idle' }
  | { type: 'move'; x: number; y: number; attackMove?: boolean }
  | { type: 'attack'; target: number }
  | { type: 'attack_ground'; x: number; y: number }
  | {
      type: 'gather';
      resource: ResourceId;
      /** Entity source (farm, deer herd) or forest tile index. */
      target?: number;
      tile?: number;
      phase: 'to_resource' | 'gathering' | 'to_dropoff';
      dropoff?: number;
      /** Approach attempts that ended out of reach (avoids re-path loops). */
      tries?: number;
    }
  | { type: 'build'; target: number }
  | { type: 'garrison'; target: number }
  | { type: 'tuntian'; target: number }
  | { type: 'embark'; target: number }
  | { type: 'unload'; x: number; y: number }
  | { type: 'dig_mine'; target: number }
  | { type: 'rout'; until: number }
  | { type: 'patrol'; ax: number; ay: number; bx: number; by: number; toB: boolean }
  | { type: 'diplomacy'; village: string; action: 'gift_grain' | 'gift_deerskin' | 'pacify' | 'request_warriors' };

export interface ProductionItem {
  kind: 'unit' | 'tech';
  id: string;
  /** Ticks remaining. */
  remaining: number;
  total: number;
  /** Set once population was reserved and training began. */
  started: boolean;
  cost: Resources;
}

export interface Entity {
  id: number;
  kind: 'unit' | 'building' | 'resource';
  type: string;
  owner: Owner;
  /** Continuous tile coordinates of the centre; `px/py` are last tick's values for interpolation. */
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  radius: number;
  tag?: string;
  dead?: boolean;

  // --- units ---
  moveClass?: MoveClass;
  order?: Order;
  /** Flattened waypoint list [x0, y0, x1, y1, …] and current index. */
  path?: number[] | null;
  pathIdx?: number;
  /** Shared flow field key for large group moves. */
  flowKey?: string | null;
  goalX?: number;
  goalY?: number;
  pathPending?: boolean;
  /** Consecutive ticks without progress while moving. */
  stuck?: number;
  /** Re-plans triggered by being stuck during the current move. */
  repaths?: number;
  /** Tick of the last blocked-step re-plan (throttle). */
  blockedAt?: number;
  stranded?: boolean;
  morale?: number;
  cooldown?: number;
  deployTicks?: number;
  carrying?: { resource: ResourceId; amount: number };
  cargo?: number[];
  insideOf?: number | null;
  /** Tick at which a garrisoned unit leaves its building (tuntian recall delay). */
  releaseAt?: number;
  facing?: number;
  /** Current combat target (explicit or auto-acquired). */
  attackTarget?: number;
  /** Movement was issued by combat to chase a target; arrival must not end the order. */
  chasing?: boolean;
  chaseAt?: number;
  lastHit?: number;
  lastAttacker?: number;
  lastCombat?: number;
  gunCooldowns?: number[];
  /** Capture progress in ticks and the capturing owner. */
  captureTicks?: number;
  captureBy?: Owner;
  /** Mine (坑道) state. */
  mineTarget?: number;
  mineLength?: number;
  mineTicks?: number;
  mineFromX?: number;
  mineFromY?: number;

  // --- buildings / resources ---
  tx?: number;
  ty?: number;
  w?: number;
  h?: number;
  /** Construction progress 0..1; 1 when complete. */
  built?: number;
  /** Whether the footprint blocks movement. */
  blocks?: boolean;
  queue?: ProductionItem[];
  rally?: { x: number; y: number } | null;
  /** Head of the production queue is waiting for population room. */
  popBlocked?: boolean;
  garrisoned?: number[];
  amount?: number;
  maxAmount?: number;
  village?: string;
}

export interface FactionState {
  id: Owner;
  resources: Resources;
  basePopCap: number;
  techs: string[];
  stage: number;
  /** VOC only: castle morale 0–100 (spec §4.6). */
  castleMorale: number;
  defeated: boolean;
  /** Tech modifiers: unit type → stat → {add, set}. */
  unitMods: Record<string, Record<string, { add: number; set?: number }>>;
  /** Tech modifiers for building guns. */
  buildingMods: Record<string, { range: number; atk: number; traits: string[] }>;
  /** Terrain types revealed on the map for this faction (何斌海圖). */
  revealTerrain: string[];
  /** Ticks of the current starvation warning (UI flash). */
  starvingUntil: number;
  /** Extra cannon damage vs the main castle (set when 烏特勒支堡 is captured). */
  mainBaseCannonBonus: number;
}

/** Something that happened during a tick (UI messages, effects, scenario triggers). */
export interface SimEvent {
  type: string;
  [k: string]: unknown;
}
