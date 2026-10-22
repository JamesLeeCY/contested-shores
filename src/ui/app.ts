// Game flow: title menu → chapter / side / difficulty → chapter (cutscenes, objectives) → result
// screen → next chapter, carrying the campaign state; ending after chapter 4 (spec §7, §11 stage 7).
import type { Application } from 'pixi.js';
import { SCENARIOS } from '../data/scenarios';
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

  startSandbox(mode: SandboxMode, player: string) {
    this.clear();
    this.session = new Session(this.app, this.ui, {
      data: this.data,
      map: this.map,
      player,
      seed: 1661,
      sandbox: true,
      setup: (w) => setupSandbox(w, mode),
    });
    this.addBackButton();
  }

  private addBackButton() {
    const b = el('button', 'menu-back', this.ui, t('menu.back'));
    b.onclick = () => this.showMenu();
  }

  async startChapter(o: StartOptions) {
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
    }));
    const objectives = new ObjectivePanel(s);
    s.frameHooks.push(() => objectives.update());
    this.addBackButton();
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
