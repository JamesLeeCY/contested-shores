// Top resource bar, bottom selection panel, message feed (spec §9.1).
import type { ResourceId } from '../data/schema';
import { popCap, popUsed, unitStat } from '../sim/stats';
import { hasPowder } from '../sim/systems/combat';
import { capacityOf, cargoPop } from '../sim/systems/transport';
import type { Entity, SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { el, setText } from './dom';
import { hasKey, t } from './i18n';

const RES: ResourceId[] = ['grain', 'wood', 'powder', 'deerskin'];
const RES_ICON: Record<ResourceId, string> = { grain: '🌾', wood: '🪵', powder: '💥', deerskin: '🦌' };

export class ResourceBar {
  readonly root: HTMLDivElement;
  private cells = new Map<string, HTMLSpanElement>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'resbar panel', parent);
    for (const r of [...RES, 'pop'] as const) {
      const c = el('div', `res res-${r}`, this.root);
      c.title = t('resource.' + r);
      el('span', 'res-icon', c, r === 'pop' ? '👥' : RES_ICON[r]);
      el('span', 'res-name', c, t('resource.' + r));
      this.cells.set(r, el('span', 'res-val', c));
    }
  }

  update(world: World, owner: string) {
    const f = world.faction(owner);
    if (!f) return;
    // Only what the chapter uses: everything in 1661 (and outside scenarios), else the scenario's list.
    const sc = world.scenario;
    const shown: string[] = sc?.hud?.[owner] ?? (!sc || (sc.campaign ?? 'koxinga') === 'koxinga' ? RES : []);
    for (const r of RES) {
      const cell = this.cells.get(r)!.parentElement!;
      cell.style.display = shown.includes(r) ? '' : 'none';
      const label = t(sc?.hudLabels?.[r] ?? 'resource.' + r);
      setText(cell.querySelector('.res-name') as HTMLElement, label);
      cell.title = label;
      setText(this.cells.get(r)!, String(Math.floor(f.resources[r])));
    }
    setText(this.cells.get('pop')!, `${popUsed(world, owner)}/${popCap(world, owner)}`);
    this.root.querySelector('.res-grain')!.classList.toggle('starving', f.starvingUntil > world.tick);
  }
}

export class Messages {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', 'messages', parent);
  }
  push(text: string, kind: 'info' | 'warn' | 'good' = 'info') {
    const m = el('div', `msg msg-${kind}`, this.root, text);
    while (this.root.children.length > 3) this.root.firstChild!.remove();
    setTimeout(() => m.classList.add('fade'), 4200);
    setTimeout(() => m.remove(), 5000);
  }
}

/** Translates sim events into messages for the player. */
export function eventMessage(world: World, player: string, ev: SimEvent): [string, 'info' | 'warn' | 'good'] | null {
  const e = ev as Record<string, unknown> & { type: string };
  switch (e.type) {
    case 'starvation':
      return e.owner === player ? [t('msg.starvation', { n: Math.ceil(e.shortfall as number), d: e.moraleDelta as number }), 'warn'] : null;
    case 'pop_blocked':
      return e.owner === player ? [t('msg.pop_blocked'), 'warn'] : null;
    case 'researched':
      return e.owner === player ? [t('msg.researched', { name: t(world.data.techs.get(e.tech as string)!.nameKey) }), 'good'] : null;
    case 'built':
      return e.owner === player ? [t('msg.built', { name: t(world.data.buildings.get(e.building as string)!.nameKey) }), 'good'] : null;
    case 'tide':
      return [t('msg.tide', { name: t('tide.' + (e.phase as string)) }), 'info'];
    case 'stranded': {
      const u = world.get(e.id as number);
      return u?.owner === player ? [t('msg.stranded'), 'warn'] : null;
    }
    case 'message':
      if (e.to && e.to !== player) return null;
      return [t(e.textKey as string, (e.params as Record<string, string | number>) ?? {}), (e.kind as 'info' | 'warn' | 'good') ?? 'info'];
    default:
      return null;
  }
}

export function displayName(world: World, e: Entity): string {
  if (e.kind === 'unit') return t(world.data.units.get(e.type)!.nameKey);
  if (e.kind === 'building') {
    if (e.type === 'village_center' && e.village) return t(`village.${e.village}.name`);
    if (e.tag && hasKey(`place.${e.tag}`)) return t(`place.${e.tag}`);
    return t(world.data.buildings.get(e.type)!.nameKey);
  }
  return t('resource.deerskin');
}

export class SelectionPanel {
  readonly root: HTMLDivElement;
  private body: HTMLDivElement;
  private lastKey = '';
  onPick?: (id: number) => void;
  onCancel?: (building: number, index: number) => void;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'selpanel panel', parent);
    this.body = el('div', 'sel-body', this.root);
  }

  update(world: World, selected: number[]) {
    const ents = selected.map((id) => world.get(id)).filter(Boolean) as Entity[];
    const key = ents.map((e) => e.id).join(',');
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.body.replaceChildren();
      if (ents.length === 1) this.buildSingle(world, ents[0]);
      else if (ents.length > 1) this.buildMulti(world, ents);
    }
    if (ents.length === 1) this.refreshSingle(world, ents[0]);
    else this.refreshMulti(ents);
  }

  private buildSingle(world: World, e: Entity) {
    const head = el('div', 'sel-head', this.body);
    el('div', `sel-portrait owner-${e.owner}`, head, displayName(world, e).slice(0, 1));
    const info = el('div', 'sel-info', head);
    el('div', 'sel-name', info, displayName(world, e));
    el('div', 'sel-owner', info, t(`faction.${e.owner}.name`) === `faction.${e.owner}.name` ? '' : t(`faction.${e.owner}.name`));
    const hp = el('div', 'bar hp', info);
    el('div', 'bar-fill', hp);
    el('div', 'bar-text', hp);
    if (e.kind === 'unit') {
      const mo = el('div', 'bar morale', info);
      el('div', 'bar-fill', mo);
      el('div', 'bar-text', mo);
      el('div', 'sel-stats', this.body);
    }
    el('div', 'sel-status', this.body);
    if (e.kind === 'building') el('div', 'sel-queue', this.body);
  }

  private refreshSingle(world: World, e: Entity) {
    const q = <T extends Element>(s: string) => this.body.querySelector(s) as T | null;
    const hpF = q<HTMLDivElement>('.hp .bar-fill');
    if (hpF) {
      hpF.style.width = `${Math.max(0, (e.hp / e.maxHp) * 100)}%`;
      setText(q<HTMLDivElement>('.hp .bar-text')!, `${Math.ceil(e.hp)} / ${e.maxHp}`);
    }
    const moF = q<HTMLDivElement>('.morale .bar-fill');
    if (moF && e.morale !== undefined) {
      moF.style.width = `${e.morale}%`;
      setText(q<HTMLDivElement>('.morale .bar-text')!, `${t('ui.morale')} ${Math.round(e.morale)}`);
    }
    const stats = q<HTMLDivElement>('.sel-stats');
    if (stats && e.kind === 'unit') {
      const def = world.data.units.get(e.type)!;
      setText(
        stats,
        `${t('ui.atk')} ${unitStat(world, e, 'atk')}${t('ui.paren', { x: t('atk.' + def.atkType) })} · ${t('ui.armor')} ${unitStat(world, e, 'armor')}${t('ui.paren', { x: t('armor.' + def.armorType) })} · ${t('ui.range')} ${unitStat(world, e, 'range')} · ${t('ui.speed_stat')} ${unitStat(world, e, 'speed')}`,
      );
    }
    const status = q<HTMLDivElement>('.sel-status');
    if (status) {
      const parts: string[] = [];
      if (e.kind === 'unit') {
        parts.push(t('order.' + (e.order?.type ?? 'idle')));
        if (e.carrying) parts.push(t('ui.carrying', { amount: Math.floor(e.carrying.amount), res: t('resource.' + e.carrying.resource) }));
        if (e.stranded) parts.push(t('ui.stranded'));
        const def = world.data.units.get(e.type)!;
        if (e.cargo !== undefined || def.traits.some((x) => x.startsWith('transport_')))
          parts.push(t('ui.cargo', { n: cargoPop(world, e), max: capacityOf(world, e) }));
        if (def.traits.includes('must_deploy'))
          parts.push((e.deployTicks ?? 0) >= world.rules.combat.traits.must_deploy.seconds * world.ticksPerSecond ? t('ui.deployed') : t('ui.deploying'));
        if (def.powderPerShot > 0 && !hasPowder(world, e)) parts.push(t('ui.no_powder'));
      } else if (e.kind === 'building') {
        if ((e.built ?? 1) < 1) parts.push(t('ui.constructing', { p: Math.floor((e.built ?? 0) * 100) }));
        const cap = (world.data.buildings.get(e.type) as { garrison: number; tuntianCapacity?: number });
        const max = cap.tuntianCapacity ?? cap.garrison;
        if (max) parts.push(t('ui.garrison', { n: e.garrisoned?.length ?? 0, max }));
        if (e.popBlocked) parts.push(t('ui.pop_blocked'));
        if (e.captureTicks) parts.push(t('ui.capture', { p: Math.floor((e.captureTicks / (world.rules.capture.seconds * world.ticksPerSecond)) * 100) }));
        if (e.type === 'mine' && e.mineLength) parts.push(t('ui.mine_progress', { p: Math.floor((e.mineTicks ?? 0) / (world.rules.siege.mine.secondsPerTile * world.ticksPerSecond)), n: e.mineLength }));
      } else if (e.amount !== undefined) parts.push(`${Math.floor(e.amount)} / ${e.maxAmount}`);
      setText(status, parts.join(' · '));
    }
    const queue = q<HTMLDivElement>('.sel-queue');
    if (queue && e.queue) {
      const sig = e.queue.map((i) => i.id).join(',');
      if (queue.dataset.sig !== sig) {
        queue.dataset.sig = sig;
        queue.replaceChildren();
        e.queue.forEach((item, i) => {
          const slot = el('button', 'q-item', queue);
          const def = item.kind === 'unit' ? world.data.units.get(item.id)! : world.data.techs.get(item.id)!;
          el('span', 'q-name', slot, t(def.nameKey));
          el('div', 'q-prog', slot);
          slot.title = t('cmd.cancel');
          slot.onclick = () => this.onCancel?.(e.id, i);
        });
      }
      e.queue.forEach((item, i) => {
        const p = queue.children[i]?.querySelector('.q-prog') as HTMLDivElement | null;
        if (p) p.style.width = `${item.started ? (1 - item.remaining / item.total) * 100 : 0}%`;
      });
    }
  }

  private buildMulti(world: World, ents: Entity[]) {
    const grid = el('div', 'sel-grid', this.body);
    for (const e of ents.slice(0, 40)) {
      const b = el('button', `sel-cell owner-${e.owner}`, grid, displayName(world, e).slice(0, 1));
      b.title = displayName(world, e);
      b.dataset.id = String(e.id);
      el('div', 'cell-hp', b);
      b.onclick = () => this.onPick?.(e.id);
    }
  }

  private refreshMulti(ents: Entity[]) {
    const cells = this.body.querySelectorAll<HTMLButtonElement>('.sel-cell');
    cells.forEach((c, i) => {
      const e = ents[i];
      if (!e) return;
      const f = e.hp / e.maxHp;
      const bar = c.querySelector('.cell-hp') as HTMLDivElement;
      bar.style.width = `${f * 100}%`;
      bar.style.background = f > 0.5 ? '#4caf50' : f > 0.25 ? '#ffc107' : '#f44336';
    });
  }
}
