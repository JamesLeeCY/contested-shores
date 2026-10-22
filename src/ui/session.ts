// A running game in the browser: owns the World, the fixed-step clock, rendering and input.
import { Application, Container } from 'pixi.js';
import type { Command } from '../sim/commands';
import { FixedStepper, step } from '../sim/loop';
import type { GameMap } from '../sim/map';
import type { SimData, SimEvent } from '../sim/types';
import { World } from '../sim/world';
import { Camera } from '../render/camera';
import { colorOf, cssHex, ownerColors } from '../render/colors';
import { EntityRenderer } from '../render/entities';
import { buildTerrain } from '../render/terrain';
import { CameraInput } from './camera-input';
import { Controls, SPEEDS, type ControlHost } from './controls';
import { ClockHud } from './hud';
import { Minimap } from './minimap';

export interface SessionOptions {
  data: SimData;
  map: GameMap;
  player: string;
  seed: number;
  setup?: (world: World) => void;
}

export class Session implements ControlHost {
  readonly world: World;
  readonly camera: Camera;
  readonly stepper: FixedStepper;
  readonly selected = new Set<number>();
  readonly player: string;
  readonly worldLayer = new Container();
  readonly overlayLayer = new Container();
  readonly entities: EntityRenderer;
  readonly controls: Controls;
  readonly clocks: ClockHud;
  readonly minimap: Minimap;
  readonly cameraInput: CameraInput;
  /** Hooks for later stages (HUD panels, fog, effects) called every frame. */
  readonly frameHooks: ((s: Session, dt: number) => void)[] = [];
  readonly eventHooks: ((s: Session, ev: SimEvent) => void)[] = [];
  pendingClick: ControlHost['pendingClick'] = null;
  contextOrder?: ControlHost['contextOrder'];
  onSelectionChange?: () => void;
  timerSeconds: number | null = null;
  private speedIdx = 1;
  private fpsEl: HTMLDivElement;
  private fps = { acc: 0, frames: 0, value: 0 };
  /** Time spent in sim steps during the last frame (ms), for the perf readout. */
  simMs = 0;

  constructor(
    readonly app: Application,
    readonly ui: HTMLElement,
    readonly opts: SessionOptions,
  ) {
    const { data, map } = opts;
    this.player = opts.player;
    this.world = new World(data, map, { seed: opts.seed });
    opts.setup?.(this.world);
    this.stepper = new FixedStepper(1000 / this.world.rules.sim.tickHz);

    const colors = Object.fromEntries(Object.entries(this.world.rules.terrain.types).map(([k, v]) => [k, v.color]));
    app.stage.addChild(this.worldLayer);
    this.worldLayer.addChild(buildTerrain(map, colors));
    this.entities = new EntityRenderer(data);
    this.worldLayer.addChild(this.entities.layer);
    this.worldLayer.addChild(this.overlayLayer);

    this.camera = new Camera(map.width, map.height);
    const own = [...this.world.all()].find((e) => e.owner === this.player && e.kind === 'unit');
    if (own) this.camera.centerOn(own.x, own.y);
    this.cameraInput = new CameraInput(this.camera, app.canvas);
    this.controls = new Controls(this, app.canvas, ui);
    this.clocks = new ClockHud(ui, this.world);
    this.minimap = new Minimap(map, colors, this.camera);
    ui.appendChild(this.minimap.el);
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'fps';
    ui.appendChild(this.fpsEl);

    const ownerCols = ownerColors(data);
    const dotColor = new Map<string, string>();
    const colorFor = (o: string) => {
      let c = dotColor.get(o);
      if (!c) dotColor.set(o, (c = cssHex(colorOf(ownerCols, o)[0])));
      return c;
    };

    app.ticker.add((tk) => {
      const dt = Math.min(0.1, tk.deltaMS / 1000);
      const n = this.stepper.advance(tk.deltaMS);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        step(this.world);
        for (const ev of this.world.events) for (const h of this.eventHooks) h(this, ev);
      }
      this.simMs = performance.now() - t0;
      this.camera.resize(app.screen.width, app.screen.height);
      this.cameraInput.update(dt);
      this.camera.apply(this.worldLayer);
      // Drop selections of dead entities.
      for (const id of this.selected) if (!this.world.get(id)) this.selected.delete(id);
      this.entities.sync(this.world, this.stepper.paused ? 1 : this.stepper.alpha, this.selected);
      this.clocks.update(this.world, this.stepper.speed, this.stepper.paused, this.timerSeconds);
      for (const h of this.frameHooks) h(this, dt);
      this.minimap.draw(
        [...this.world.all()]
          .filter((e) => e.kind !== 'resource' && !e.insideOf && !this.entities.hidden(e))
          .map((e) => ({ x: e.x, y: e.y, color: colorFor(e.owner), size: e.kind === 'building' ? 4 : 2 })),
        this.fogForMinimap?.(),
      );
      this.fps.acc += tk.deltaMS / 1000;
      this.fps.frames++;
      if (this.fps.acc >= 0.5) {
        this.fps.value = Math.round(this.fps.frames / this.fps.acc);
        this.fpsEl.textContent = `${this.fps.value} FPS · ${[...this.world.all()].filter((e) => e.kind === 'unit').length} units`;
        this.fps.acc = this.fps.frames = 0;
      }
    });
  }

  fogForMinimap?: () => Uint8Array | undefined;

  get fpsValue() {
    return this.fps.value;
  }

  issue(cmd: Command) {
    this.world.enqueue(cmd);
  }

  togglePause() {
    this.stepper.paused = !this.stepper.paused;
  }

  changeSpeed(dir: 1 | -1) {
    this.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, this.speedIdx + dir));
    this.stepper.speed = SPEEDS[this.speedIdx];
  }
}
