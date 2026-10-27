// Trait name → handler (spec §5.1: one handler per trait under src/sim/traits/).
import type { KNOWN_TRAITS } from '../../data/schema';
import { anti_charge } from './anti_charge';
import { battery_only } from './battery_only';
import { block_arrow_30 } from './block_arrow_30';
import { broadside } from './broadside';
import { cleave_2 } from './cleave_2';
import { fast_terrain } from './fast_terrain';
import { must_deploy } from './must_deploy';
import { passive } from './passive';
import { splash_1 } from './splash_1';
import { suicide } from './suicide';
import type { TraitHandler } from './types';
import { volley } from './volley';

export const TRAITS: Record<(typeof KNOWN_TRAITS)[number] | 'grapeshot', TraitHandler> = {
  gatherer: passive,
  builder: passive,
  uses_powder: passive,
  naval: passive,
  small_craft: passive,
  transport_10: passive,
  transport_6: passive,
  hero: passive,
  aura_koxinga: passive,
  aura_coyett: passive,
  aura_pedel: passive,
  diplomat: passive,
  forest_stealth: passive,
  non_combat: passive,
  aura_sakuma: passive,
  aura_aruqu: passive,
  civilian: passive,
  mountain_stealth: passive,
  aura_admiral: passive,
  aura_captain: passive,
  transport_4: passive,
  // Cheat vehicles (src/sim/cheats.ts): left out of army counts and scenario triggers.
  cheat: passive,
  block_arrow_30,
  cleave_2,
  volley,
  anti_charge,
  must_deploy,
  battery_only,
  broadside,
  suicide,
  splash_1,
  fast_terrain,
  // Building trait granted by 霰彈 (tech_grapeshot): splash when the target is within 3 tiles.
  grapeshot: {
    afterHit(ctx, damage) {
      const b = ctx.attacker;
      const d = Math.hypot(ctx.target.x - b.x, ctx.target.y - b.y) - (b.w ?? 0) / 2;
      if (d <= 3) splash_1.afterHit!(ctx, damage);
    },
  },
};

export function traitsOf(names: readonly string[]): TraitHandler[] {
  return names.map((n) => TRAITS[n as keyof typeof TRAITS]).filter(Boolean);
}
