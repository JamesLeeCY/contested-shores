// Serializable state owned by the campaign systems (diplomacy, supply, weather, events).
import type { Owner } from './types';

export interface FavorLogEntry {
  faction: Owner;
  delta: number;
  reason: string;
  tick: number;
}

/** A neutral party the playable factions court: one of the four villages, or the settlers. */
export interface PartyState {
  id: string;
  /** Owner id of its entities: `village_<id>` or `faction_settlers`. */
  owner: Owner;
  favor: Record<Owner, number>;
  ally: Owner | null;
  hostile: Owner[];
  log: FavorLogEntry[];
  /** `${action}:${faction}` → tick when the action is available again. */
  cooldowns: Record<string, number>;
  /** Event throttles: `${event}:${faction}` → tick of last application. */
  throttle: Record<string, number>;
  /** Faction → tick until which the village counter-attacks it (invaded). */
  invaded: Record<Owner, number>;
  /** Warriors currently lent to the ally. */
  lent: number[];
  /** Warriors out raiding and the tick they head home. */
  raiders: number[];
  raidUntil: number;
}

export type AiStateName = 'ECONOMY' | 'BUILDUP' | 'ATTACK' | 'DEFEND' | 'REGROUP' | 'SIEGE';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AiState {
  owner: Owner;
  difficulty: Difficulty;
  plans: string[];
  composition: Record<string, number>;
  targetArmy: number;
  home: [number, number];
  target?: string;
  defensive?: boolean;
  scripted?: boolean;
  siege?: boolean;
  state: AiStateName;
  prevState: AiStateName;
  planIdx: number;
  stepIdx: number;
  stepStart: number;
  /** Scratch data for the running plan step. */
  step: Record<string, unknown>;
  /** Persistent behaviours started by earlier plan steps (e.g. patrol, hold). */
  background: string[];
  /** Plan-wide memory shared by consecutive steps (e.g. the sortie group, ferry state). */
  mem: Record<string, unknown>;
  lastStrategic: number;
  lastTactical: number;
  armyAtAttack: number;
  calmSince: number;
}

export interface ExtState {
  parties: Record<string, PartyState>;
  /** AI-controlled factions. */
  ai: Record<Owner, AiState>;
  supply: { ship: number | null; lastDispatchDay: number };
  typhoon: { warnAt: number; startAt: number; endAt: number } | null;
  tatu: { batch: number; lastEnter: number; northern: Record<Owner, number>; enabled: boolean };
  /** Scenario flags and misc counters (e.g. requisition used). */
  flags: Record<string, number | boolean | string>;
  /** Wind (1683 scenarios); absent elsewhere. */
  wind?: { from: number; strength: number };
}

export function initialExt(): ExtState {
  return {
    parties: {},
    ai: {},
    supply: { ship: null, lastDispatchDay: 0 },
    typhoon: null,
    tatu: { batch: 0, lastEnter: -1, northern: {}, enabled: true },
    flags: {},
  };
}
