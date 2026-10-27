// Game flow: title menu → campaign / side / difficulty → scenario (cutscenes, objectives) → result
// screen → next scenario of the campaign, carrying the campaign state; the 1661 campaign ends with
// one of six endings (spec §7, §11 stage 7). Campaigns: 大員之圍 1661, 施琅攻臺 1683, 牡丹社事件 1874, 乙未戰爭 1895.
import type { Application } from 'pixi.js';
import { loadMap, preloadMap } from '../data/map';
import { CAMPAIGNS, SCENARIOS, campaignOf, scenarioById, scenariosOf } from '../data/scenarios';
import type { World } from '../sim/world';
import { buildSave, downloadSave, loadSave, pickSaveFile, sameBuild, readStoredSave, storeSave, type SaveFile, type SaveMeta } from './save';
import { setupSandbox, type SandboxMode } from '../sim/sandbox';
import type { Rating } from '../sim/scenario/triggers';
import type { Scenario } from '../sim/scenario/types';
import type { Difficulty } from '../sim/state';
import type { SimData } from '../sim/types';
import type { GameMap } from '../sim/map';
import { HISTORY_CARDS, endingKey, loadCampaign, recordChapter, saveCampaign, type StoredCampaign } from './campaign';
import { playCutscene } from './cutscene';
import { el } from './dom';
import { hasKey, t } from './i18n';
import { ObjectivePanel } from './objectives';
import { runTutorial, setupTutorial } from './tutorial';
import { Session } from './session';

function tutorialDone() {
  try {
    return localStorage.getItem('tayouan1661.tutorialDone') === '1';
  } catch {
    return false;
  }
}

const MENU_CAMPAIGN_KEY = 'tayouan1661.menuCampaign';
function storedMenuCampaign(): string {
  try {
    const id = localStorage.getItem(MENU_CAMPAIGN_KEY);
    return CAMPAIGNS.some((c) => c.id === id) ? id! : CAMPAIGNS[0].id;
  } catch {
    return CAMPAIGNS[0].id;
  }
}

export interface StartOptions {
  /** Scenario id (e.g. `ch2`, `mudan1`); `chapter` alone means a 1661 chapter. */
  scenario?: string;
  chapter?: number;
  player: string;
  difficulty: Difficulty;
  seed?: number;
  skipCutscenes?: boolean;
  spectate?: boolean;
}

const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const DEFAULT_FACTIONS = ['faction_zheng', 'faction_voc'];

export function resolveScenario(o: Pick<StartOptions, 'scenario' | 'chapter'>): Scenario {
  if (o.scenario) return scenarioById(o.scenario);
  return SCENARIOS.find((s) => campaignOf(s) === 'koxinga' && s.chapter === o.chapter) ?? SCENARIOS[0];
}

const factionsOf = (sc: Scenario) => sc.factions ?? DEFAULT_FACTIONS;

export class GameApp {
  session: Session | null = null;
  private campaigns = new Map<string, StoredCampaign>();
  private menu: HTMLDivElement | null = null;
  private menuCampaign = storedMenuCampaign();

  constructor(
    readonly app: Application,
    readonly ui: HTMLElement,
    readonly overlay: HTMLElement,
    readonly data: SimData,
    readonly map: GameMap,
  ) {}

  private campaign(id: string): StoredCampaign {
    let c = this.campaigns.get(id);
    if (!c) this.campaigns.set(id, (c = loadCampaign(id)));
    return c;
  }
  private setCampaign(id: string, c: StoredCampaign) {
    this.campaigns.set(id, c);
    saveCampaign(id, c);
  }

  private clear() {
    this.session?.destroy();
    this.session = null;
    this.menu?.remove();
    this.menu = null;
    this.overlay.replaceChildren();
  }

  showMenu() {
    this.clear();
    const m = (this.menu = el('div', 'menu', this.overlay));
    const card = el('div', 'menu-card', m);
    const cid = this.menuCampaign;
    const camp = CAMPAIGNS.find((c) => c.id === cid)!;
    const stored = this.campaign(cid);

    el('div', 'menu-game', card, t('game.title'));
    const tabs = el('div', 'menu-tabs', card);
    for (const c of CAMPAIGNS) {
      const b = el('button', 'menu-tab' + (c.id === cid ? ' on' : ''), tabs, t(`campaign.${c.id}.name`));
      b.onclick = () => {
        this.menuCampaign = c.id;
        try {
          localStorage.setItem(MENU_CAMPAIGN_KEY, c.id);
        } catch {
          // remembered for this page only
        }
        this.showMenu();
      };
    }
    el('h1', 'menu-title', card, t(`campaign.${cid}.name`));
    el('div', 'menu-sub', card, t(`campaign.${cid}.sub`));
    const tutRow = el('div', 'menu-row menu-tutorial', card);
    const tut = el('button', 'menu-btn' + (tutorialDone() ? '' : ' primary pulse'), tutRow, t('menu.tutorial'));
    tut.onclick = () => this.startTutorial();
    if (!tutorialDone()) el('span', 'menu-hint', tutRow, t('menu.tutorial_hint'));
    const chapters = el('div', 'menu-chapters', card);
    const sides: readonly string[] = camp.factions;
    let player = stored.player && sides.includes(stored.player) ? stored.player : sides[0];
    let diff: Difficulty = (stored.difficulty as Difficulty) ?? 'normal';

    const sideRow = el('div', 'menu-row', card);
    el('span', 'menu-label', sideRow, t('menu.side'));
    const sideBtns = sides.map((f) => {
      const b = el('button', 'menu-toggle', sideRow, t(`faction.${f}.name`));
      b.onclick = () => {
        player = f;
        sideBtns.forEach((x, i) => x.classList.toggle('on', sides[i] === f));
        drawChapters();
      };
      b.classList.toggle('on', f === player);
      return b;
    });
    const diffRow = el('div', 'menu-row', card);
    el('span', 'menu-label', diffRow, t('menu.difficulty'));
    const diffBtns = DIFFS.map((d) => {
      const b = el('button', 'menu-toggle', diffRow, t(`difficulty.${d}`));
      b.onclick = () => {
        diff = d;
        diffBtns.forEach((x, i) => x.classList.toggle('on', DIFFS[i] === d));
      };
      b.classList.toggle('on', d === diff);
      return b;
    });

    const drawChapters = () => {
      chapters.replaceChildren();
      for (const sc of scenariosOf(cid)) {
        const r = this.campaign(cid).ratings?.[sc.id]?.[sc.sideOf?.[player] ?? player] as Rating | undefined;
        const b = el('button', 'menu-chapter', chapters);
        el('div', 'mc-name', b, t(sc.nameKey));
        el('div', 'mc-date', b, t(sc.dateKey));
        el('div', `mc-rating rating-${r ?? 'none'}`, b, r ? t(`rating.${r}`) : '');
        b.onclick = () => {
          this.setCampaign(cid, { ...this.campaign(cid), player, difficulty: diff });
          void this.startChapter({ scenario: sc.id, player, difficulty: diff });
        };
      }
    };
    drawChapters();

    const extra = el('div', 'menu-row menu-extra', card);
    const save = readStoredSave();
    if (save) {
      const load = el('button', 'menu-btn primary', extra, t('menu.load'));
      load.onclick = () => void this.loadGame(save);
    }
    const imp = el('button', 'menu-btn', extra, t('menu.import'));
    imp.onclick = async () => {
      const f = await pickSaveFile();
      if (f) await this.loadGame(f);
    };
    // The sandboxes use the 1661 map and armies.
    if (cid === 'koxinga') {
      const sandbox = el('button', 'menu-btn', extra, t('menu.sandbox'));
      sandbox.onclick = () => this.startSandbox('armies', player);
      const eco = el('button', 'menu-btn', extra, t('menu.sandbox_economy'));
      eco.onclick = () => this.startSandbox('economy', player);
    }
    const tl = el('button', 'menu-btn', extra, t('menu.timeline'));
    tl.onclick = () => this.showTimeline();
    const reset = el('button', 'menu-btn', extra, t('menu.reset'));
    reset.onclick = () => {
      this.setCampaign(cid, {});
      drawChapters();
    };
    if (cid === 'koxinga' && stored.ratings?.ch4) {
      const end = el('button', 'menu-btn', extra, t('menu.ending'));
      end.onclick = () => this.showEnding();
    }
    for (const fn of this.menuHooks) fn(card, this);
  }

  /**
   * Every chapter of every campaign on one line through the years, with the best result won there
   * (either side); picking one opens its campaign's tab, where the side is chosen.
   */
  showTimeline() {
    this.clear();
    const m = (this.menu = el('div', 'menu', this.overlay));
    const card = el('div', 'menu-card timeline', m);
    el('h2', 'menu-title', card, t('timeline.title'));
    el('div', 'menu-sub', card, t('timeline.sub'));
    const line = el('div', 'tl-line', card);
    const rank: Record<string, number> = { victory: 3, historical: 2, defeat: 1 };
    for (const c of CAMPAIGNS) {
      el('div', 'tl-campaign', line, t(`campaign.${c.id}.name`));
      for (const sc of scenariosOf(c.id)) {
        const got = Object.values(this.campaign(c.id).ratings?.[sc.id] ?? {}) as Rating[];
        const best = got.sort((x, y) => (rank[y] ?? 0) - (rank[x] ?? 0))[0];
        const row = el('button', 'tl-item', line);
        el('span', 'tl-dot' + (best ? ` rating-${best}` : ''), row);
        el('span', 'tl-date', row, t(sc.dateKey));
        el('span', 'tl-name', row, t(sc.nameKey));
        if (best) el('span', `tl-rating rating-${best}`, row, t(`rating.${best}`));
        row.onclick = () => {
          this.menuCampaign = c.id;
          try {
            localStorage.setItem(MENU_CAMPAIGN_KEY, c.id);
          } catch {
            // remembered for this page only
          }
          this.showMenu();
        };
      }
    }
    const back = el('button', 'menu-btn primary', card, t('menu.back_menu'));
    back.onclick = () => this.showMenu();
  }

  /** Extra menu entries (codex, settings, load) added by later modules. */
  readonly menuHooks: ((card: HTMLElement, app: GameApp) => void)[] = [];

  /** New-player tutorial (guided session on the real map). */
  startTutorial() {
    this.clear();
    const s = (this.session = new Session(this.app, this.ui, {
      data: this.data,
      map: this.map,
      player: 'faction_zheng',
      seed: 1661,
      setup: setupTutorial,
    }));
    s.camera.centerOn(121, 42);
    this.addGameMenu({ kind: 'sandbox', sandboxMode: 'tutorial', player: 'faction_zheng', difficulty: 'normal' });
    runTutorial(s, () => {
      try {
        localStorage.setItem('tayouan1661.tutorialDone', '1');
      } catch {
        // fine: the menu just keeps suggesting the tutorial
      }
      this.showMenu();
    });
  }

  startSandbox(mode: SandboxMode, player: string, restored?: World) {
    this.clear();
    this.session = new Session(this.app, this.ui, {
      data: this.data,
      map: this.map,
      player,
      seed: 1661,
      sandbox: true,
      setup: (w) => setupSandbox(w, mode),
      restored,
    });
    this.addGameMenu({ kind: 'sandbox', sandboxMode: mode, player, difficulty: 'normal' });
  }

  /** In-game menu: save, export, settings, main menu. */
  private addGameMenu(meta: Omit<SaveMeta, 'savedAt'>) {
    const bar = el('div', 'game-menu', this.ui);
    const save = el('button', 'gm-btn', bar, t('menu.save'));
    save.onclick = () => {
      const s = this.session;
      if (!s) return;
      const file = buildSave(s.world, s.snapshots, meta);
      if (storeSave(file)) s.messages.push(t('msg.saved'), 'good');
      else {
        s.messages.push(t('msg.save_failed'), 'warn');
        downloadSave(file);
      }
    };
    const exp = el('button', 'gm-btn', bar, t('menu.export'));
    exp.onclick = () => this.session && downloadSave(buildSave(this.session.world, this.session.snapshots, meta));
    for (const fn of this.gameMenuHooks) fn(bar, this);
    const back = el('button', 'gm-btn', bar, t('menu.back'));
    back.onclick = () => this.showMenu();
  }

  readonly gameMenuHooks: ((bar: HTMLElement, app: GameApp) => void)[] = [];

  /** Restores a save and continues it; a save from another game version asks how first. */
  async loadGame(file: SaveFile, replay?: boolean) {
    if (replay === undefined && !sameBuild(file)) return this.askHowToLoad(file);
    let w: World;
    try {
      await preloadMap(file.map ?? 'taijiang');
      w = loadSave(file, this.data, loadMap, scenarioById, replay ?? true);
    } catch (e) {
      alert(`${t('msg.load_failed')}\n${String(e)}`);
      return;
    }
    const m = file.meta;
    if (m.kind === 'chapter')
      void this.startChapter({ scenario: m.scenario, chapter: m.chapter, player: m.player, difficulty: m.difficulty as Difficulty, skipCutscenes: true }, w);
    else if (m.sandboxMode === 'tutorial') this.startTutorial();
    else this.startSandbox((m.sandboxMode as SandboxMode) ?? 'armies', m.player, w);
  }

  /** The game changed since this save: replay as saved (may drift) or resume from its snapshot. */
  private askHowToLoad(file: SaveFile) {
    // Above the main menu (both live in the overlay layer).
    const m = el('div', 'menu', this.overlay);
    const card = el('div', 'menu-card save-mismatch', m);
    el('h2', 'menu-title', card, t('save.mismatch.title'));
    el('p', 'menu-sub', card, t('save.mismatch.text'));
    const row = el('div', 'menu-extra', card);
    const go = (replay: boolean) => {
      m.remove();
      void this.loadGame(file, replay);
    };
    el('button', 'menu-btn primary', row, t('save.mismatch.snapshot')).onclick = () => go(false);
    el('button', 'menu-btn', row, t('save.mismatch.replay')).onclick = () => go(true);
    el('button', 'menu-btn', row, t('save.mismatch.cancel')).onclick = () => m.remove();
  }

  async startChapter(o: StartOptions, restored?: World) {
    this.clear();
    const sc = resolveScenario(o);
    const cid = campaignOf(sc);
    // Campaign sides map onto the scenario's factions; some scenarios allow only one side.
    const mapped = sc.sideOf?.[o.player] ?? o.player;
    const allowed = sc.playable ?? factionsOf(sc);
    const player = allowed.includes(mapped) ? mapped : allowed[0];
    const opts: StartOptions = { ...o, scenario: sc.id, chapter: sc.chapter, player };
    await preloadMap(sc.map ?? 'taijiang');
    const s = (this.session = new Session(this.app, this.ui, {
      data: this.data,
      map: loadMap(sc.map ?? 'taijiang'),
      player,
      seed: o.seed ?? (cid === 'koxinga' ? 1661 : 1874) + sc.chapter,
      scenario: sc,
      campaign: this.campaign(cid),
      difficulty: o.difficulty,
      spectate: o.spectate,
      restored,
    }));
    const objectives = new ObjectivePanel(s);
    s.frameHooks.push(() => objectives.update());
    this.addGameMenu({ kind: 'chapter', scenario: sc.id, chapter: sc.chapter, player, difficulty: o.difficulty });
    let ended = false;
    s.eventHooks.push((ss, ev) => {
      if (ev.type === 'cutscene' && !o.skipCutscenes) {
        ss.modal = true;
        void playCutscene(this.overlay, ev.id as string).then(() => (ss.modal = false));
      }
      if (ev.type === 'mission_outcome' && !ended && ss.world.ext.flags.missionOver) {
        ended = true;
        // Let the last events (cutscene) play first.
        setTimeout(() => this.showResult(opts, sc, ss), 600);
      }
    });
  }

  private showResult(o: StartOptions, sc: Scenario, s: Session) {
    s.modal = true;
    const cid = campaignOf(sc);
    this.setCampaign(cid, recordChapter(this.campaign(cid), sc, s.world));
    const waitCutscene = () => (this.overlay.querySelector('.cutscene') ? setTimeout(waitCutscene, 300) : render());
    const render = () => {
      const box = el('div', 'result', this.overlay);
      const card = el('div', 'result-card', box);
      const mine = s.world.ext.flags[`outcome:${o.player}`] as Rating;
      el('div', `result-rating rating-${mine}`, card, t(`rating.${mine}`));
      if (Object.keys(s.world.ext.flags).some((k) => k.startsWith('cheated:'))) el('p', 'result-cheat', card, t('cheat.result'));
      el('h2', 'result-title', card, t(sc.nameKey));
      el('p', 'result-reason', card, t(String(s.world.ext.flags[`outcomeReason:${o.player}`] ?? '')));
      const table = el('div', 'result-table', card);
      for (const f of factionsOf(sc)) {
        const row = el('div', 'result-row', table);
        el('span', '', row, t(`faction.${f}.name`));
        const r = s.world.ext.flags[`outcome:${f}`] as Rating;
        el('span', `rating-${r}`, row, t(`rating.${r}`));
        // Units lost in this battle (every `lost:<side>:<type>` counter).
        const lost = Object.entries(s.world.ext.flags)
          .filter(([k]) => k.startsWith(`lost:${f}:`))
          .reduce((n, [, v]) => n + Number(v), 0);
        el('span', 'result-lost', row, t('result.lost', { n: lost }));
      }
      const secs = Math.floor(s.world.tick / s.world.ticksPerSecond);
      el('p', 'result-time', card, t('result.time', { m: Math.floor(secs / 60), s: String(secs % 60).padStart(2, '0') }));
      // The real losses, where the sources give them (the game's armies are scaled down).
      if (hasKey(`history.${sc.id}.losses`)) el('p', 'result-real', card, t(`history.${sc.id}.losses`));
      el('p', 'result-history', card, t(sc.historyKey ?? HISTORY_CARDS[sc.chapter - 1]));
      const bar = el('div', 'result-bar', card);
      const list = scenariosOf(cid);
      const next = list[list.findIndex((x) => x.id === sc.id) + 1];
      if (next) {
        const b = el('button', 'menu-btn primary', bar, t('menu.next_chapter'));
        b.onclick = () => void this.startChapter({ ...o, scenario: next.id, chapter: next.chapter, seed: undefined });
      } else if (cid === 'koxinga') {
        const end = el('button', 'menu-btn primary', bar, t('menu.ending'));
        end.onclick = () => this.showEnding();
      }
      const again = el('button', 'menu-btn' + (next || cid === 'koxinga' ? '' : ' primary'), bar, t('menu.retry'));
      again.onclick = () => void this.startChapter(o);
      const menu = el('button', 'menu-btn', bar, t('menu.back'));
      menu.onclick = () => this.showMenu();
    };
    waitCutscene();
  }

  showEnding() {
    this.clear();
    const m = (this.menu = el('div', 'menu', this.overlay));
    const card = el('div', 'menu-card ending', m);
    const key = endingKey(this.campaign('koxinga'));
    el('h1', 'menu-title', card, t(`${key}.title`));
    el('p', 'ending-text', card, t(key));
    el('h3', '', card, t('ending.history_title'));
    for (const k of HISTORY_CARDS) el('p', 'history-card', card, t(k));
    const back = el('button', 'menu-btn', card, t('menu.back'));
    back.onclick = () => this.showMenu();
  }
}
