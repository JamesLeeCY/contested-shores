// Building placement ghost: follows the cursor, green when valid, red otherwise.
import { on } from './lifecycle';
import { Graphics } from 'pixi.js';
import { toScreen } from '../render/iso';
import { checkPlacement } from '../sim/systems/build';
import { t } from './i18n';
import type { Session } from './session';

export class Placement {
  readonly ghost = new Graphics();
  building: string | null = null;
  private builders: number[] = [];
  private mouse = { x: 0, y: 0 };
  private shift = false;

  constructor(private readonly session: Session) {
    session.overlayLayer.addChild(this.ghost);
    on(window, 'pointermove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY };
      this.shift = e.shiftKey;
    });
    on(window, 'keyup', (e) => e.key === 'Shift' && (this.shift = false));
  }

  start(building: string, builders: number[]) {
    this.building = building;
    this.builders = builders;
    this.session.pendingClick = (x, y) => this.place(x, y);
    this.session.messages.push(t('ui.place_hint'));
  }

  cancel() {
    this.building = null;
    this.ghost.clear();
  }

  private origin(x: number, y: number): [number, number] {
    const size = this.session.world.data.buildings.get(this.building!)!.size;
    return [Math.floor(x - size / 2 + 0.5), Math.floor(y - size / 2 + 0.5)];
  }

  private place(x: number, y: number): boolean {
    if (!this.building) return true;
    const [tx, ty] = this.origin(x, y);
    const s = this.session;
    const err = checkPlacement(s.world, s.player, this.building, tx, ty);
    if (err) {
      s.messages.push(t('err.' + err), 'warn');
      return false;
    }
    s.issue({ type: 'place', owner: s.player, building: this.building, tx, ty, builders: this.builders });
    if (this.shift) return false;
    this.cancel();
    s.commandPanel.mode = 'root';
    return true;
  }

  update() {
    const g = this.ghost;
    g.clear();
    if (!this.building || !this.session.pendingClick) {
      if (this.building && !this.session.pendingClick) this.cancel();
      return;
    }
    const s = this.session;
    const p = s.camera.screenToTile(this.mouse.x, this.mouse.y);
    const [tx, ty] = this.origin(p.x, p.y);
    const size = s.world.data.buildings.get(this.building)!.size;
    const ok = !checkPlacement(s.world, s.player, this.building, tx, ty, true);
    const color = ok ? 0x4caf50 : 0xf44336;
    for (let y = ty; y < ty + size; y++)
      for (let x = tx; x < tx + size; x++) {
        const a = toScreen(x, y);
        const b = toScreen(x + 1, y);
        const c = toScreen(x + 1, y + 1);
        const d = toScreen(x, y + 1);
        g.poly([a.x, a.y, b.x, b.y, c.x, c.y, d.x, d.y]).fill({ color, alpha: 0.35 }).stroke({ color, width: 1, alpha: 0.8 });
      }
  }
}
