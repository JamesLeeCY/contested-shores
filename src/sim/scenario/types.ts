// Scenario file format (data/scenarios/chN.json, spec §7).
import type { Owner } from '../types';

export interface UnitSpec {
  type: string;
  owner: Owner;
  count: number;
  /** Formation centre (continuous tile coordinates). */
  at?: [number, number];
  tag?: string;
  spacing?: number;
}

export interface BuildingSpec {
  type: string;
  owner: Owner;
  /** Top-left tile. */
  at?: [number, number];
  /** Inclusive tile line [from, to] (trenches). */
  line?: [[number, number], [number, number]];
  built?: number;
  tag?: string;
}

export interface FleetSpec {
  ship: string;
  owner: Owner;
  count: number;
  at?: [number, number];
  tag?: string;
  cargo: UnitSpec[];
}

export interface AiSpec {
  plans: string[];
  composition: Record<string, number>;
  targetArmy: number;
  home: [number, number];
  target?: string;
  defensive?: boolean;
  siege?: boolean;
  /** Battle scenarios: no economy or free-play state machine, only plans, production and tactics. */
  scripted?: boolean;
}

export interface Scenario {
  id: string;
  /** Campaign the scenario belongs to (default `koxinga`, the 1661 siege). */
  campaign?: string;
  /** Map id (default `taijiang`). */
  map?: string;
  /** Playable factions on this map (default 鄭氏 and VOC). */
  factions?: Owner[];
  /** Result-screen history card (default history.chN). */
  historyKey?: string;
  /** Rule overrides for this scenario, as dotted paths into rules.json (e.g. "combat.uphillUnitDamageMul"). */
  rules?: Record<string, number>;
  /** Live counts shown under the objectives (both sides see them): text params n0, n1… */
  status?: { textKey: string; counts: [region: string, owner: Owner][] }[];
  chapter: number;
  nameKey: string;
  dateKey: string;
  timerMinutes: number;
  stage: Record<Owner, number>;
  resources: Record<Owner, Record<string, number>>;
  castleMorale: number | 'carry';
  castleMoraleMin?: number;
  techs?: Record<Owner, string[]>;
  ownership?: { type: string; owner: Owner }[];
  buildings?: BuildingSpec[];
  units?: UnitSpec[];
  fleets?: FleetSpec[];
  garrisons?: (UnitSpec & { in: string })[];
  ai?: Record<Owner, AiSpec>;
  relief?: { atSeconds: number; owner: Owner; at: [number, number]; ships: UnitSpec[]; fleet: Omit<FleetSpec, 'owner' | 'at'>; manual?: boolean };
  historicalLoser?: Owner | null;
  choices?: unknown[];
  objectives?: unknown;
  triggers?: unknown[];
  [k: string]: unknown;
}

/** State carried between chapters (spec §7: favour, settlers, castle morale, ratings). */
export interface CampaignState {
  castleMorale?: number;
  favor?: Record<string, Record<Owner, number>>;
  ratings?: Record<string, Record<Owner, 'victory' | 'historical' | 'defeat'>>;
}
