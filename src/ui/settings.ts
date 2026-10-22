// Player settings (spec §11 stage 8: volume, scroll speed, game speed, colour-blind mode).
import { el } from './dom';
import { t } from './i18n';

const KEY = 'tayouan1661.settings';

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  scrollSpeed: number;
  gameSpeed: number;
  edgeScroll: boolean;
  colorblind: boolean;
}

const DEFAULTS: Settings = { master: 0.7, music: 0.5, sfx: 0.8, scrollSpeed: 1, gameSpeed: 1, edgeScroll: true, colorblind: false };

export const settings: Settings = { ...DEFAULTS, ...read() };
const listeners: ((s: Settings) => void)[] = [];

function read(): Partial<Settings> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
  } catch {
    return {};
  }
}

/** Subscribes (and applies now); returns an unsubscribe function. */
export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.push(fn);
  fn(settings);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function updateSettings(patch: Partial<Settings>) {
  Object.assign(settings, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not persisted (private mode); still applies to this page.
  }
  for (const fn of listeners) fn(settings);
}

export function openSettings(parent: HTMLElement, onClose?: () => void) {
  const root = el('div', 'menu', parent);
  const card = el('div', 'menu-card settings', root);
  el('h2', 'menu-title', card, t('settings.title'));
  const slider = (key: 'master' | 'music' | 'sfx' | 'scrollSpeed', min: number, max: number, stepv: number) => {
    const row = el('label', 'menu-row', card);
    el('span', 'menu-label wide', row, t(`settings.${key}`));
    const input = el('input', '', row);
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(stepv), value: String(settings[key]) });
    const out = el('span', 'settings-val', row, settings[key].toFixed(1));
    input.oninput = () => {
      updateSettings({ [key]: Number(input.value) } as Partial<Settings>);
      out.textContent = Number(input.value).toFixed(1);
    };
  };
  slider('master', 0, 1, 0.1);
  slider('music', 0, 1, 0.1);
  slider('sfx', 0, 1, 0.1);
  slider('scrollSpeed', 0.4, 2.5, 0.1);
  const speedRow = el('div', 'menu-row', card);
  el('span', 'menu-label wide', speedRow, t('settings.gameSpeed'));
  for (const v of [0.5, 1, 1.5, 2]) {
    const b = el('button', 'menu-toggle' + (settings.gameSpeed === v ? ' on' : ''), speedRow, `${v}×`);
    b.onclick = () => {
      updateSettings({ gameSpeed: v });
      for (const x of speedRow.querySelectorAll('button')) x.classList.toggle('on', x === b);
    };
  }
  const toggle = (key: 'edgeScroll' | 'colorblind') => {
    const row = el('label', 'menu-row', card);
    const input = el('input', '', row);
    input.type = 'checkbox';
    input.checked = settings[key];
    el('span', '', row, t(`settings.${key}`));
    input.onchange = () => updateSettings({ [key]: input.checked } as Partial<Settings>);
  };
  toggle('edgeScroll');
  toggle('colorblind');
  const close = el('button', 'menu-btn primary', card, t('codex.close'));
  const done = () => {
    root.remove();
    onClose?.();
  };
  close.onclick = done;
}
