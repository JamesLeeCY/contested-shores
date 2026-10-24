import ch1 from '../../data/scenarios/ch1.json';
import ch2 from '../../data/scenarios/ch2.json';
import ch3 from '../../data/scenarios/ch3.json';
import ch4 from '../../data/scenarios/ch4.json';
import mudan1 from '../../data/scenarios/mudan1.json';
import mudan2 from '../../data/scenarios/mudan2.json';
import penghu1 from '../../data/scenarios/penghu1.json';
import penghu2 from '../../data/scenarios/penghu2.json';
import type { Scenario } from '../sim/scenario/types';

export const SCENARIOS: Scenario[] = [ch1, ch2, ch3, ch4, penghu1, penghu2, mudan1, mudan2] as unknown as Scenario[];

/** Campaigns in menu order; each lists its playable sides and scenarios. */
export const CAMPAIGNS = [
  { id: 'koxinga', factions: ['faction_zheng', 'faction_voc'] },
  { id: 'penghu', factions: ['faction_tungning', 'faction_qing'] },
  { id: 'mudan', factions: ['faction_paiwan', 'faction_japan'] },
] as const;

export const campaignOf = (sc: Scenario) => sc.campaign ?? 'koxinga';
export const scenariosOf = (campaign: string) => SCENARIOS.filter((s) => campaignOf(s) === campaign);

export function scenarioById(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}
