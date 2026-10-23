// A running game in the browser: owns the World, the fixed-step clock, rendering and input.
import { Application, Container, Graphics } from 'pixi.js';
import { toScreen } from '../render/iso';
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
import { CommandPanel, economyContextOrder } from './commands';
import { CoverageOverlay, combatContextOrder } from './combat-ui';
import { Effects } from '../render/effects';
import { FogRenderer } from '../render/fog';
import { fogOf, isVisibleTo } from '../sim/systems/fog';
import { Messages, ResourceBar, SelectionPanel, eventMessage } from './panels';
import { Placement } from './placement';
import { installCampaignUi } from './campaign-ui';
import { Controls, SPEEDS, type ControlHost } from './controls';
import { installTouchpadHint } from './touchpad-hint';
import { ClockHud } from './hud';
import { Minimap } from './minimap';
import { life } from './lifecycle';
import { SnapshotKeeper } from './save';
import { onSettings, settings } from './settings';
import { audio } from './audio';
import type { CampaignState, Scenario } from '../sim/scenario/types';
import type { Difficulty } from '../sim/state';
import { applyScenario } from '../sim/scenario/setup';
import { enableAi } from '../sim/ai';
import { timerSecondsLeft } from '../sim/scenario/runtime';

export interface SessionOptions {
  data: SimData;
  map: GameMap;
  player: string;
  seed: number;
  sandbox?: boolean;
  setup?: (world: World) => void;
  scenario?: Scenario;
  campaign?: CampaignState;
  difficulty?: Difficulty;
  /** Play both sides by AI (spectator / tests). */
  spectate?: boolean;
  /** Continue a world restored from a save instead of building a new one. */
  restored?: World;
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
  readonly resourceBar: ResourceBar;
  readonly messages: Messages;
  readonly selectionPanel: SelectionPanel;
  readonly commandPanel: CommandPanel;
  readonly placement: Placement;
  readonly effects = new Effects();
  readonly fogRenderer: FogRenderer;
  readonly coverage: CoverageOverlay;
  private fogTick = -1;
  /** Hooks for later stages (HUD panels, fog, effects) called every frame. */
  readonly frameHooks: ((s: Session, dt: number) => void)[] = [];
  readonly eventHooks: ((s: Session, ev: SimEvent) => void)[] = [];
  pendingClick: ControlHost['pendingClick'] = null;
  contextOrder?: ControlHost['contextOrder'];
  onSelectionChange?: () => void;
  timerSeconds: number | null = null;
  /** Tutorial: shows (or clears, with null) a flag at a map point. */
  tutorialMarker(p: [number, number] | null) {
    this.marker?.destroy();
    this.marker = null;
    if (!p) return;
    const g = new Graphics();
    const s = toScreen(p[0], p[1]);
    g.ellipse(0, 0, 22, 11).stroke({ color: 0xffd700, width: 3 });
    g.moveTo(0, 0).lineTo(0, -40).stroke({ color: 0x3b2a1a, width: 2 });
    g.poly([0, -40, 18, -34, 0, -28]).fill(0xffd700);
    g.position.set(s.x, s.y);
    this.overlayLayer.addChild(g);
    this.marker = g;
  }
  private marker: Graphics | null = null;

  /** Seconds until the scenario's relief fleet (VOC HUD), set by the scenario layer. */
  reliefSeconds?: () => number | null;
  private speedIdx = 1;
  private fpsEl: HTMLDivElement;
  private fps = { acc: 0, frames: 0, value: 0 };
  /** Time spent in sim steps during the last frame (ms), for the perf readout. */
  simMs = 0;
  /** Set while a modal (cutscene, end screen) is open: the simulation does not advance. */
  modal = false;
  private readonly abort = new AbortController();
  readonly snapshots: SnapshotKeeper;
  private tickFn?: (tk: { deltaMS: number }) => void;

  constructor(
    readonly app: Application,
    readonly ui: HTMLElement,
    readonly opts: SessionOptions,
  ) {
    life.signal = this.abort.signal;
    const { data, map } = opts;
    this.player = opts.player;
    this.world = opts.restored ?? new World(data, map, { seed: opts.seed, sandbox: opts.sandbox, player: opts.player, factions: opts.scenario?.factions });
    if (!opts.restored) opts.setup?.(this.world);
    if (opts.scenario && !opts.restored) {
      const w = this.world;
      applyScenario(w, opts.scenario, opts.campaign);
      w.ext.flags.player = opts.spectate ? '' : this.player;
      const diff = opts.difficulty ?? 'normal';
      (w.rules.disease.playerMul as Record<string, number>)[this.player] = w.rules.difficulty[diff].playerDiseaseMul;
      for (const [owner, spec] of Object.entries(opts.scenario.ai ?? {}))
        if (opts.spectate || owner !== this.player) enableAi(w, owner, spec, diff);
      const relief = opts.scenario.relief;
      if (relief) this.reliefSeconds = () => (w.ext.flags.relief_spawned_ui || w.tick / w.ticksPerSecond >= relief.atSeconds ? null : relief.atSeconds - w.tick / w.ticksPerSecond);
    }
    this.stepper = new FixedStepper(1000 / this.world.rules.sim.tickHz);
    this.snapshots = new SnapshotKeeper(this.world);
    // A loaded game starts paused so the player can get their bearings.
    if (opts.restored) this.stepper.paused = true;

    const colors = Object.fromEntries(Object.entries(this.world.rules.terrain.types).map(([k, v]) => [k, v.color]));
    app.stage.addChild(this.worldLayer);
    this.worldLayer.addChild(buildTerrain(map, colors));
    this.entities = new EntityRenderer(data);
    this.worldLayer.addChild(this.entities.layer);
    this.worldLayer.addChild(this.effects.layer);
    this.fogRenderer = new FogRenderer(map.width, map.height);
    this.worldLayer.addChild(this.fogRenderer.sprite);
    this.worldLayer.addChild(this.overlayLayer);
    this.entities.hidden = (e) => !isVisibleTo(this.world, this.player, e);
    this.effects.visibleAt = (x, y) => {
      const f = fogOf(this.world, this.player);
      return !f || !!f.visible[Math.floor(y) * map.width + Math.floor(x)];
    };
    this.fogForMinimap = () => fogOf(this.world, this.player);

    this.camera = new Camera(map.width, map.height);
    const own = [...this.world.all()].find((e) => e.owner === this.player && e.kind === 'unit');
    if (own) this.camera.centerOn(own.x, own.y);
    this.cameraInput = new CameraInput(this.camera, app.canvas);
    this.controls = new Controls(this, app.canvas, ui);
    installTouchpadHint(app.canvas, ui);
    this.clocks = new ClockHud(ui, this.world);
    this.minimap = new Minimap(map, colors, this.camera);
    ui.appendChild(this.minimap.el);
    this.resourceBar = new ResourceBar(ui);
    this.messages = new Messages(ui);
    this.selectionPanel = new SelectionPanel(ui);
    this.selectionPanel.onPick = (id) => {
      this.selected.clear();
      this.selected.add(id);
    };
    this.selectionPanel.onCancel = (building, index) => this.issue({ type: 'cancel', owner: this.player, building, index });
    this.commandPanel = new CommandPanel(ui, this);
    this.placement = new Placement(this);
    this.coverage = new CoverageOverlay(this);
    this.contextOrder = (target, x, y, ids) =>
      combatContextOrder(this, target, x, y, ids) || economyContextOrder(this, target, x, y, ids);
    this.eventHooks.push((s, ev) => s.effects.handle(s.world, ev));
    this.eventHooks.push((s, ev) => {
      const m = eventMessage(s.world, s.player, ev);
      if (m) s.messages.push(m[0], m[1]);
    });
    installCampaignUi(this);
    this.eventHooks.push((s, ev) => s.soundFor(ev));
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

    this.tickFn = (tk) => {
      const dt = Math.min(0.1, tk.deltaMS / 1000);
      const n = this.modal ? 0 : this.stepper.advance(tk.deltaMS);
      this.timerSeconds = timerSecondsLeft(this.world);
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        step(this.world);
        this.snapshots.tick(this.world);
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
      this.resourceBar.update(this.world, this.player);
      this.updateAudio();
      this.selectionPanel.update(this.world, [...this.selected]);
      this.commandPanel.update();
      this.placement.update();
      this.coverage.update();
      this.effects.update(dt);
      if (Math.floor(this.world.tick / 5) !== this.fogTick) {
        this.fogTick = Math.floor(this.world.tick / 5);
        this.fogRenderer.update(fogOf(this.world, this.player));
      }
      for (const h of this.frameHooks) h(this, dt);
      this.minimap.draw(
        [...this.world.all()]
          .filter((e) => e.kind !== 'resource' && !e.insideOf && !this.entities.hidden(e))
          .map((e) => ({
            x: e.x,
            y: e.y,
            color: colorFor(e.owner),
            size: e.kind === 'building' ? 4 : this.colorblind ? 3 : 2,
            shape: !this.colorblind || e.kind === 'building' ? ('square' as const) : (['triangle', 'square'] as const)[this.world.playable.indexOf(e.owner)] ?? ('circle' as const),
          })),
        this.fogForMinimap?.(),
      );
      this.fps.acc += tk.deltaMS / 1000;
      this.fps.frames++;
      if (this.fps.acc >= 0.5) {
        this.fps.value = Math.round(this.fps.frames / this.fps.acc);
        this.fpsEl.textContent = `${this.fps.value} FPS · ${[...this.world.all()].filter((e) => e.kind === 'unit').length} units`;
        this.fps.acc = this.fps.frames = 0;
      }
    };
    app.ticker.add(this.tickFn);
    this.unsubscribe = onSettings((st) => {
      this.cameraInput.scrollSpeed = st.scrollSpeed;
      this.cameraInput.edgeScroll = st.edgeScroll;
      this.cameraInput.touchpad = st.touchpad;
      this.controls.smartClick = st.touchpad;
      this.colorblind = st.colorblind;
      this.entities.setColorblind(st.colorblind);
    });
    this.speedIdx = Math.max(0, SPEEDS.indexOf(settings.gameSpeed));
    this.stepper.speed = SPEEDS[this.speedIdx];
  }

  colorblind = false;
  private unsubscribe: () => void;

  /** Stops the game and removes its rendering, panels and listeners. */
  destroy() {
    audio.setMood('silent');
    audio.setStorm(false);
    this.unsubscribe();
    this.abort.abort();
    if (this.tickFn) this.app.ticker.remove(this.tickFn);
    this.app.stage.removeChild(this.worldLayer);
    this.worldLayer.destroy({ children: true });
    this.ui.replaceChildren();
  }

  fogForMinimap?: () => import('../sim/systems/fog').FogState | undefined;

  get fpsValue() {
    return this.fps.value;
  }

  startPlacement(building: string, builders: number[]) {
    this.placement.start(building, builders);
  }

  cancelPending() {
    this.pendingClick = null;
    this.placement.cancel();
  }

  issue(cmd: Command) {
    this.world.enqueue(cmd);
    if (['move', 'attack', 'attack_move', 'gather', 'build', 'garrison', 'embark', 'patrol'].includes(cmd.type)) audio.respond(this.player, this.world.tick);
  }

  private lastBattle = -1e9;

  /** Positional sound for simulation events; volume falls off with distance from the view centre. */
  soundFor(ev: SimEvent) {
    const x = (ev.x as number | undefined) ?? (ev.tx as number | undefined);
    const y = (ev.y as number | undefined) ?? (ev.ty as number | undefined);
    if (x === undefined || y === undefined) return;
    if (!this.effects.visibleAt(x, y)) return;
    const d = Math.hypot(x - this.camera.cx, y - this.camera.cy);
    const vol = Math.max(0, 1 - d / 30) * this.camera.zoom;
    if (vol <= 0.02) return;
    if (ev.type === 'shot') {
      this.lastBattle = performance.now();
      if (ev.atkType === 'musket') audio.musket(vol);
      else if (ev.atkType === 'cannon') audio.cannon(vol);
    } else if (ev.type === 'explosion' || (ev.type === 'death' && ev.kind === 'building')) audio.explosion(vol);
  }

  /** Music mood and storm ambience, called every frame. */
  updateAudio() {
    audio.setMood(this.modal ? 'cutscene' : performance.now() - this.lastBattle < 8000 ? 'battle' : 'explore');
    audio.setStorm(this.world.weather.active);
  }

  togglePause() {
    this.stepper.paused = !this.stepper.paused;
  }

  changeSpeed(dir: 1 | -1) {
    this.speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, this.speedIdx + dir));
    this.stepper.speed = SPEEDS[this.speedIdx];
  }
}
