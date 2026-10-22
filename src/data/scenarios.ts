import ch1 from '../../data/scenarios/ch1.json';
import ch2 from '../../data/scenarios/ch2.json';
import ch3 from '../../data/scenarios/ch3.json';
import ch4 from '../../data/scenarios/ch4.json';
import type { Scenario } from '../sim/scenario/types';

export const SCENARIOS: Scenario[] = [ch1, ch2, ch3, ch4] as unknown as Scenario[];

export function scenarioById(id: string): Scenario {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scenario ${id}`);
  return s;
}
