import { z } from 'zod';

export const RESOURCES = ['grain', 'wood', 'powder', 'deerskin'] as const;
export const ATK_TYPES = ['melee', 'arrow', 'musket', 'cannon', 'fire'] as const;
export const ARMOR_TYPES = ['none', 'scale', 'cuirass', 'building', 'ship'] as const;
export const FACTIONS = ['faction_zheng', 'faction_voc', 'faction_neutral', 'faction_settlers', 'faction_village'] as const;

// Every trait used by data must have a handler in src/sim/traits/ (spec §5.1).
export const KNOWN_TRAITS = [
  'gatherer', 'builder', 'block_arrow_30', 'cleave_2', 'uses_powder', 'must_deploy', 'battery_only',
  'naval', 'small_craft', 'transport_10', 'transport_6', 'suicide', 'hero', 'aura_koxinga', 'aura_coyett',
  'aura_pedel', 'diplomat', 'volley', 'anti_charge', 'splash_1', 'broadside', 'forest_stealth',
  'fast_terrain', 'non_combat',
] as const;

export const CostSchema = z.object({
  grain: z.number().min(0),
  wood: z.number().min(0),
  powder: z.number().min(0),
  deerskin: z.number().min(0),
});

const id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'ids must be snake_case');

export const UnitSchema = z.object({
  id,
  faction: z.enum(FACTIONS),
  nameKey: z.string(),
  class: z.enum(['worker', 'infantry', 'siege', 'naval', 'hero']),
  hp: z.number().positive(),
  atk: z.number().min(0),
  atkType: z.enum(ATK_TYPES),
  atkInterval: z.number().min(0),
  armor: z.number().min(0),
  armorType: z.enum(ARMOR_TYPES),
  range: z.number().min(1),
  sight: z.number().min(1),
  speed: z.number().positive(),
  hitChance: z.number().min(0).max(1),
  powderPerShot: z.number().min(0),
  producible: z.boolean(),
  cost: CostSchema,
  buildTime: z.number().min(0),
  pop: z.number().min(0),
  stage: z.number().int().min(1).max(4),
  producedAt: z.array(id),
  traits: z.array(z.enum(KNOWN_TRAITS)),
  naval: z.boolean(),
  smallCraft: z.boolean(),
});

const BuildingAttackSchema = z.object({
  guns: z.number().int().positive(),
  atk: z.number().positive(),
  atkType: z.enum(ATK_TYPES),
  range: z.number().positive(),
  atkInterval: z.number().positive(),
  hitChance: z.number().min(0).max(1),
});

export const BuildingSchema = z
  .object({
    id,
    faction: z.union([z.enum(FACTIONS), z.literal('any')]),
    nameKey: z.string(),
    hp: z.number().positive(),
    armor: z.number().min(0),
    armorType: z.literal('building'),
    preset: z.boolean(),
    cost: CostSchema,
    buildTime: z.number().min(0),
    popCap: z.number().min(0),
    size: z.number().int().min(1).max(6),
    sight: z.number().min(1),
    dropoff: z.boolean(),
    produces: z.array(id),
    researches: z.array(id),
    garrison: z.number().int().min(0),
    diseaseShelter: z.boolean(),
    attack: BuildingAttackSchema.nullable(),
  })
  .passthrough();

const TechEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('set_rule'), path: z.string(), value: z.number() }),
  z.object({ type: z.literal('mul_rule'), path: z.string(), value: z.number() }),
  z.object({ type: z.literal('add_rule'), path: z.string(), value: z.number() }),
  z.object({ type: z.literal('reveal_terrain'), terrain: z.array(z.string()) }),
  z.object({ type: z.literal('add_unit_stat'), units: z.array(id), stat: z.string(), value: z.number() }),
  z.object({ type: z.literal('set_unit_stat'), units: z.array(id), stat: z.string(), value: z.number() }),
  z.object({ type: z.literal('add_building_attack'), buildings: z.array(id), range: z.number(), atk: z.number() }),
  z.object({ type: z.literal('add_building_trait'), buildings: z.array(id), trait: z.string() }),
  z.object({ type: z.literal('favor_all'), faction: z.enum(FACTIONS), value: z.number() }),
]);

export const TechSchema = z.object({
  id,
  faction: z.enum(FACTIONS),
  nameKey: z.string(),
  descKey: z.string(),
  researchedAt: id,
  cost: CostSchema,
  time: z.number().positive(),
  stage: z.number().int().min(1).max(4),
  effects: z.array(TechEffectSchema),
});

const TidePhaseSchema = z.object({
  id: z.enum(['rising', 'high', 'falling', 'low']),
  seconds: z.number().positive(),
  high: z.boolean(),
});

// Rules are deep and evolve with each phase; validate the parts the sim reads directly and pass the rest through.
export const RulesSchema = z
  .object({
    sim: z.object({ tickHz: z.number().int().positive(), ticksPerDay: z.number().int().positive(), fogUpdateTicks: z.number().int().positive() }),
    resources: z.array(z.enum(RESOURCES)),
    combat: z
      .object({
        damageMatrix: z.record(z.enum(ATK_TYPES), z.record(z.enum(ARMOR_TYPES), z.number().min(0))),
        minDamage: z.number(),
      })
      .passthrough(),
    tide: z.object({ phases: z.array(TidePhaseSchema).length(4), strandedDamageTakenMul: z.number() }),
  })
  .passthrough();

export const VillageSchema = z.object({
  id,
  dutchName: z.string(),
  nameKey: z.string(),
  pos: z.tuple([z.number().int(), z.number().int()]),
  color: z.string(),
  favor: z.object({ faction_zheng: z.number().min(0).max(100), faction_voc: z.number().min(0).max(100) }),
  pacifyMul: z.number().positive(),
  allianceBonus: z.object({ type: z.string() }).passthrough(),
  warriors: z.number().int().min(0).optional(),
});

export const FactionsSchema = z.object({
  playable: z.array(
    z.object({
      id: z.enum(FACTIONS),
      nameKey: z.string(),
      basePopCap: z.number().int().positive(),
      colors: z.object({ primary: z.string(), secondary: z.string() }),
      heroes: z.array(id),
      startResources: CostSchema,
    }),
  ),
  villages: z.array(VillageSchema),
  settlers: z.object({
    id: z.string(),
    nameKey: z.string(),
    color: z.string(),
    favor: z.object({ faction_zheng: z.number(), faction_voc: z.number() }).optional(),
  }),
});

export const AiPlanSchema = z.object({
  id,
  faction: z.union([z.enum(FACTIONS), z.literal('any')]),
  chapters: z.array(z.number().int().min(1).max(4)),
  steps: z.array(z.string()),
});

export type UnitDef = z.infer<typeof UnitSchema>;
export type BuildingDef = z.infer<typeof BuildingSchema>;
export type TechDef = z.infer<typeof TechSchema>;
export type Rules = z.infer<typeof RulesSchema> & Record<string, unknown>;
export type FactionsDef = z.infer<typeof FactionsSchema>;
export type AiPlanDef = z.infer<typeof AiPlanSchema>;
export type ResourceId = (typeof RESOURCES)[number];
export type AtkType = (typeof ATK_TYPES)[number];
export type ArmorType = (typeof ARMOR_TYPES)[number];
export type FactionId = (typeof FACTIONS)[number];
