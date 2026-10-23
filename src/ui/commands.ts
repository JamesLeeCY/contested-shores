// Command panel: 3 rows × 4 columns with hotkeys (spec §9.1). Buttons come from providers so
// later systems (combat, diplomacy, siege) can add their own.
import { on } from './lifecycle';
import type { Resources } from '../sim/types';
import { canAfford } from '../sim/stats';
import { buildableList, buildingStage } from '../sim/systems/build';
import { canProduce, canResearch, canGarrison } from '../sim/systems/production';
import type { Entity } from '../sim/types';
import { el } from './dom';
import { t } from './i18n';
import type { Session } from './session';

export const GRID_KEYS = ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F', 'Z', 'X', 'C', 'V'];

export interface CmdButton {
  id: string;
  label: string;
  /** Fixed hotkey (letter); otherwise the grid position's key is used. */
  hotkey?: string;
  cost?: Resources;
  time?: number;
  disabled?: boolean;
  reason?: string;
  active?: boolean;
  run: () => void;
}

export interface PanelContext {
  session: Session;
  /** Own selected entities. */
  units: Entity[];
  buildings: Entity[];
  mode: string;
  setMode: (m: string) => void;
}

export type ButtonProvider = (ctx: PanelContext) => CmdButton[];
export const buttonProviders: ButtonProvider[] = [];

const costText = (c?: Resources) =>
  c
    ? (['grain', 'wood', 'powder', 'deerskin'] as const)
        .filter((k) => c[k] > 0)
        .map((k) => `${t('resource.' + k)} ${c[k]}`)
        .join(' / ')
    : '';

export class CommandPanel {
  readonly root: HTMLDivElement;
  private grid: HTMLDivElement;
  private tip: HTMLDivElement;
  private buttons: CmdButton[] = [];
  private keyMap = new Map<string, CmdButton>();
  private sig = '';
  mode = 'root';

  constructor(
    parent: HTMLElement,
    private readonly session: Session,
  ) {
    this.root = el('div', 'cmdpanel panel', parent);
    this.grid = el('div', 'cmd-grid', this.root);
    this.tip = el('div', 'cmd-tip', parent);
    on(window, 'keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        if (this.session.pendingClick) {
          this.session.cancelPending();
          e.preventDefault();
        } else if (this.mode !== 'root') {
          this.mode = 'root';
          e.preventDefault();
        }
        this.sig = '';
        return;
      }
      const b = this.keyMap.get(e.key.toUpperCase());
      if (b && !b.disabled) {
        e.preventDefault();
        b.run();
        this.sig = '';
      }
    });
  }

  private context(): PanelContext {
    const s = this.session;
    const own = [...s.selected].map((id) => s.world.get(id)).filter((e): e is Entity => !!e && e.owner === s.player);
    return {
      session: s,
      units: own.filter((e) => e.kind === 'unit'),
      buildings: own.filter((e) => e.kind === 'building'),
      mode: this.mode,
      setMode: (m) => {
        this.mode = m;
        this.sig = '';
      },
    };
  }

  update() {
    const ctx = this.context();
    if (!ctx.units.length && !ctx.buildings.length) this.mode = 'root';
    const buttons = buttonProviders.flatMap((p) => p(ctx)).slice(0, 12);
    const sig = buttons.map((b) => `${b.id}:${b.disabled ? 0 : 1}:${b.active ? 1 : 0}:${b.label}`).join('|');
    this.buttons = buttons;
    if (sig === this.sig) return;
    this.sig = sig;
    this.grid.replaceChildren();
    this.keyMap.clear();
    // Explicit hotkeys reserve their letters; the rest take the next free grid key.
    const reserved = new Set(buttons.map((b) => b.hotkey).filter(Boolean));
    const free = GRID_KEYS.filter((k) => !reserved.has(k));
    let next = 0;
    buttons.forEach((b) => {
      const key = b.hotkey ?? free[next++] ?? '';
      this.keyMap.set(key, b);
      const btn = el('button', 'cmd-btn' + (b.disabled ? ' disabled' : '') + (b.active ? ' active' : ''), this.grid);
      el('span', 'cmd-label', btn, b.label);
      el('span', 'cmd-key', btn, key);
      btn.onclick = () => {
        if (!b.disabled) {
          b.run();
          this.sig = '';
        }
      };
      btn.onmouseenter = () => {
        const lines = [`${b.label} (${key})`];
        if (b.cost) lines.push(costText(b.cost));
        if (b.time) lines.push(`${t('ui.time')} ${b.time}s`);
        if (b.reason) lines.push(b.reason);
        this.tip.textContent = lines.filter(Boolean).join('\n');
        this.tip.style.display = 'block';
      };
      btn.onmouseleave = () => (this.tip.style.display = 'none');
    });
    for (let i = buttons.length; i < 12; i++) el('div', 'cmd-btn empty', this.grid);
  }

  get current() {
    return this.buttons;
  }
}

// --- core providers (stage 3) -------------------------------------------------------------------

buttonProviders.push((ctx) => {
  const { session: s, units, mode } = ctx;
  if (!units.length || mode !== 'root') return [];
  const ids = units.map((u) => u.id);
  const out: CmdButton[] = [
    {
      id: 'stop',
      label: t('cmd.stop'),
      hotkey: 'S',
      run: () => s.issue({ type: 'stop', owner: s.player, ids }),
    },
  ];
  const builders = units.filter((u) => s.world.data.units.get(u.type)!.traits.includes('builder'));
  if (builders.length) out.push({ id: 'build', label: t('cmd.build'), hotkey: 'B', run: () => ctx.setMode('build') });
  return out;
});

buttonProviders.push((ctx) => {
  const { session: s, units, mode } = ctx;
  if (mode !== 'build') return [];
  const builders = units.filter((u) => s.world.data.units.get(u.type)!.traits.includes('builder'));
  const f = s.world.faction(s.player)!;
  const all = [...s.world.data.buildings.values()].filter((b) => !b.preset && (b.faction === s.player || b.faction === 'any'));
  const unlocked = new Set(buildableList(s.world, s.player).map((b) => b.id));
  const out: CmdButton[] = all.slice(0, 11).map((b) => ({
    id: 'build:' + b.id,
    label: t(b.nameKey),
    cost: b.cost,
    time: b.buildTime,
    disabled: !unlocked.has(b.id) || !canAfford(f, b.cost),
    reason: !unlocked.has(b.id) ? t('ui.locked_stage', { n: buildingStage(s.world, s.player, b.id) }) : !canAfford(f, b.cost) ? t('err.cost') : '',
    run: () => s.startPlacement(b.id, builders.map((u) => u.id)),
  }));
  out.push({ id: 'back', label: t('cmd.back'), hotkey: 'V', run: () => ctx.setMode('root') });
  return out;
});

buttonProviders.push((ctx) => {
  const { session: s, buildings, units, mode } = ctx;
  if (mode !== 'root' || units.length || buildings.length !== 1) return [];
  const b = buildings[0];
  if ((b.built ?? 1) < 1) return [];
  const def = s.world.data.buildings.get(b.type)!;
  const f = s.world.faction(s.player)!;
  const out: CmdButton[] = [];
  for (const u of def.produces) {
    const ud = s.world.data.units.get(u)!;
    const err = canProduce(s.world, s.player, b.id, u);
    out.push({
      id: 'produce:' + u,
      label: t(ud.nameKey),
      cost: ud.cost,
      time: ud.buildTime,
      disabled: !!err,
      reason: err === 'stage' ? t('ui.locked_stage', { n: ud.stage }) : err ? t('err.' + err) : '',
      run: () => s.issue({ type: 'produce', owner: s.player, building: b.id, unit: u }),
    });
  }
  for (const tid of def.researches) {
    const td = s.world.data.techs.get(tid)!;
    const err = canResearch(s.world, s.player, b.id, tid);
    if (err === 'done' && f.techs.includes(tid)) continue;
    out.push({
      id: 'research:' + tid,
      label: t(td.nameKey),
      cost: td.cost,
      time: td.time,
      disabled: !!err,
      reason: [t(td.descKey), err === 'stage' ? t('ui.locked_stage', { n: td.stage }) : err && err !== 'done' ? t('err.' + err) : ''].filter(Boolean).join('\n'),
      run: () => s.issue({ type: 'research', owner: s.player, building: b.id, tech: tid }),
    });
  }
  if (b.garrisoned?.length)
    out.push({ id: 'ungarrison', label: t('cmd.ungarrison'), hotkey: 'U', run: () => s.issue({ type: 'ungarrison', owner: s.player, building: b.id }) });
  return out;
});

/** Default right-click behaviour for stage 3: gather, construct, garrison. */
export function economyContextOrder(s: Session, target: Entity | null, x: number, y: number, ids: number[]): boolean {
  const w = s.world;
  const units = ids.map((id) => w.get(id)!).filter((e) => e?.kind === 'unit');
  if (!units.length) {
    // Buildings only: set rally point.
    for (const id of ids) {
      const b = w.get(id);
      if (b?.kind === 'building') s.issue({ type: 'rally', owner: s.player, building: id, x, y });
    }
    return ids.length > 0;
  }
  const gatherers = units.filter((u) => w.data.units.get(u.type)!.traits.includes('gatherer'));
  if (target && target.owner === s.player && target.kind === 'building') {
    if ((target.built ?? 1) < 1 && gatherers.length) {
      s.issue({ type: 'build', owner: s.player, ids: gatherers.map((u) => u.id), target: target.id });
      return true;
    }
    if (target.type === 'farm' && gatherers.length) {
      s.issue({ type: 'gather', owner: s.player, ids: gatherers.map((u) => u.id), target: target.id });
      return true;
    }
    const gar = units.filter((u) => canGarrison(w, u, target));
    if (gar.length && !gatherers.length) {
      s.issue({ type: 'garrison', owner: s.player, ids: gar.map((u) => u.id), target: target.id });
      return true;
    }
  }
  if (gatherers.length && gatherers.length === units.length) {
    if (target && (target.type === 'deer_herd' || target.type === 'farm')) {
      s.issue({ type: 'gather', owner: s.player, ids: gatherers.map((u) => u.id), target: target.id });
      return true;
    }
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (tx >= 0 && ty >= 0 && tx < w.map.width && ty < w.map.height && w.woodLeft[ty * w.map.width + tx] > 0) {
      s.issue({ type: 'gather', owner: s.player, ids: gatherers.map((u) => u.id), tile: ty * w.map.width + tx });
      return true;
    }
  }
  return false;
}
