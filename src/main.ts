import { Application } from 'pixi.js';
import { loadGameData } from './data/load';

async function main() {
  const data = loadGameData();
  const app = new Application();
  await app.init({ resizeTo: window, background: '#1d2a2e', antialias: false });
  document.getElementById('game')!.appendChild(app.canvas);
  console.info(`data loaded: ${data.units.size} units, ${data.buildings.size} buildings`);
}

main();
