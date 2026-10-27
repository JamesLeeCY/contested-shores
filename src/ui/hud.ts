// Clock group (top right, spec §9.1): tide ring, game day, chapter timer, speed/pause.
import { tideSecondsLeft, tidesMatter } from '../sim/systems/tide';
import { windVector } from '../sim/systems/wind';
import type { World } from '../sim/world';
import { t } from './i18n';

const TIDE_COLORS: Record<string, string> = { rising: '#4fa3c7', high: '#1f5f8b', falling: '#9cc3a8', low: '#c9b27a' };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement) => {
  const e = document.createElement(tag);
  e.className = cls;
  parent?.appendChild(e);
  return e;
};

export class ClockHud {
  readonly root: HTMLDivElement;
  private ring: SVGSVGElement;
  private needle: SVGLineElement;
  private tideText: HTMLDivElement;
  private dayText: HTMLDivElement;
  private windText: HTMLDivElement;
  private timerText: HTMLDivElement;
  private speedText: HTMLDivElement;
  private cheatText: HTMLDivElement;
  readonly extra: HTMLDivElement;

  constructor(parent: HTMLElement, world: World) {
    this.root = el('div', 'clocks panel', parent);
    const ns = 'http://www.w3.org/2000/svg';
    this.ring = document.createElementNS(ns, 'svg');
    this.ring.setAttribute('viewBox', '-32 -32 64 64');
    this.ring.classList.add('tide-ring');
    const phases = world.rules.tide.phases;
    const total = phases.reduce((s, p) => s + p.seconds, 0);
    let acc = 0;
    for (const p of phases) {
      const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
      acc += p.seconds;
      const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
      const path = document.createElementNS(ns, 'path');
      const r = 26;
      path.setAttribute('d', `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${r * Math.cos(a1)} ${r * Math.sin(a1)}`);
      path.setAttribute('stroke', TIDE_COLORS[p.id]);
      path.setAttribute('stroke-width', '8');
      path.setAttribute('fill', 'none');
      this.ring.appendChild(path);
    }
    this.needle = document.createElementNS(ns, 'line');
    this.needle.setAttribute('x1', '0');
    this.needle.setAttribute('y1', '0');
    this.needle.setAttribute('stroke', '#fff');
    this.needle.setAttribute('stroke-width', '2.5');
    this.ring.appendChild(this.needle);
    this.root.appendChild(this.ring);
    const info = el('div', 'clock-info', this.root);
    this.tideText = el('div', 'tide-text', info);
    // The land campaigns hide the dial.
    if (!tidesMatter(world)) {
      this.ring.style.display = 'none';
      this.tideText.style.display = 'none';
    }
    this.windText = el('div', 'wind-text', info);
    this.dayText = el('div', 'day-text', info);
    this.timerText = el('div', 'timer-text', info);
    this.speedText = el('div', 'speed-text', info);
    this.cheatText = el('div', 'cheat-badge', info);
    this.cheatText.textContent = t('cheat.badge');
    this.cheatText.style.display = 'none';
    this.extra = el('div', 'clock-extra', parent);
  }

  update(world: World, speed: number, paused: boolean, timerSeconds: number | null) {
    const phases = world.rules.tide.phases;
    const total = phases.reduce((s, p) => s + p.seconds, 0);
    const before = phases.slice(0, world.tidePhase).reduce((s, p) => s + p.seconds, 0);
    const a = ((before + world.tideTick / world.ticksPerSecond) / total) * Math.PI * 2 - Math.PI / 2;
    this.needle.setAttribute('x2', String(22 * Math.cos(a)));
    this.needle.setAttribute('y2', String(22 * Math.sin(a)));
    this.tideText.textContent = `${t('tide.' + world.tidePhaseId)} ${Math.ceil(tideSecondsLeft(world))}s`;
    this.tideText.style.color = TIDE_COLORS[world.tidePhaseId];
    const wind = world.ext.wind;
    this.windText.style.display = wind ? '' : 'none';
    if (wind) {
      // Arrow points where the wind blows to, in screen space (map +x east, +y south; iso view).
      const [vx, vy] = windVector(wind.from);
      const deg = (Math.atan2((vx + vy) * 0.5, vx - vy) * 180) / Math.PI;
      setWind(this.windText, t('ui.wind', { dir: t(`wind.${compassName(wind.from)}`) }), deg);
    }
    this.dayText.textContent = t('ui.day', { n: world.day + 1 });
    this.timerText.textContent = timerSeconds === null ? '' : formatTime(timerSeconds);
    this.speedText.textContent = paused ? t('ui.paused') : t('ui.speed', { n: speed });
    this.speedText.classList.toggle('paused', paused);
    const cheated = Object.keys(world.ext.flags).some((k) => k.startsWith('cheated:'));
    this.cheatText.style.display = cheated ? '' : 'none';
  }
}

/** One of eight compass names (n, ne, …) for a bearing. */
export function compassName(deg: number): string {
  return ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

function setWind(box: HTMLDivElement, label: string, deg: number) {
  if (box.dataset.sig === `${label}|${Math.round(deg)}`) return;
  box.dataset.sig = `${label}|${Math.round(deg)}`;
  box.replaceChildren();
  const arrow = document.createElement('span');
  arrow.className = 'wind-arrow';
  arrow.textContent = '➤';
  arrow.style.transform = `rotate(${deg}deg)`;
  box.append(arrow, document.createTextNode(' ' + label));
}

export function formatTime(s: number) {
  const v = Math.max(0, Math.ceil(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
}
