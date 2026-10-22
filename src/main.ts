import { Application } from 'pixi.js';
import { loadGameData } from './data/load';
import { loadMap } from './data/map';
import type { Difficulty } from './sim/state';
import { GameApp } from './ui/app';
import type { Session } from './ui/session';

async function main() {
  const data = loadGameData();
  const map = loadMap();
  const params = new URLSearchParams(location.search);

  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1418', antialias: true });
  document.getElementById('game')!.appendChild(app.canvas);

  const game = new GameApp(app, document.getElementById('ui')!, document.getElementById('overlay')!, data, map);
  // Debug/e2e handles.
  const w = window as unknown as { __app: GameApp; __game: Session | null };
  w.__app = game;
  Object.defineProperty(window, '__game', { get: () => game.session });

  const player = params.get('faction') === 'voc' ? 'faction_voc' : 'faction_zheng';
  const mode = params.get('mode');
  const chapter = Number(params.get('chapter') ?? 0);
  if (mode === 'sandbox' || mode === 'economy') game.startSandbox(mode === 'economy' ? 'economy' : 'armies', player);
  else if (chapter >= 1 && chapter <= 4)
    void game.startChapter({
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
