// Cross-reference checks for data/scenarios/*.json and data/cutscenes.json.

const CONDITIONS = new Set([
  'time_elapsed', 'game_day', 'unit_hp_below', 'unit_dead', 'building_captured', 'area_entered', 'favor_reached',
  'tide_state', 'resource_below', 'all_of', 'any_of', 'not', 'castle_morale_below', 'army_pop_below', 'losses_since',
  'units_lost', 'building_hp_below', 'flag', 'timer_expired', 'stranded_in_range', 'outcome', 'is_ai', 'building_dead',
  'building_built',
]);
const ACTIONS = new Set([
  'show_message', 'show_cutscene', 'spawn_units', 'kill_unit', 'set_objective', 'complete_objective', 'fail_mission',
  'win_mission', 'modify_morale', 'modify_favor', 'set_stage', 'start_timer', 'trigger_weather', 'reveal_area',
  'set_ai_plan', 'set_flag', 'mark_army',
]);
/** Spec §7.1: types every MVP scenario engine must support. */
export const REQUIRED_WHEN = ['time_elapsed', 'game_day', 'unit_hp_below', 'unit_dead', 'building_captured', 'area_entered', 'favor_reached', 'tide_state', 'resource_below', 'all_of', 'any_of'];
export const REQUIRED_DO = ['show_message', 'show_cutscene', 'spawn_units', 'kill_unit', 'set_objective', 'complete_objective', 'fail_mission', 'win_mission', 'modify_morale', 'modify_favor', 'set_stage', 'start_timer', 'trigger_weather', 'reveal_area', 'set_ai_plan'];

interface Ctx {
  units: Set<string>;
  buildings: Set<string>;
  plans: Set<string>;
  regions: Set<string>;
  cutscenes: Record<string, { titleKey: string; lines: string[] }>;
  i18n: Record<string, string>;
}

type Obj = Record<string, unknown>;

export function validateScenario(name: string, sc: Obj, ctx: Ctx): string[] {
  const errors: string[] = [];
  const e = (m: string) => errors.push(`${name}: ${m}`);
  const key = (k: unknown, where: string) => typeof k === 'string' && !(k in ctx.i18n) && e(`${where}: missing i18n key "${k}"`);
  const unitSpec = (u: Obj, where: string) => {
    if (!ctx.units.has(u.type as string)) e(`${where}: unknown unit "${u.type}"`);
  };
  key(sc.nameKey, 'nameKey');
  key(sc.dateKey, 'dateKey');
  for (const [i, u] of ((sc.units as Obj[]) ?? []).entries()) unitSpec(u, `units[${i}]`);
  for (const [i, f] of ((sc.fleets as Obj[]) ?? []).entries()) {
    if (!ctx.units.has(f.ship as string)) e(`fleets[${i}]: unknown ship "${f.ship}"`);
    for (const c of (f.cargo as Obj[]) ?? []) unitSpec(c, `fleets[${i}].cargo`);
  }
  for (const [i, b] of ((sc.buildings as Obj[]) ?? []).entries()) if (!ctx.buildings.has(b.type as string)) e(`buildings[${i}]: unknown building "${b.type}"`);
  for (const [i, g] of ((sc.garrisons as Obj[]) ?? []).entries()) {
    unitSpec(g, `garrisons[${i}]`);
    if (!ctx.buildings.has(g.in as string)) e(`garrisons[${i}]: unknown building "${g.in}"`);
  }
  for (const [owner, ai] of Object.entries((sc.ai as Record<string, Obj>) ?? {})) {
    for (const p of (ai.plans as string[]) ?? []) if (!ctx.plans.has(p)) e(`ai.${owner}: unknown plan "${p}"`);
    for (const u of Object.keys((ai.composition as Obj) ?? {})) if (!ctx.units.has(u)) e(`ai.${owner}: unknown unit "${u}"`);
  }
  const cond = (c: Obj, where: string) => {
    if (!CONDITIONS.has(c.type as string)) e(`${where}: unknown condition "${c.type}"`);
    if (c.region && !ctx.regions.has(c.region as string)) e(`${where}: unknown region "${c.region}"`);
    for (const x of (c.conditions as Obj[]) ?? []) cond(x, where);
    if (c.condition) cond(c.condition as Obj, where);
  };
  const action = (a: Obj, where: string) => {
    if (!ACTIONS.has(a.type as string)) e(`${where}: unknown action "${a.type}"`);
    if (a.type === 'show_cutscene' && !ctx.cutscenes[a.id as string]) e(`${where}: unknown cutscene "${a.id}"`);
    if (a.type === 'set_ai_plan') for (const p of (a.plans as string[]) ?? []) if (!ctx.plans.has(p)) e(`${where}: unknown plan "${p}"`);
    for (const k of ['textKey', 'reasonKey']) key(a[k], where);
    if (a.region && !ctx.regions.has(a.region as string)) e(`${where}: unknown region "${a.region}"`);
  };
  const ids = new Set<string>();
  for (const t of (sc.triggers as Obj[]) ?? []) {
    const where = `trigger ${t.id}`;
    if (ids.has(t.id as string)) e(`duplicate trigger id "${t.id}"`);
    ids.add(t.id as string);
    cond(t.when as Obj, where);
    for (const a of (t.do as Obj[]) ?? []) action(a, where);
  }
  for (const c of (sc.choices as Obj[]) ?? []) {
    key(c.labelKey, `choice ${c.id}`);
    cond(c.while as Obj, `choice ${c.id}`);
  }
  return errors;
}

export function validateCutscenes(cuts: Ctx['cutscenes'], i18n: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [id, c] of Object.entries(cuts))
    for (const k of [c.titleKey, ...c.lines]) if (!(k in i18n)) errors.push(`cutscenes.json[${id}]: missing i18n key "${k}"`);
  return errors;
}
