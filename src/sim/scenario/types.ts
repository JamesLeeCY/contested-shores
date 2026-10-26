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
  /** Starting health as a fraction of full (a fleet still battered from the last battle). */
  hp?: number;
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
  status?: { textKey: string; counts: [region: string, owner: Owner, unit?: 'units'][] }[];
  /** Units that appear only if an earlier scenario ended a certain way (e.g. 阿祿古 survived). */
  carry?: { if: { scenario: string; faction: Owner; reasons: string[] }; units: UnitSpec[]; resources?: Record<Owner, Record<string, number>> }[];
  /** Wind: compass bearing it blows from, strength 0..1, and scripted shifts. */
  wind?: { from: number; strength: number; shifts?: { atSeconds: number; from: number; strength?: number }[] };
  /** Supply line: `owner`'s soldiers farther than `radius` from a source unit/building lose morale. */
  /**
   * Supply line: beyond `radius` of a source, morale drains — gently at first, at the full rate `ramp`
   * tiles further out — but never below `floor` (hunger weakens, it does not rout on its own).
   */
  supply?: { owner: Owner; radius: number; drainPerSecond: number; sources: string[]; ramp?: number; floor?: number };
  /** Campaign side → this scenario's faction (e.g. the 1895 defenders play 太魯閣族 in 1914). */
  sideOf?: Record<string, Owner>;
  /** Extra regions for this scenario only (e.g. an escape zone), added to the map's own. */
  regions?: { id: string; x: number; y: number; w: number; h: number }[];
  /** Only these factions may be played (the 東寧 epilogue is the court's decision). */
  playable?: Owner[];
  /** Night until dawn: sight multiplied by `sightMul`. */
  night?: { untilSeconds: number; sightMul: number };
  /** Spells of heavy rain (1885 月眉山): firearms miss more and sight shrinks while they last. */
  rain?: { fromSeconds: number; untilSeconds: number; hitPenalty: number; sightMul: number }[];
  chapter: number;
  nameKey: string;
  dateKey: string;
  timerMinutes: number;
  stage: Record<Owner, number>;
  resources: Record<Owner, Record<string, number>>;
  castleMorale: number | 'carry';
  castleMoraleMin?: number;
  techs?: Record<Owner, string[]>;
  /**
   * Hands map buildings to another side; `tag` renames them (label from `place.<tag>`), e.g. 普羅民遮城 → 承天府;
   * `from` limits it to the building with that map tag (the same map in another century).
   */
  ownership?: { type: string; owner: Owner; tag?: string; from?: string }[];
  /** Mechanic hints shown once per browser: at the start, or on the first event of type `on`. */
  hints?: { textKey: string; on?: string }[];
  /** Resource bar per side: which resources to show (all when absent, in 1661 and 1874), and relabels. */
  hud?: Record<Owner, string[]>;
  hudLabels?: Record<string, string>;
  /** Map buildings (types or tags) gone by this chapter, e.g. the police posts burned in 1930 chapter 1. */
  remove?: string[];
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
  /** Outcome reason keys per finished scenario and side (for carried-over heroes). */
  reasons?: Record<string, Record<Owner, string>>;
}
