import ch1 from '../../data/scenarios/ch1.json';
import ch2 from '../../data/scenarios/ch2.json';
import ch3 from '../../data/scenarios/ch3.json';
import ch4 from '../../data/scenarios/ch4.json';
import ls1 from '../../data/scenarios/ls1.json';
import ls2 from '../../data/scenarios/ls2.json';
import ls3 from '../../data/scenarios/ls3.json';
import mudan1 from '../../data/scenarios/mudan1.json';
import mudan2 from '../../data/scenarios/mudan2.json';
import penghu1 from '../../data/scenarios/penghu1.json';
import penghu2 from '../../data/scenarios/penghu2.json';
import penghu3 from '../../data/scenarios/penghu3.json';
import yiwei1 from '../../data/scenarios/yiwei1.json';
import yiwei2 from '../../data/scenarios/yiwei2.json';
import yiwei3 from '../../data/scenarios/yiwei3.json';
import yiwei4 from '../../data/scenarios/yiwei4.json';
import yiwei5 from '../../data/scenarios/yiwei5.json';
import sf1 from '../../data/scenarios/sf1.json';
import sf2 from '../../data/scenarios/sf2.json';
import sf3 from '../../data/scenarios/sf3.json';
import wushe1 from '../../data/scenarios/wushe1.json';
import wushe2 from '../../data/scenarios/wushe2.json';
import type { Scenario } from '../sim/scenario/types';

export const SCENARIOS: Scenario[] = [ch1, ch2, ch3, ch4, penghu1, penghu2, penghu3, ls1, ls2, ls3, mudan1, mudan2, sf1, sf2, sf3, yiwei1, yiwei2, yiwei3, yiwei4, yiwei5, wushe1, wushe2] as unknown as Scenario[];

/** Campaigns in menu order; each lists its playable sides and scenarios. */
export const CAMPAIGNS = [
  { id: 'koxinga', factions: ['faction_zheng', 'faction_voc'] },
  { id: 'penghu', factions: ['faction_tungning', 'faction_qing'] },
  { id: 'linshuangwen', factions: ['faction_tiandihui', 'faction_qing1787'] },
  { id: 'mudan', factions: ['faction_paiwan', 'faction_japan'] },
  { id: 'sinofrench', factions: ['faction_qing84', 'faction_france'] },
  { id: 'yiwei', factions: ['faction_formosa', 'faction_japan_1895'] },
  { id: 'wushe', factions: ['faction_seediq', 'faction_sotokufu'] },
] as const;

export const campaignOf = (sc: Scenario) => sc.campaign ?? 'koxinga';
export const scenariosOf = (campaign: string) => SCENARIOS.filter((s) => campaignOf(s) === campaign);

export function scenarioById(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}
