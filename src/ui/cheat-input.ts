// The cheat line (after Age of Empires II's chat box): Enter opens it, Enter sends, Escape closes.
// On a phone, tapping the clock panel five times opens it. Only a recognised code is sent, as a
// `cheat` command; anything else just closes the line, as in the original.
import { cheatCode } from '../sim/cheats';
import { audio } from './audio';
import { el } from './dom';
import { t } from './i18n';
import { on } from './lifecycle';
import type { Session } from './session';

const TAPS = 5;
const TAP_WINDOW_MS = 3000;

export function installCheatInput(s: Session, ui: HTMLElement) {
  if (!s.player) return;
  const box = el('div', 'cheat-line', ui);
  const input = el('input', 'cheat-input', box);
  input.type = 'text';
  input.placeholder = t('cheat.placeholder');
  input.setAttribute('aria-label', t('cheat.placeholder'));
  input.autocomplete = 'off';
  input.spellcheck = false;
  box.style.display = 'none';

  const open = () => {
    box.style.display = '';
    input.value = '';
    input.focus();
  };
  const close = () => {
    box.style.display = 'none';
    input.blur();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter') {
      const code = cheatCode(input.value);
      if (code) s.issue({ type: 'cheat', owner: s.player, code });
      close();
    }
  });
  input.addEventListener('blur', () => setTimeout(() => document.activeElement !== input && close(), 0));
  on(window, 'keydown', (e) => {
    if (e.key !== 'Enter' || s.modal || box.style.display === '' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    e.preventDefault();
    open();
  });

  // Phones have no Enter key: five quick taps on the clock panel.
  let taps: number[] = [];
  s.clocks.root.addEventListener('pointerup', () => {
    const now = performance.now();
    taps = [...taps.filter((x) => now - x < TAP_WINDOW_MS), now];
    if (taps.length >= TAPS) {
      taps = [];
      open();
    }
  });

  // Horn when a vehicle arrives or is selected.
  s.eventHooks.push((ss, ev) => ev.type === 'horn' && ev.owner === ss.player && audio.horn());
  let hadVehicle = false;
  s.frameHooks.push((ss) => {
    const has = [...ss.selected].some((id) => {
      const e = ss.world.get(id);
      return !!e && e.kind === 'unit' && ss.world.data.units.get(e.type)!.traits.includes('cheat');
    });
    if (has && !hadVehicle) audio.horn();
    hadVehicle = has;
  });
}
