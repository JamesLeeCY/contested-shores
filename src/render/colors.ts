import type { SimData } from '../sim/types';

/** Owner → [primary, secondary] colours (spec §9.3). */
export function ownerColors(data: SimData): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  const hex = (s: string) => parseInt(s.slice(1), 16);
  for (const f of data.factions.playable) m.set(f.id, [hex(f.colors.primary), hex(f.colors.secondary)]);
  for (const v of data.factions.villages) m.set(`village_${v.id}`, [hex(v.color), 0x2b2015]);
  m.set('faction_settlers', [hex(data.factions.settlers.color), 0x6b5b3e]);
  m.set('faction_neutral', [0x9e9e9e, 0x404040]);
  return m;
}

export function colorOf(colors: Map<string, [number, number]>, owner: string): [number, number] {
  return colors.get(owner) ?? [0x9e9e9e, 0x404040];
}

export const cssHex = (n: number) => '#' + n.toString(16).padStart(6, '0');
