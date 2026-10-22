import type rulesJson from '../../data/rules.json';
import type { BuildingDef, FactionsDef, ResourceId, TechDef, UnitDef } from '../data/schema';
import type { MoveClass } from './path/navgrid';

export type RulesData = typeof rulesJson;

/** Static definitions the simulation reads (never mutated except world.rules, which is a per-game clone). */
export interface SimData {
  units: Map<string, UnitDef>;
  buildings: Map<string, BuildingDef>;
  techs: Map<string, TechDef>;
  rules: RulesData;
  factions: FactionsDef;
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
  | { type: 'gather'; target: number; resource: ResourceId; phase: 'to_resource' | 'gathering' | 'to_dropoff' }
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
  stranded?: boolean;
  morale?: number;
  cooldown?: number;
  deployTicks?: number;
  carrying?: { resource: ResourceId; amount: number };
  cargo?: number[];
  insideOf?: number | null;
  facing?: number;

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
}

export type SimEvent =
  | { type: 'tide'; phase: string }
  | { type: 'stranded'; id: number }
  | { type: 'message'; textKey: string; params?: Record<string, string | number> }
  | { type: 'death'; id: number; unitType: string; owner: Owner; x: number; y: number }
  | { type: 'shot'; from: number; to: number; atkType: string; hit: boolean; x: number; y: number; tx: number; ty: number }
  | { type: 'explosion'; x: number; y: number; size: 'small' | 'large' }
  | { type: string; [k: string]: unknown };
