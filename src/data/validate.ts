import { z } from 'zod';
import {
  AiPlanSchema,
  BuildingSchema,
  FactionsSchema,
  RulesSchema,
  TechSchema,
  UnitSchema,
  type BuildingDef,
  type TechDef,
  type UnitDef,
} from './schema';

export interface RawData {
  units: unknown;
  buildings: unknown;
  techs: unknown;
  rules: unknown;
  factions: unknown;
  aiPlans: unknown;
  i18n: Record<string, string>;
}

/** Schema + cross-reference validation. Returns a list of human-readable errors (empty = valid). */
export function validateData(raw: RawData): string[] {
  const errors: string[] = [];
  const parse = <T>(name: string, schema: z.ZodType<T>, value: unknown): T | null => {
    const r = schema.safeParse(value);
    if (!r.success) {
      for (const issue of r.error.issues) errors.push(`${name}: ${issue.path.join('.')} ${issue.message}`);
      return null;
    }
    return r.data;
  };

  const units = parse('units.json', z.array(UnitSchema), raw.units);
  const buildings = parse('buildings.json', z.array(BuildingSchema), raw.buildings);
  const techs = parse('techs.json', z.array(TechSchema), raw.techs);
  parse('rules.json', RulesSchema, raw.rules);
  const factions = parse('factions.json', FactionsSchema, raw.factions);
  parse('ai_plans.json', z.array(AiPlanSchema), raw.aiPlans);
  if (!units || !buildings || !techs || !factions) return errors;

  const dupes = (name: string, list: { id: string }[]) => {
    const seen = new Set<string>();
    for (const { id } of list) {
      if (seen.has(id)) errors.push(`${name}: duplicate id "${id}"`);
      seen.add(id);
    }
    return seen;
  };
  const unitIds = dupes('units.json', units);
  const buildingIds = dupes('buildings.json', buildings);
  const techIds = dupes('techs.json', techs);

  const ref = (where: string, kind: string, ids: Set<string>, value: string) => {
    if (!ids.has(value)) errors.push(`${where}: unknown ${kind} "${value}"`);
  };
  const key = (where: string, k: string) => {
    if (!(k in raw.i18n)) errors.push(`${where}: missing i18n key "${k}" in zh-TW.json`);
  };

  units.forEach((u: UnitDef) => {
    const w = `units.json[${u.id}]`;
    u.producedAt.forEach((b) => ref(w + '.producedAt', 'building', buildingIds, b));
    if (u.producible && u.producedAt.length === 0) errors.push(`${w}: producible unit has no producedAt`);
    if (u.naval !== u.traits.includes('naval')) errors.push(`${w}: naval flag disagrees with traits`);
    key(w, u.nameKey);
  });
  buildings.forEach((b: BuildingDef) => {
    const w = `buildings.json[${b.id}]`;
    b.produces.forEach((u) => ref(w + '.produces', 'unit', unitIds, u));
    b.researches.forEach((t) => ref(w + '.researches', 'tech', techIds, t));
    key(w, b.nameKey);
  });
  techs.forEach((t: TechDef) => {
    const w = `techs.json[${t.id}]`;
    ref(w + '.researchedAt', 'building', buildingIds, t.researchedAt);
    const at = buildings.find((b) => b.id === t.researchedAt);
    if (at && !at.researches.includes(t.id)) errors.push(`${w}: ${t.researchedAt}.researches does not list it`);
    for (const e of t.effects) {
      if ('units' in e) e.units.forEach((u) => ref(w + '.effects', 'unit', unitIds, u));
      if ('buildings' in e) e.buildings.forEach((b) => ref(w + '.effects', 'building', buildingIds, b));
    }
    key(w, t.nameKey);
    key(w, t.descKey);
  });
  factions.playable.forEach((f) => {
    f.heroes.forEach((h) => ref(`factions.json[${f.id}].heroes`, 'unit', unitIds, h));
    key(`factions.json[${f.id}]`, f.nameKey);
  });
  factions.villages.forEach((v) => key(`factions.json villages[${v.id}]`, v.nameKey));

  return errors;
}
