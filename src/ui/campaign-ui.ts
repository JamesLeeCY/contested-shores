// Campaign-system UI: diplomacy panel and buttons (spec §4.9, §8.4 "決策透明"), VOC castle morale
// and supply countdown (§9.1), typhoon overlay (§4.10), event messages, sandbox panel (§11 stage 5).
import type { PartyState } from '../sim/state';
import type { SimEvent } from '../sim/types';
import type { World } from '../sim/world';
import { canDiplo, cooldownLeft, diploCost, ensureParties, partyOfEntity, SETTLERS, type DiploAction } from '../sim/systems/diplomacy';
import { supplySecondsLeft } from '../sim/systems/supply';
import { buttonProviders } from './commands';
import { el, setText } from './dom';
import { formatTime } from './hud';
import { t } from './i18n';
import type { Session } from './session';

export function partyName(p: PartyState) {
  return p.id === SETTLERS ? t('faction.faction_settlers.name') : t(`village.${p.id}.name`);
}

const factionName = (f: string) => t(`faction.${f}.name`);

/** The party whose building/unit is the only thing selected, if any. */
function selectedParty(s: Session): PartyState | undefined {
  if (s.selected.size !== 1) return undefined;
  const e = s.world.get([...s.selected][0]);
  return e ? partyOfEntity(s.world, e) : undefined;
}

const ACTIONS: { action: DiploAction; key: string; parties: 'villages' | 'settlers' | 'all'; owner?: string }[] = [
  { action: 'gift_grain', key: 'G', parties: 'all' },
  { action: 'gift_deerskin', key: 'H', parties: 'all' },
  { action: 'pacify', key: 'J', parties: 'all', owner: 'faction_zheng' },
  { action: 'request_warriors', key: 'R', parties: 'villages' },
  { action: 'raid', key: 'T', parties: 'villages' },
  { action: 'requisition', key: 'Q', parties: 'settlers', owner: 'faction_voc' },
];

buttonProviders.push((ctx) => {
  const s = ctx.session;
  const p = selectedParty(s);
  if (!p || ctx.mode !== 'root') return [];
  const w = s.world;
  return ACTIONS.filter(
    (a) => (a.parties === 'all' || (a.parties === 'settlers') === (p.id === SETTLERS)) && (!a.owner || a.owner === s.player),
  )
    .filter((a) => a.action !== 'requisition' || w.chapter === 1)
    .map((a) => {
      const err = canDiplo(w, s.player, p.id, a.action);
      const cd = cooldownLeft(w, p, a.action, s.player);
      return {
        id: 'diplo:' + a.action,
        label: t('diplo.' + a.action),
        hotkey: a.key,
        cost: diploCost(w, a.action),
        disabled: !!err,
        reason: err === 'unit' ? t('diplo.need_unit') : err === 'cooldown' ? t('diplo.cooldown', { s: Math.ceil(cd / w.ticksPerSecond) }) : err ? t('err.' + err) : '',
        run: () => s.issue({ type: 'diplomacy', owner: s.player, party: p.id, action: a.action }),
      };
    });
});

export class DiplomacyPanel {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', 'diplo panel', parent);
    this.root.style.display = 'none';
  }

  update(s: Session) {
    const p = selectedParty(s);
    this.root.style.display = p ? 'block' : 'none';
    if (!p) return;
    const w = s.world;
    const state = p.ally
      ? t('diplo.state.allied', { faction: factionName(p.ally) })
      : p.hostile.length
        ? t('diplo.state.hostile', { faction: p.hostile.map(factionName).join('、') })
        : t('diplo.state.neutral');
    const rows = ['faction_zheng', 'faction_voc']
      .map((f) => {
        const v = Math.round(p.favor[f] ?? 0);
        return `<div class="favor-row"><span>${factionName(f)}</span><div class="bar favor"><div class="bar-fill" style="width:${v}%"></div><div class="bar-text">${v}</div></div></div>`;
      })
      .join('');
    const log = p.log
      .filter((l) => l.reason !== 'drift')
      .slice(0, w.rules.diplomacy.logSize)
      .map((l) => `<li>${factionName(l.faction)} ${l.delta > 0 ? '+' : ''}${Math.round(l.delta)}（${t('reason.' + l.reason)}）</li>`)
      .join('');
    const html = `<div class="diplo-title">${partyName(p)} · ${state}</div>${rows}<div class="diplo-log-title">${t('diplo.recent')}</div><ul class="diplo-log">${log || '<li>—</li>'}</ul>`;
    if (this.root.innerHTML !== html) this.root.innerHTML = html;
  }
}

/** VOC: castle morale bar + supply countdown; Zheng: northern settlers. */
export class FactionHud {
  readonly root: HTMLDivElement;
  private morale: HTMLDivElement;
  private moraleFill: HTMLDivElement;
  private moraleText: HTMLDivElement;
  private supply: HTMLDivElement;
  private extra: HTMLDivElement;

  constructor(parent: HTMLElement, player: string) {
    this.root = el('div', 'faction-hud panel', parent);
    this.morale = el('div', 'bar castle', this.root);
    this.moraleFill = el('div', 'bar-fill', this.morale);
    this.moraleText = el('div', 'bar-text', this.morale);
    this.supply = el('div', 'hud-line', this.root);
    this.extra = el('div', 'hud-line', this.root);
    if (player !== 'faction_voc') {
      this.morale.style.display = 'none';
      this.supply.style.display = 'none';
    }
  }

  update(w: World, player: string, reliefSeconds: number | null) {
    const f = w.faction('faction_voc');
    if (player === 'faction_voc' && f) {
      this.moraleFill.style.width = `${f.castleMorale}%`;
      this.moraleFill.style.background = f.castleMorale > 50 ? '#5c8ae6' : f.castleMorale > 25 ? '#ffc107' : '#f44336';
      setText(this.moraleText, `${t('ui.castle_morale')} ${Math.round(f.castleMorale)}`);
      setText(this.supply, t('ui.supply_in', { s: formatTime(supplySecondsLeft(w)) }) + (reliefSeconds !== null ? ` · ${t('ui.relief_in', { s: formatTime(reliefSeconds) })}` : ''));
    }
    const north = w.ext.tatu.northern[player] ?? 0;
    const parts: string[] = [];
    if (north) parts.push(t('ui.northern', { n: north }));
    if (w.weather.active) parts.push(t('ui.typhoon'));
    setText(this.extra, parts.join(' · '));
    this.root.style.display = player === 'faction_voc' || parts.length ? 'flex' : 'none';
  }
}

/** Dark storm tint with rain streaks while a typhoon blows. */
export class TyphoonOverlay {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement) {
    this.root = el('div', 'typhoon', parent);
  }
  update(w: World) {
    this.root.classList.toggle('active', w.weather.active);
  }
}

export function campaignMessage(w: World, player: string, ev: SimEvent): [string, 'info' | 'warn' | 'good'] | null {
  const e = ev as Record<string, unknown> & { type: string };
  const party = typeof e.party === 'string' ? w.ext.parties[e.party] : undefined;
  const mine = e.faction === player || e.owner === player;
  switch (e.type) {
    case 'disease':
      if (!e.n) return null;
      return e.owner === player ? [t('msg.disease', { n: e.n as number }), 'warn'] : [t('msg.disease_enemy', { n: e.n as number }), 'info'];
    case 'supply_arrived':
      return [t('msg.supply_arrived', { grain: e.grain as number, powder: e.powder as number }), player === 'faction_voc' ? 'good' : 'warn'];
    case 'supply_blocked':
      return [t('msg.supply_blocked'), player === 'faction_voc' ? 'warn' : 'good'];
    case 'supply_dispatched':
      return [t('msg.supply_dispatched'), 'info'];
    case 'supply_sunk':
      return [t('msg.supply_sunk'), player === 'faction_voc' ? 'warn' : 'good'];
    case 'typhoon_warning':
      return [t('msg.typhoon_warning'), 'warn'];
    case 'typhoon_start':
      return [t('msg.typhoon_start'), 'warn'];
    case 'typhoon_end':
      return [t('msg.typhoon_end'), 'info'];
    case 'party_joined':
      if (!party) return null;
      return party.id === SETTLERS
        ? [t('msg.settlers_joined', { faction: factionName(e.faction as string) }), mine ? 'good' : 'warn']
        : [t('msg.village_joined', { village: partyName(party), faction: factionName(e.faction as string) }), mine ? 'good' : 'warn'];
    case 'party_left':
      if (!party) return null;
      return party.id === SETTLERS
        ? [t('msg.settlers_left', { faction: factionName(e.faction as string) }), 'warn']
        : [t('msg.village_left', { village: partyName(party), faction: factionName(e.faction as string) }), mine ? 'warn' : 'good'];
    case 'party_hostile':
      return party ? [t('msg.village_hostile', { village: partyName(party), faction: factionName(e.faction as string) }), mine ? 'warn' : 'info'] : null;
    case 'party_neutral':
      return party ? [t('msg.village_neutral', { village: partyName(party), faction: factionName(e.faction as string) }), 'info'] : null;
    case 'village_raid':
      return mine && party ? [t('msg.village_raid', { village: partyName(party) }), 'warn'] : null;
    case 'warriors_lent':
      return mine && party ? [t('msg.warriors_arrived', { village: partyName(party), n: e.n as number }), 'good'] : null;
    case 'tatu_ambush':
      return [t('msg.tatu_ambush', { n: e.n as number }), mine ? 'warn' : 'info'];
    case 'tatu_safe':
      return mine ? [t('msg.tatu_safe', { n: e.n as number }), 'good'] : null;
    case 'requisition':
      return mine ? [t('msg.requisition', { grain: e.grain as number }), 'good'] : null;
    case 'captured':
      return [t('msg.captured', { name: t(w.data.buildings.get(e.building as string)!.nameKey), faction: factionName(e.to as string) }), e.to === player ? 'good' : 'warn'];
    case 'mine_exploded':
      return [t('msg.mine_exploded'), 'warn'];
    case 'mine_detected':
      return mine ? [t('msg.mine_detected'), 'warn'] : null;
    default:
      return null;
  }
}

export class SandboxPanel {
  readonly root: HTMLDivElement;
  constructor(parent: HTMLElement, s: Session) {
    this.root = el('div', 'sandbox panel', parent);
    el('div', 'sandbox-title', this.root, t('sandbox.title'));
    const actions: [string, string, (string | number)?][] = [
      ['next_day', 'sandbox.next_day'],
      ['supply', 'sandbox.supply'],
      ['typhoon', 'sandbox.typhoon'],
      ['tatu', 'sandbox.tatu'],
      ['favor', 'sandbox.favor_up', 'sinkan:20'],
      ['favor', 'sandbox.favor_down', 'sinkan:-20'],
      ['settlers', 'sandbox.settlers'],
      ['stage', 'sandbox.stage'],
      ['resources', 'sandbox.resources'],
    ];
    for (const [action, key, arg] of actions) {
      const b = el('button', 'sandbox-btn', this.root, t(key));
      b.onclick = () => s.issue({ type: 'sandbox', owner: s.player, action, arg });
    }
  }
}

export function installCampaignUi(s: Session) {
  ensureParties(s.world);
  const diplo = new DiplomacyPanel(s.ui);
  const hud = new FactionHud(s.clocks.extra, s.player);
  const storm = new TyphoonOverlay(s.ui);
  if (s.world.opts.sandbox) new SandboxPanel(s.ui, s);
  s.eventHooks.push((ss, ev) => {
    const m = campaignMessage(ss.world, ss.player, ev);
    if (m) ss.messages.push(m[0], m[1]);
  });
  s.frameHooks.push((ss) => {
    diplo.update(ss);
    hud.update(ss.world, ss.player, ss.reliefSeconds?.() ?? null);
    storm.update(ss.world);
  });
}
