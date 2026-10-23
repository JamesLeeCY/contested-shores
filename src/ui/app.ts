// Game flow: title menu → chapter / side / difficulty → chapter (cutscenes, objectives) → result
// screen → next chapter, carrying the campaign state; ending after chapter 4 (spec §7, §11 stage 7).
import type { Application } from 'pixi.js';
import { SCENARIOS, scenarioById } from '../data/scenarios';
import type { World } from '../sim/world';
import { buildSave, downloadSave, loadSave, pickSaveFile, readStoredSave, storeSave, type SaveFile, type SaveMeta } from './save';
import { setupSandbox, type SandboxMode } from '../sim/sandbox';
import type { Rating } from '../sim/scenario/triggers';
import type { Difficulty } from '../sim/state';
import type { SimData } from '../sim/types';
import type { GameMap } from '../sim/map';
import { HISTORY_CARDS, endingKey, loadCampaign, recordChapter, saveCampaign, type StoredCampaign } from './campaign';
import { playCutscene } from './cutscene';
import { el } from './dom';
import { t } from './i18n';
import { ObjectivePanel } from './objectives';
import { runTutorial, setupTutorial } from './tutorial';

function tutorialDone() {
  try {
    return localStorage.getItem('tayouan1661.tutorialDone') === '1';
  } catch {
    return false;
  }
}
import { Session } from './session';

export interface StartOptions {
  chapter: number;
  player: string;
  difficulty: Difficulty;
  seed?: number;
  skipCutscenes?: boolean;
  spectate?: boolean;
}

const FACTIONS = ['faction_zheng', 'faction_voc'];
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];

export class GameApp {
  session: Session | null = null;
  private campaign: StoredCampaign = loadCampaign();
  private menu: HTMLDivElement | null = null;

  constructor(
    readonly app: Application,
    readonly ui: HTMLElement,
    readonly overlay: HTMLElement,
    readonly data: SimData,
    readonly map: GameMap,
  ) {}

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
    el('h1', 'menu-title', card, t('game.title'));
    el('div', 'menu-sub', card, t('menu.subtitle'));
    const tutRow = el('div', 'menu-row menu-tutorial', card);
    const tut = el('button', 'menu-btn' + (tutorialDone() ? '' : ' primary pulse'), tutRow, t('menu.tutorial'));
    tut.onclick = () => this.startTutorial();
    if (!tutorialDone()) el('span', 'menu-hint', tutRow, t('menu.tutorial_hint'));
    const chapters = el('div', 'menu-chapters', card);
    let player = this.campaign.player ?? 'faction_zheng';
    let diff: Difficulty = (this.campaign.difficulty as Difficulty) ?? 'normal';

    const sideRow = el('div', 'menu-row', card);
    el('span', 'menu-label', sideRow, t('menu.side'));
    const sideBtns = FACTIONS.map((f) => {
      const b = el('button', 'menu-toggle', sideRow, t(`faction.${f}.name`));
      b.onclick = () => {
        player = f;
        sideBtns.forEach((x, i) => x.classList.toggle('on', FACTIONS[i] === f));
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
      for (const sc of SCENARIOS) {
        const r = this.campaign.ratings?.[sc.id]?.[player] as Rating | undefined;
        const b = el('button', 'menu-chapter', chapters);
        el('div', 'mc-name', b, t(sc.nameKey));
        el('div', 'mc-date', b, t(sc.dateKey));
        el('div', `mc-rating rating-${r ?? 'none'}`, b, r ? t(`rating.${r}`) : '');
        b.onclick = () => {
          this.campaign = { ...this.campaign, player, difficulty: diff };
          saveCampaign(this.campaign);
          void this.startChapter({ chapter: sc.chapter, player, difficulty: diff });
        };
      }
    };
    drawChapters();

    const extra = el('div', 'menu-row menu-extra', card);
    const stored = readStoredSave();
    if (stored) {
      const load = el('button', 'menu-btn primary', extra, t('menu.load'));
      load.onclick = () => this.loadGame(stored);
    }
    const imp = el('button', 'menu-btn', extra, t('menu.import'));
    imp.onclick = async () => {
      const f = await pickSaveFile();
      if (f) this.loadGame(f);
    };
    const sandbox = el('button', 'menu-btn', extra, t('menu.sandbox'));
    sandbox.onclick = () => this.startSandbox('armies', player);
    const eco = el('button', 'menu-btn', extra, t('menu.sandbox_economy'));
    eco.onclick = () => this.startSandbox('economy', player);
    const reset = el('button', 'menu-btn', extra, t('menu.reset'));
    reset.onclick = () => {
      this.campaign = {};
      saveCampaign(this.campaign);
      drawChapters();
    };
    if (this.campaign.ratings?.ch4) {
      const end = el('button', 'menu-btn', extra, t('menu.ending'));
      end.onclick = () => this.showEnding();
    }
    for (const fn of this.menuHooks) fn(card, this);
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

  /** Restores a save and continues it. */
  loadGame(file: SaveFile) {
    let w: World;
    try {
      w = loadSave(file, this.data, this.map, scenarioById);
    } catch (e) {
      alert(`${t('msg.load_failed')}\n${String(e)}`);
      return;
    }
    const m = file.meta;
    if (m.kind === 'chapter') void this.startChapter({ chapter: m.chapter!, player: m.player, difficulty: m.difficulty as Difficulty, skipCutscenes: true }, w);
    else if (m.sandboxMode === 'tutorial') this.startTutorial();
    else this.startSandbox((m.sandboxMode as SandboxMode) ?? 'armies', m.player, w);
  }

  async startChapter(o: StartOptions, restored?: World) {
    this.clear();
    const sc = SCENARIOS.find((s) => s.chapter === o.chapter)!;
    const s = (this.session = new Session(this.app, this.ui, {
      data: this.data,
      map: this.map,
      player: o.player,
      seed: o.seed ?? 1661 + o.chapter,
      scenario: sc,
      campaign: this.campaign,
      difficulty: o.difficulty,
      spectate: o.spectate,
      restored,
    }));
    const objectives = new ObjectivePanel(s);
    s.frameHooks.push(() => objectives.update());
    this.addGameMenu({ kind: 'chapter', chapter: o.chapter, player: o.player, difficulty: o.difficulty });
    let ended = false;
    s.eventHooks.push((ss, ev) => {
      if (ev.type === 'cutscene' && !o.skipCutscenes) {
        ss.modal = true;
        void playCutscene(this.overlay, ev.id as string).then(() => (ss.modal = false));
      }
      if (ev.type === 'mission_outcome' && !ended && ss.world.ext.flags.missionOver) {
        ended = true;
        // Let the last events (cutscene) play first.
        setTimeout(() => this.showResult(o, ss), 600);
      }
    });
  }

  private showResult(o: StartOptions, s: Session) {
    s.modal = true;
    const sc = SCENARIOS.find((x) => x.chapter === o.chapter)!;
    this.campaign = recordChapter(this.campaign, sc.id, s.world);
    saveCampaign(this.campaign);
    const waitCutscene = () => (this.overlay.querySelector('.cutscene') ? setTimeout(waitCutscene, 300) : render());
    const render = () => {
      const box = el('div', 'result', this.overlay);
      const card = el('div', 'result-card', box);
      const mine = s.world.ext.flags[`outcome:${o.player}`] as Rating;
      el('div', `result-rating rating-${mine}`, card, t(`rating.${mine}`));
      el('h2', 'result-title', card, t(sc.nameKey));
      el('p', 'result-reason', card, t(String(s.world.ext.flags[`outcomeReason:${o.player}`] ?? '')));
      const table = el('div', 'result-table', card);
      for (const f of FACTIONS) {
        const row = el('div', 'result-row', table);
        el('span', '', row, t(`faction.${f}.name`));
        const r = s.world.ext.flags[`outcome:${f}`] as Rating;
        el('span', `rating-${r}`, row, t(`rating.${r}`));
      }
      el('p', 'result-history', card, t(HISTORY_CARDS[o.chapter - 1]));
      const bar = el('div', 'result-bar', card);
      if (o.chapter < 4) {
        const next = el('button', 'menu-btn primary', bar, t('menu.next_chapter'));
        next.onclick = () => void this.startChapter({ ...o, chapter: o.chapter + 1, seed: undefined });
      } else {
        const end = el('button', 'menu-btn primary', bar, t('menu.ending'));
        end.onclick = () => this.showEnding();
      }
      const again = el('button', 'menu-btn', bar, t('menu.retry'));
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
    const key = endingKey(this.campaign);
    el('h1', 'menu-title', card, t(`${key}.title`));
    el('p', 'ending-text', card, t(key));
    el('h3', '', card, t('ending.history_title'));
    for (const k of HISTORY_CARDS) el('p', 'history-card', card, t(k));
    const back = el('button', 'menu-btn', card, t('menu.back'));
    back.onclick = () => this.showMenu();
  }
}
