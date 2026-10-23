import { Application } from 'pixi.js';
import { loadGameData } from './data/load';
import { loadMap } from './data/map';
import type { Difficulty } from './sim/state';
import { GameApp } from './ui/app';
import { hashWorld } from './sim/hash';
import { step } from './sim/loop';
import { openCodex } from './ui/codex';
import { openSettings } from './ui/settings';
import { installAudio } from './ui/audio';
import { el } from './ui/dom';
import { t } from './ui/i18n';
import type { Session } from './ui/session';

async function main() {
  const data = loadGameData();
  const map = loadMap();
  const params = new URLSearchParams(location.search);

  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1418', antialias: true });
  document.getElementById('game')!.appendChild(app.canvas);

  installAudio();
  const game = new GameApp(app, document.getElementById('ui')!, document.getElementById('overlay')!, data, map);
  // Debug/e2e handles.
  const w = window as unknown as { __app: GameApp; __game: Session | null };
  w.__app = game;
  (window as unknown as { __hash: typeof hashWorld; __step: typeof step }).__hash = hashWorld;
  (window as unknown as { __step: typeof step }).__step = step;
  Object.defineProperty(window, '__game', { get: () => game.session });

  // Codex in the main menu and in the in-game menu (pauses the game while open).
  game.menuHooks.push((card, g) => {
    const b = el('button', 'menu-btn', card.querySelector('.menu-extra') as HTMLElement, t('codex.title'));
    b.onclick = () => openCodex(g.overlay);
  });
  game.menuHooks.push((card, g) => {
    const b = el('button', 'menu-btn', card.querySelector('.menu-extra') as HTMLElement, t('settings.title'));
    b.onclick = () => openSettings(g.overlay);
  });
  game.gameMenuHooks.push((bar, g) => {
    const b = el('button', 'gm-btn', bar, t('settings.title'));
    b.onclick = () => {
      const s = g.session;
      if (s) s.modal = true;
      openSettings(g.overlay, () => s && (s.modal = false));
    };
  });
  game.gameMenuHooks.push((bar, g) => {
    const b = el('button', 'gm-btn', bar, t('codex.title'));
    b.onclick = () => {
      const s = g.session;
      if (s) s.modal = true;
      openCodex(g.overlay, () => s && (s.modal = false));
    };
  });

  // ?faction=voc|paiwan|japan picks the side (default: the scenario's first side).
  const player = params.has('faction') ? `faction_${params.get('faction')}` : 'faction_zheng';
  const mode = params.get('mode');
  const chapter = Number(params.get('chapter') ?? 0);
  const scenario = params.get('scenario') ?? undefined;
  if (mode === 'tutorial') game.startTutorial();
  else if (mode === 'sandbox' || mode === 'economy') game.startSandbox(mode === 'economy' ? 'economy' : 'armies', player);
  else if ((chapter >= 1 && chapter <= 4) || scenario)
    void game.startChapter({
      scenario,
      chapter,
      player,
      difficulty: (params.get('difficulty') as Difficulty) ?? 'normal',
      seed: params.has('seed') ? Number(params.get('seed')) : undefined,
      skipCutscenes: params.has('skipCutscenes'),
      spectate: params.has('spectate'),
    });
  else game.showMenu();
}

main();
