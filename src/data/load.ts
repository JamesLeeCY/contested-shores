import units from '../../data/units.json';
import buildings from '../../data/buildings.json';
import techs from '../../data/techs.json';
import rules from '../../data/rules.json';
import factions from '../../data/factions.json';
import aiPlans from '../../data/ai_plans.json';
import zhTW from '../../i18n/zh-TW.json';
import type { BuildingDef, FactionsDef, Rules, TechDef, UnitDef } from './schema';
import { validateData } from './validate';

export interface GameData {
  units: Map<string, UnitDef>;
  buildings: Map<string, BuildingDef>;
  techs: Map<string, TechDef>;
  rules: Rules;
  factions: FactionsDef;
}

export const RAW = { units, buildings, techs, rules, factions, aiPlans, i18n: zhTW as Record<string, string> };

/** Validates bundled data at runtime and indexes it by id. Throws on invalid data. */
export function loadGameData(): GameData {
  const errors = validateData(RAW);
  if (errors.length) throw new Error('Invalid game data:\n' + errors.join('\n'));
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  return {
    units: byId(units as UnitDef[]),
    buildings: byId(buildings as BuildingDef[]),
    techs: byId(techs as TechDef[]),
    rules: rules as unknown as Rules,
    factions: factions as unknown as FactionsDef,
  };
}
