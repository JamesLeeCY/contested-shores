import { Application, Container, Graphics, Text } from 'pixi.js';
import { loadGameData } from './data/load';
import { loadMap } from './data/map';
import { Camera } from './render/camera';
import { TILE_H, TILE_W, toScreen } from './render/iso';
import { buildTerrain } from './render/terrain';
import { CameraInput } from './ui/camera-input';
import { Minimap } from './ui/minimap';

async function main() {
  const data = loadGameData();
  const map = loadMap();
  const colors = Object.fromEntries(
    Object.entries((data.rules as unknown as { terrain: { types: Record<string, { color: string }> } }).terrain.types).map(
      ([k, v]) => [k, v.color],
    ),
  );

  const app = new Application();
  await app.init({ resizeTo: window, background: '#0d1418', antialias: false });
  document.getElementById('game')!.appendChild(app.canvas);

  const world = new Container();
  app.stage.addChild(world);
  world.addChild(buildTerrain(map, colors));

  // Static placeholder for preset map objects (replaced by entity rendering in stage 2).
  const objects = new Graphics();
  for (const o of map.objects) {
    const p = [toScreen(o.x, o.y), toScreen(o.x + o.w, o.y), toScreen(o.x + o.w, o.y + o.h), toScreen(o.x, o.y + o.h)];
    objects.poly(p.flatMap((q) => [q.x, q.y])).fill(o.type === 'deer_herd' ? 0x8b5a2b : 0x5a4632).stroke({ color: 0x2a1f14, width: 1 });
  }
  world.addChild(objects);
  for (const o of map.objects.filter((o) => o.w >= 3)) {
    const c = toScreen(o.x + o.w / 2, o.y + o.h / 2);
    const label = new Text({ text: o.name || o.type, style: { fontSize: 11, fill: 0xffffff } });
    label.anchor.set(0.5);
    label.position.set(c.x, c.y - TILE_H / 2);
    world.addChild(label);
  }
  void TILE_W;

  const camera = new Camera(map.width, map.height);
  camera.centerOn(44, 57);
  const input = new CameraInput(camera, app.canvas);
  const ui = document.getElementById('ui')!;
  const minimap = new Minimap(map, colors, camera);
  ui.appendChild(minimap.el);
  const fps = document.createElement('div');
  fps.className = 'fps';
  ui.appendChild(fps);

  let fpsAcc = 0;
  let fpsFrames = 0;
  app.ticker.add((tk) => {
    const dt = tk.deltaMS / 1000;
    camera.resize(app.screen.width, app.screen.height);
    input.update(dt);
    camera.apply(world);
    minimap.draw([]);
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps.textContent = `${Math.round(fpsFrames / fpsAcc)} FPS`;
      fpsAcc = fpsFrames = 0;
    }
  });
}

main();
