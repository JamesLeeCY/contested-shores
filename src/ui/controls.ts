// Mouse/keyboard unit control (spec §9.2): click/box select, right-click orders, control groups,
// pause and game speed. Laptop alternatives to the right button: Alt/Ctrl + left click or a long
// press always give an order, and touchpad mode turns a plain left click into a contextual order.
import { on } from './lifecycle';
import type { Camera } from '../render/camera';
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import type { Command } from '../sim/commands';

export const SPEEDS = [0.5, 1, 1.5, 2];
const CLICK_RADIUS = 16;
const DOUBLE_TAP_MS = 350;
const LONG_PRESS_MS = 450;
const DRAG_PX = 5;

export interface ControlHost {
  world: World;
  camera: Camera;
  player: string;
  selected: Set<number>;
  issue(cmd: Command): void;
  togglePause(): void;
  changeSpeed(dir: 1 | -1): void;
  /** Right-click handler override for targeted commands (attack, gather…). Returns true if handled. */
  contextOrder?(target: Entity | null, x: number, y: number, ids: number[], e: MouseEvent): boolean;
  /** Pending ability that wants the next left click (e.g. "A" attack-ground, build placement). */
  pendingClick?: ((x: number, y: number, target: Entity | null) => boolean) | null;
  onSelectionChange?(): void;
  cancelPending?(): void;
}

export class Controls {
  private dragStart: { x: number; y: number } | null = null;
  private dragNow: { x: number; y: number } | null = null;
  private groups = new Map<number, number[]>();
  private lastTap = { key: -1, at: 0 };
  private longPress: ReturnType<typeof setTimeout> | null = null;
  readonly box: HTMLDivElement;
  /** Touchpad mode: a left click that is not on one of your units orders the selection there. */
  smartClick = false;

  constructor(
    private readonly host: ControlHost,
    canvas: HTMLElement,
    overlay: HTMLElement,
  ) {
    this.box = document.createElement('div');
    this.box.className = 'select-box';
    overlay.appendChild(this.box);

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        if (host.pendingClick) {
          const t = this.host.camera.screenToTile(e.clientX, e.clientY);
          if (host.pendingClick(t.x, t.y, this.pick(e.clientX, e.clientY))) host.pendingClick = null;
          return;
        }
        if (e.altKey || e.ctrlKey || e.metaKey) {
          this.order(e.clientX, e.clientY, e);
          return;
        }
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dragNow = { ...this.dragStart };
        canvas.setPointerCapture(e.pointerId);
        if (this.ownSelected().length) {
          const at = { x: e.clientX, y: e.clientY };
          this.longPress = setTimeout(() => {
            this.longPress = null;
            const n = this.dragNow;
            if (!this.dragStart || !n || Math.hypot(n.x - at.x, n.y - at.y) >= DRAG_PX) return;
            this.dragStart = null;
            this.box.style.display = 'none';
            this.order(at.x, at.y, e);
          }, LONG_PRESS_MS);
        }
      } else if (e.button === 2) {
        if (host.pendingClick) {
          host.cancelPending?.();
          return;
        }
        this.order(e.clientX, e.clientY, e);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragStart) {
        this.dragNow = { x: e.clientX, y: e.clientY };
        this.drawBox();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;
      this.cancelLongPress();
      if (!this.dragStart) return;
      const s = this.dragStart;
      this.dragStart = null;
      this.box.style.display = 'none';
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) >= DRAG_PX) this.boxSelect(s.x, s.y, e.clientX, e.clientY, e.shiftKey);
      else if (!this.smartClick || e.shiftKey || !this.smartOrder(e.clientX, e.clientY, e)) this.clickSelect(e.clientX, e.clientY, e.shiftKey);
    });
    canvas.addEventListener('pointercancel', () => {
      this.cancelLongPress();
      this.dragStart = null;
      this.box.style.display = 'none';
    });
    on(window, 'keydown', (e) => this.key(e));
  }

  private units(): Entity[] {
    return [...this.host.world.all()].filter((e) => e.kind !== 'resource' && !e.insideOf);
  }

  /** Topmost entity under a screen point. */
  pick(sx: number, sy: number): Entity | null {
    const { camera, world } = this.host;
    let best: Entity | null = null;
    let bestD = CLICK_RADIUS;
    for (const e of this.units()) {
      if (e.kind !== 'unit') continue;
      const p = camera.tileToScreen(e.x, e.y);
      const d = Math.hypot(p.x - sx, p.y - 10 * camera.zoom - sy);
      if (d < bestD + (e.moveClass !== 'foot' ? 10 : 0)) {
        bestD = d;
        best = e;
      }
    }
    if (best) return best;
    const t = camera.screenToTile(sx, sy);
    for (const e of world.all())
      if ((e.kind === 'building' && t.x >= e.tx! && t.y >= e.ty! && t.x < e.tx! + e.w! && t.y < e.ty! + e.h!) || (e.kind === 'resource' && Math.hypot(t.x - e.x, t.y - e.y) < 1))
        return e;
    return null;
  }

  private setSelection(ids: number[], add: boolean) {
    const sel = this.host.selected;
    if (!add) sel.clear();
    for (const id of ids) {
      if (add && sel.has(id) && ids.length === 1) sel.delete(id);
      else sel.add(id);
    }
    this.host.onSelectionChange?.();
  }

  private clickSelect(sx: number, sy: number, add: boolean) {
    const e = this.pick(sx, sy);
    this.setSelection(e ? [e.id] : [], add);
  }

  private boxSelect(x0: number, y0: number, x1: number, y1: number, add: boolean) {
    const [l, r] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [t, b] = [Math.min(y0, y1), Math.max(y0, y1)];
    const inBox = this.units().filter((e) => {
      if (e.kind !== 'unit') return false;
      const p = this.host.camera.tileToScreen(e.x, e.y);
      return p.x >= l && p.x <= r && p.y >= t && p.y <= b;
    });
    // Prefer own units; never mix own and foreign units in one selection.
    const own = inBox.filter((e) => e.owner === this.host.player);
    this.setSelection((own.length ? own : inBox.slice(0, 1)).map((e) => e.id), add);
  }

  private drawBox() {
    const s = this.dragStart!;
    const n = this.dragNow!;
    if (Math.hypot(n.x - s.x, n.y - s.y) < 5) return;
    Object.assign(this.box.style, {
      display: 'block',
      left: `${Math.min(s.x, n.x)}px`,
      top: `${Math.min(s.y, n.y)}px`,
      width: `${Math.abs(n.x - s.x)}px`,
      height: `${Math.abs(n.y - s.y)}px`,
    });
  }

  ownSelected(): number[] {
    return [...this.host.selected].filter((id) => {
      const e = this.host.world.get(id);
      return e && e.owner === this.host.player;
    });
  }

  private cancelLongPress() {
    if (this.longPress) clearTimeout(this.longPress);
    this.longPress = null;
  }

  /** The right-click order: contextual (attack, gather, garrison, rally…) or a plain move. */
  private order(sx: number, sy: number, e: MouseEvent, moveFallback = true): boolean {
    const ids = this.ownSelected().filter((id) => this.host.world.get(id)?.kind === 'unit');
    const t = this.host.camera.screenToTile(sx, sy);
    const target = this.pick(sx, sy);
    if (this.host.contextOrder?.(target, t.x, t.y, this.ownSelected(), e)) {
      this.flash(sx, sy);
      return true;
    }
    if (!ids.length || !moveFallback) return false;
    this.host.issue({ type: 'move', owner: this.host.player, ids, x: t.x, y: t.y });
    this.flash(sx, sy);
    return true;
  }

  /** Touchpad mode left click: clicking your own units still selects; anything else is an order. */
  private smartOrder(sx: number, sy: number, e: MouseEvent): boolean {
    if (!this.ownSelected().length) return false;
    const target = this.pick(sx, sy);
    if (target?.owner === this.host.player && target.kind === 'unit') return false;
    // Own buildings: an order only if the selection can use it (garrison, repair…), else select it.
    return this.order(sx, sy, e, !(target?.owner === this.host.player && target.kind === 'building'));
  }

  flash(x: number, y: number) {
    const m = document.createElement('div');
    m.className = 'order-marker';
    m.style.left = `${x}px`;
    m.style.top = `${y}px`;
    this.box.parentElement!.appendChild(m);
    setTimeout(() => m.remove(), 400);
  }

  private key(e: KeyboardEvent) {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    // Escape first cancels a pending targeted command (command panel), then clears the selection.
    if (e.key === 'Escape') {
      if (!this.host.pendingClick && !e.defaultPrevented && this.host.selected.size) this.setSelection([], false);
      return;
    }
    if (e.code === 'Space') {
      this.host.togglePause();
      e.preventDefault();
      return;
    }
    if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') return this.host.changeSpeed(1);
    if (e.key === '-' || e.code === 'NumpadSubtract') return this.host.changeSpeed(-1);
    const m = /^Digit([1-9])$/.exec(e.code);
    if (!m) return;
    const n = Number(m[1]);
    if (e.ctrlKey || e.metaKey) {
      this.groups.set(n, [...this.host.selected]);
      e.preventDefault();
      return;
    }
    const ids = (this.groups.get(n) ?? []).filter((id) => this.host.world.get(id));
    if (!ids.length) return;
    this.setSelection(ids, e.shiftKey);
    const now = performance.now();
    if (this.lastTap.key === n && now - this.lastTap.at < DOUBLE_TAP_MS) {
      const us = ids.map((id) => this.host.world.get(id)!);
      this.host.camera.centerOn(us.reduce((s, u) => s + u.x, 0) / us.length, us.reduce((s, u) => s + u.y, 0) / us.length);
    }
    this.lastTap = { key: n, at: now };
  }
}
