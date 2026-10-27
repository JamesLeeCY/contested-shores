// Campaign progress (spec §7: favour, settlers, castle morale and ratings carry over), stored in
// localStorage, plus the six campaign endings (§7.6).
import type { Rating } from '../sim/scenario/triggers';
import type { CampaignState, Scenario } from '../sim/scenario/types';
import type { World } from '../sim/world';

// The 1661 campaign keeps its original storage key; others get their own.
const keyOf = (campaign: string) => (campaign === 'koxinga' ? 'tayouan1661.campaign' : `tayouan1661.campaign.${campaign}`);

export interface StoredCampaign extends CampaignState {
  player?: string;
  difficulty?: string;
  /** Reason keys of each chapter's outcome (for the ending). */
  reasons?: Record<string, Record<string, string>>;
}

export function loadCampaign(campaign = 'koxinga'): StoredCampaign {
  try {
    const raw = localStorage.getItem(keyOf(campaign));
    return raw ? (JSON.parse(raw) as StoredCampaign) : {};
  } catch {
    return {};
  }
}

export function saveCampaign(campaign: string, c: StoredCampaign) {
  try {
    localStorage.setItem(keyOf(campaign), JSON.stringify(c));
  } catch {
    // Storage unavailable (private mode): progress lasts for this page only.
  }
}

/** Folds a finished chapter into the campaign state. */
export function recordChapter(c: StoredCampaign, sc: Scenario, w: World): StoredCampaign {
  // A game played with cheats (src/sim/cheats.ts) records nothing.
  if (Object.keys(w.ext.flags).some((k) => k.startsWith('cheated:'))) return c;
  const chapterId = sc.id;
  const out: StoredCampaign = { ...c, ratings: { ...(c.ratings ?? {}) }, reasons: { ...(c.reasons ?? {}) } };
  const r: Record<string, Rating> = {};
  const why: Record<string, string> = {};
  for (const f of sc.factions ?? ['faction_zheng', 'faction_voc']) {
    const v = w.ext.flags[`outcome:${f}`] as Rating | undefined;
    if (v) r[f] = v;
    const k = w.ext.flags[`outcomeReason:${f}`];
    if (typeof k === 'string') why[f] = k;
  }
  out.ratings![chapterId] = r as Record<string, 'victory' | 'historical' | 'defeat'>;
  out.reasons![chapterId] = why;
  // Castle morale and village favour only exist in the 1661 campaign.
  const voc = w.faction('faction_voc');
  if (voc) out.castleMorale = voc.castleMorale;
  if (Object.keys(w.ext.parties).length) out.favor = Object.fromEntries(Object.entries(w.ext.parties).map(([id, p]) => [id, { ...p.favor }]));
  return out;
}

/** One of six endings from the four chapters' results (zheng perspective decides most). */
export function endingKey(c: StoredCampaign): string {
  const ratings = c.ratings ?? {};
  const z = (ch: string) => ratings[ch]?.faction_zheng;
  const v = (ch: string) => ratings[ch]?.faction_voc;
  const reasons = Object.values(c.reasons ?? {}).flatMap((r) => Object.values(r));
  if (reasons.includes('global.end.koxinga')) return 'ending.koxinga_falls';
  const zWins = ['ch1', 'ch2', 'ch3', 'ch4'].filter((ch) => z(ch) === 'victory').length;
  const vWins = ['ch1', 'ch2', 'ch3', 'ch4'].filter((ch) => v(ch) === 'victory').length;
  if (v('ch4') === 'victory') return v('ch3') === 'victory' ? 'ending.voc_relieved' : 'ending.voc_holds';
  if (zWins === 4) return 'ending.zheng_swift';
  if (vWins >= 2) return 'ending.zheng_costly';
  return 'ending.historical';
}

export const HISTORY_CARDS = ['history.ch1', 'history.ch2', 'history.ch3', 'history.ch4'];
