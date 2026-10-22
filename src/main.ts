import { Application } from 'pixi.js';
import { loadGameData } from './data/load';
import { loadMap } from './data/map';
import { setupSandbox } from './sim/sandbox';
import { Session } from './ui/session';

async function main() {
  const data = loadGameData();
  const map = loadMap();
  const params = new URLSearchParams(location.search);
  const player = params.get('faction') === 'voc' ? 'faction_voc' : 'faction_zheng';

  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1418', antialias: true });
  document.getElementById('game')!.appendChild(app.canvas);

  const session = new Session(app, document.getElementById('ui')!, {
    data,
    map,
    player,
    seed: Number(params.get('seed') ?? 1661),
    setup: setupSandbox,
  });
  // Debug/e2e handle.
  (window as unknown as { __game: Session }).__game = session;
}

main();
