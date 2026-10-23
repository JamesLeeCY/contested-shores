// Traits that are flags read by other systems rather than combat hooks:
// gatherer/builder (economy, build), naval/small_craft (move class), hero (UI, AI),
// non_combat (never attacks), civilian (never targeted), diplomat (diplomacy), uses_powder (combat powder use),
// aura_* (morale system), transport_N (transport system), forest_stealth and mountain_stealth (fog system).
import type { TraitHandler } from './types';

export const passive: TraitHandler = {};
