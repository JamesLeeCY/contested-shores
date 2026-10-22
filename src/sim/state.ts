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

export interface ExtState {
  parties: Record<string, PartyState>;
  supply: { ship: number | null; lastDispatchDay: number };
  typhoon: { warnAt: number; startAt: number; endAt: number } | null;
  tatu: { batch: number; lastEnter: number; northern: Record<Owner, number>; enabled: boolean };
  /** Scenario flags and misc counters (e.g. requisition used). */
  flags: Record<string, number | boolean | string>;
}

export function initialExt(): ExtState {
  return {
    parties: {},
    supply: { ship: null, lastDispatchDay: 0 },
    typhoon: null,
    tatu: { batch: 0, lastEnter: -1, northern: {}, enabled: true },
    flags: {},
  };
}
