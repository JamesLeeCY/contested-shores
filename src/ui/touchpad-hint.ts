// Offers touchpad mode once the wheel events look like a laptop touchpad: pinch zoom (Ctrl + wheel
// with fractional deltas), sideways two-finger scrolling, or bursts of small pixel deltas. A mouse
// wheel sends fewer, larger notches. Asked once; "no thanks" is remembered.
import { el } from './dom';
import { t } from './i18n';
import { life } from './lifecycle';
import { settings, updateSettings } from './settings';

const KEY = 'tayouan1661.touchpadHint';
const THRESHOLD = 12;
const BURST_MS = 1500;

type Wheel = Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'shiftKey'>;

/** How strongly one wheel event suggests a touchpad (0 = looks like a mouse wheel). */
export function touchpadScore(e: Wheel): number {
  if (e.deltaMode !== 0) return 0; // line/page deltas come from mouse wheels
  if (e.ctrlKey && !Number.isInteger(e.deltaY)) return 4; // pinch
  if (e.deltaX !== 0 && !e.shiftKey) return 3; // sideways two-finger scroll
  const d = Math.abs(e.deltaY);
  return d > 0 && d < 40 ? 1 : 0;
}

/** Accumulates scores; scores decay when the gesture pauses so slow mouse scrolling never adds up. */
export class TouchpadDetector {
  private score = 0;
  private last = -Infinity;

  feed(e: Wheel, now: number): boolean {
    const s = touchpadScore(e);
    if (!s) return false;
    if (now - this.last > BURST_MS) this.score = Math.min(this.score, THRESHOLD / 2);
    this.last = now;
    this.score += s;
    return this.score >= THRESHOLD;
  }
}

function dismissed() {
  try {
    return localStorage.getItem(KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function installTouchpadHint(canvas: HTMLElement, ui: HTMLElement) {
  if (settings.touchpad || dismissed()) return;
  const detector = new TouchpadDetector();
  let shown = false;
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (shown || settings.touchpad || !detector.feed(e, performance.now())) return;
      shown = true;
      show(ui);
    },
    { signal: life.signal },
  );
}

function show(ui: HTMLElement) {
  const box = el('div', 'touchpad-hint panel', ui);
  el('div', 'touchpad-hint-text', box, t('touchpad.hint'));
  const row = el('div', 'touchpad-hint-row', box);
  const yes = el('button', 'menu-btn primary', row, t('touchpad.enable'));
  const no = el('button', 'menu-btn', row, t('touchpad.no'));
  yes.onclick = () => {
    updateSettings({ touchpad: true });
    box.remove();
  };
  no.onclick = () => {
    try {
      localStorage.setItem(KEY, 'dismissed');
    } catch {
      // Asked again next session.
    }
    box.remove();
  };
}
