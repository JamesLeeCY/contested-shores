// Combat/siege controls: attack (A), patrol (P), unload (U), dig mine (K); right-click attack,
// embark and unload; bastion coverage overlay (spec §3.2: crossfire sectors shown on the map).
import { Graphics } from 'pixi.js';
import { toScreen } from '../render/iso';
import { isEnemy, isElevated } from '../sim/systems/combat';
import { mineOrigin } from '../sim/systems/siege';
import { capacityOf } from '../sim/systems/transport';
import { buildingAttack } from '../sim/stats';
import type { Entity } from '../sim/types';
import { buttonProviders } from './commands';
import { t } from './i18n';
import type { Session } from './session';

const SIEGE_TYPES = new Set(['light_cannon', 'heavy_cannon', 'field_cannon', 'grenadier']);

buttonProviders.unshift((ctx) => {
  const { session: s, units, mode } = ctx;
  if (!units.length || mode !== 'root') return [];
  const ids = units.map((u) => u.id);
  const w = s.world;
  const combatants = units.filter((u) => !w.data.units.get(u.type)!.traits.includes('non_combat'));
  const out = [];
  if (combatants.length)
    out.push(
      {
        id: 'attack',
        label: t('cmd.attack'),
        hotkey: 'A',
        run: () => {
          s.messages.push(t('cmd.attack_hint'));
          s.pendingClick = (x, y, target) => {
            const cids = combatants.map((u) => u.id);
            if (target && isEnemy(w, s.player, target.owner)) s.issue({ type: 'attack', owner: s.player, ids: cids, target: target.id });
            else {
              const guns = combatants.filter((u) => SIEGE_TYPES.has(u.type)).map((u) => u.id);
              const rest = cids.filter((id) => !guns.includes(id));
              if (guns.length) s.issue({ type: 'attack_ground', owner: s.player, ids: guns, x, y });
              if (rest.length) s.issue({ type: 'attack_move', owner: s.player, ids: rest, x, y });
            }
            return true;
          };
        },
      },
      {
        id: 'patrol',
        label: t('cmd.patrol'),
        hotkey: 'P',
        run: () => {
          s.messages.push(t('cmd.patrol_hint'));
          s.pendingClick = (x, y) => {
            s.issue({ type: 'patrol', owner: s.player, ids: combatants.map((u) => u.id), x, y });
            return true;
          };
        },
      },
    );
  const loaded = units.filter((u) => u.cargo?.length);
  if (loaded.length)
    out.push({ id: 'unload', label: t('cmd.unload_here'), hotkey: 'U', run: () => s.issue({ type: 'unload', owner: s.player, ids: loaded.map((u) => u.id) }) });
  const diggers = units.filter((u) => w.data.units.get(u.type)!.traits.includes('builder'));
  const f = w.faction(s.player);
  if (diggers.length && s.player === 'faction_zheng' && f && f.stage >= w.rules.siege.mine.stage)
    out.push({
      id: 'mine',
      label: t('cmd.dig_mine'),
      hotkey: 'K',
      run: () => {
        s.messages.push(t('cmd.mine_hint'));
        s.pendingClick = (_x, _y, target) => {
          if (!target) return false;
          const o = mineOrigin(w, s.player, target);
          if (typeof o === 'string') {
            s.messages.push(t('err.mine_' + o), 'warn');
            return false;
          }
          s.issue({ type: 'dig_mine', owner: s.player, ids: diggers.map((u) => u.id), target: target.id });
          return true;
        };
      },
    });
  void ids;
  return out;
});

/** Right-click handling that takes priority over the economy defaults. */
export function combatContextOrder(s: Session, target: Entity | null, x: number, y: number, ids: number[]): boolean {
  const w = s.world;
  const units = ids.map((id) => w.get(id)!).filter((e) => e?.kind === 'unit');
  if (!units.length) return false;
  if (target && target.kind !== 'resource' && isEnemy(w, s.player, target.owner)) {
    const fighters = units.filter((u) => !w.data.units.get(u.type)!.traits.includes('non_combat'));
    if (!fighters.length) return false;
    s.issue({ type: 'attack', owner: s.player, ids: fighters.map((u) => u.id), target: target.id });
    return true;
  }
  if (target && target.owner === s.player && target.kind === 'unit' && capacityOf(w, target) > 0) {
    const foot = units.filter((u) => u.moveClass === 'foot');
    if (foot.length) {
      s.issue({ type: 'embark', owner: s.player, ids: foot.map((u) => u.id), target: target.id });
      return true;
    }
  }
  // Loaded ships right-clicked onto land: sail there and put the troops ashore.
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const ships = units.filter((u) => u.cargo?.length);
  if (ships.length === units.length && w.nav.passable('foot', tx, ty)) {
    s.issue({ type: 'unload', owner: s.player, ids: ships.map((u) => u.id), x, y });
    return true;
  }
  return false;
}

/** Semi-transparent range discs of bastions while one is selected; overlaps show crossfire. */
export class CoverageOverlay {
  readonly g = new Graphics();
  private sig = '';

  constructor(private readonly s: Session) {
    s.overlayLayer.addChild(this.g);
  }

  update() {
    const w = this.s.world;
    const sel = [...this.s.selected].map((id) => w.get(id)).filter(Boolean) as Entity[];
    const show = sel.some((e) => (w.data.buildings.get(e.type) as { crossfire?: boolean } | undefined)?.crossfire);
    const forts = show ? w.buildings().filter((b) => (w.data.buildings.get(b.type) as { crossfire?: boolean }).crossfire && b.owner === sel[0].owner) : [];
    const sig = forts.map((b) => b.id).join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    this.g.clear();
    for (const b of forts) {
      const atk = buildingAttack(w, b);
      if (!atk) continue;
      const r = atk.range + (isElevated(w, b) ? w.rules.combat.elevatedRangeBonus : 0) + b.w! / 2;
      const pts: number[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        const p = toScreen(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
        pts.push(p.x, p.y);
      }
      this.g.poly(pts).fill({ color: 0xe67e22, alpha: 0.1 }).stroke({ color: 0xe67e22, width: 1, alpha: 0.5 });
    }
  }
}
