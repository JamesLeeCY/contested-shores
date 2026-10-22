// Headless AI-vs-AI battles (spec §8.5, §11 stage 6): runs a chapter N times and prints statistics.
//   npm run battle -- --chapter 2 --runs 20 --difficulty normal
import { loadGameData } from '../src/data/load';
import { loadMap } from '../src/data/map';
import { scenarioById } from '../src/data/scenarios';
import { aiTiming, enableAi } from '../src/sim/ai';
import { armyPop } from '../src/sim/ai/common';
import { step } from '../src/sim/loop';
import { applyScenario } from '../src/sim/scenario/setup';
import type { Difficulty } from '../src/sim/state';
import { World } from '../src/sim/world';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const chapter = Number(arg('chapter', '2'));
const runs = Number(arg('runs', '20'));
const difficulty = arg('difficulty', 'normal') as Difficulty;
const json = process.argv.includes('--json');
// Stage 6 acceptance stops at the milestone; otherwise play to the chapter's outcome.
const stopAtMilestone = process.argv.includes('--milestone');

const data = loadGameData();
const map = loadMap();
const sc = scenarioById(`ch${chapter}`);
aiTiming.enabled = true;
aiTiming.now = () => performance.now();

export interface RunResult {
  seed: number;
  seconds: number;
  milestone: number | null;
  zhengStart: number;
  zhengEnd: number;
  vocStart: number;
  vocEnd: number;
  zhengLossAtMilestone: number | null;
  outcome: string;
  winner?: string;
}

function runOne(seed: number): RunResult {
  const w = new World(data, map, { seed });
  applyScenario(w, sc);
  for (const [owner, spec] of Object.entries(sc.ai ?? {})) enableAi(w, owner, spec, difficulty);
  const Z = 'faction_zheng';
  const V = 'faction_voc';
  const zhengStart = armyPop(w, Z) + 0;
  const vocStart = armyPop(w, V);
  const limit = sc.timerMinutes * 60 * w.ticksPerSecond + 10;
  let milestone: number | null = null;
  let zhengLossAtMilestone: number | null = null;
  let outcome = 'timeout';
  for (let t = 0; t < limit; t++) {
    step(w);
    if (milestone === null) {
      const fort = chapter === 2 ? 'provintia_fort' : chapter === 4 ? 'utrecht_redoubt' : null;
      const b = fort ? w.buildings().find((x) => x.type === fort) : null;
      if (b && b.owner === Z) {
        milestone = w.tick / w.ticksPerSecond;
        zhengLossAtMilestone = 1 - armyPop(w, Z) / zhengStart;
        outcome = 'milestone';
      }
    }
    if (w.ext.flags.missionOver) {
      outcome = `Z:${w.ext.flags['outcome:faction_zheng']} V:${w.ext.flags['outcome:faction_voc']}`;
      break;
    }
    if (stopAtMilestone && milestone !== null) break;
  }
  return {
    seed,
    seconds: Math.round(w.tick / w.ticksPerSecond),
    milestone,
    zhengStart,
    zhengEnd: armyPop(w, Z),
    vocStart,
    vocEnd: armyPop(w, V),
    zhengLossAtMilestone,
    outcome,
  };
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

const results: RunResult[] = [];
const t0 = performance.now();
let warmSamples = 0;
for (let i = 1; i <= runs; i++) {
  // Decision timings from the first run include V8 warm-up; they are reported separately.
  if (i === 2) warmSamples = aiTiming.samples.length;
  const r = runOne(i);
  results.push(r);
  if (!json) console.log(`run ${String(i).padStart(2)}: ${r.outcome.padEnd(16)} t=${r.seconds}s milestone=${r.milestone ?? '-'} zheng ${r.zhengStart}→${r.zhengEnd} voc ${r.vocStart}→${r.vocEnd}${r.zhengLossAtMilestone !== null ? ` loss@milestone=${(r.zhengLossAtMilestone * 100).toFixed(0)}%` : ''}`);
}
const ms = results.map((r) => r.milestone ?? Infinity);
const summary = {
  chapter,
  runs,
  difficulty,
  milestoneRate: results.filter((r) => r.milestone !== null).length / runs,
  milestoneMedianSeconds: median(ms),
  zhengLossAtMilestoneMedian: median(results.filter((r) => r.zhengLossAtMilestone !== null).map((r) => r.zhengLossAtMilestone!)),
  avgSeconds: results.reduce((s, r) => s + r.seconds, 0) / runs,
  aiDecisionMsMaxWarm: aiTiming.samples.slice(warmSamples).reduce((m, x) => Math.max(m, x), 0),
  aiDecisionMsMaxIncludingWarmup: aiTiming.samples.reduce((m, x) => Math.max(m, x), 0),
  aiDecisionMsP99: aiTiming.samples.length ? [...aiTiming.samples].sort((a, b) => a - b)[Math.floor(aiTiming.samples.length * 0.99)] : 0,
  wallSeconds: (performance.now() - t0) / 1000,
  outcomes: results.reduce<Record<string, number>>((m, r) => ((m[r.outcome] = (m[r.outcome] ?? 0) + 1), m), {}),
  zhengWinRate: results.filter((r) => /Z:(victory|historical)/.test(r.outcome) && !/V:victory/.test(r.outcome)).length / runs,
};
console.log(json ? JSON.stringify({ summary, results }) : summary);
