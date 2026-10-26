// The allowed fields of a scenario file, read from the TypeScript definitions themselves (types.ts,
// triggers.ts) so the check follows the engine without a second schema to keep in step. Catches a
// misspelt field (`cuont`), which the engine would silently ignore, and a missing required one.

export interface Shape {
  /** Field → required? */
  [field: string]: boolean;
}

export interface ScenarioShapes {
  scenario: Shape;
  unit: Shape;
  building: Shape;
  fleet: Shape;
  ai: Shape;
  trigger: Shape;
  /** Condition / action type → its fields. */
  conditions: Record<string, Shape>;
  actions: Record<string, Shape>;
}

/** Top-level fields of `export interface <name> { … }` (nested object types are skipped over). */
function interfaceFields(src: string, name: string): Shape {
  const start = src.indexOf(`export interface ${name} {`);
  if (start < 0) throw new Error(`no interface ${name}`);
  const out: Shape = {};
  let depth = 0;
  let i = src.indexOf('{', start);
  const body: string[] = [];
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    if (c === '}') depth--;
    if (depth === 0) break;
    body.push(depth === 1 ? c : c === '\n' ? '\n' : ' ');
  }
  for (const line of body.join('').split('\n')) {
    const m = /^\s*([A-Za-z_]\w*)(\?)?:/.exec(line);
    if (m) out[m[1]] = !m[2];
  }
  return out;
}

/** Members of `export type <name> = | { type: 'x'; a: …; b?: … } | …`, keyed by `type`. */
function unionMembers(src: string, name: string): Record<string, Shape> {
  const start = src.indexOf(`export type ${name} =`);
  if (start < 0) throw new Error(`no type ${name}`);
  const end = src.indexOf(';\n\n', start);
  const text = src.slice(start, end).replace(/\/\*\*[\s\S]*?\*\//g, '');
  const out: Record<string, Shape> = {};
  for (const m of text.matchAll(/\|\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
    const fields: Shape = {};
    // Only the member's own fields: blank out nested `{ … }` first.
    const flat = m[1].replace(/\{[^{}]*\}/g, '{}');
    for (const f of flat.matchAll(/([A-Za-z_]\w*)(\?)?:/g)) fields[f[1]] = !f[2];
    const type = /type:\s*'([^']+)'/.exec(m[1])?.[1];
    if (type) out[type] = fields;
  }
  return out;
}

export function scenarioShapes(typesSrc: string, triggersSrc: string): ScenarioShapes {
  return {
    scenario: interfaceFields(typesSrc, 'Scenario'),
    unit: interfaceFields(typesSrc, 'UnitSpec'),
    building: interfaceFields(typesSrc, 'BuildingSpec'),
    fleet: interfaceFields(typesSrc, 'FleetSpec'),
    ai: interfaceFields(typesSrc, 'AiSpec'),
    trigger: interfaceFields(triggersSrc, 'Trigger'),
    conditions: unionMembers(triggersSrc, 'Condition'),
    actions: unionMembers(triggersSrc, 'Action'),
  };
}

/** Unknown and missing fields of `obj` against `shape` (`where` prefixes each message). */
export function checkShape(obj: Record<string, unknown>, shape: Shape, where: string): string[] {
  const errors: string[] = [];
  for (const k of Object.keys(obj)) if (!(k in shape)) errors.push(`${where}: unknown field "${k}"`);
  for (const [k, required] of Object.entries(shape)) if (required && !(k in obj)) errors.push(`${where}: missing field "${k}"`);
  return errors;
}
