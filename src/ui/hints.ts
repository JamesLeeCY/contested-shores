// Mechanic hints (wind, supply lines, night, air raids…): a card explains a mechanic the first time
// a chapter uses it — at the start, or when its first event fires (e.g. the first air raid). Each
// hint is shown once per browser; storage may be unavailable, in which case it shows every time.
import { el } from './dom';
import { t } from './i18n';
import type { Session } from './session';

const KEY = 'contested.hint.';

function seen(id: string): boolean {
  try {
    return localStorage.getItem(KEY + id) === '1';
  } catch {
    return false;
  }
}

function markSeen(id: string) {
  try {
    localStorage.setItem(KEY + id, '1');
  } catch {
    /* private window: shown again next time */
  }
}

export function installHints(s: Session, parent: HTMLElement) {
  const hints = s.world.scenario?.hints ?? [];
  if (!hints.length || s.opts.spectate) return;
  const box = el('div', 'hints', parent);
  const show = (textKey: string) => {
    if (seen(textKey)) return;
    markSeen(textKey);
    const card = el('div', 'hint-card panel', box);
    el('div', 'hint-title', card, t('hint.title'));
    el('div', 'hint-text', card, t(textKey));
    const ok = el('button', 'hint-ok', card, t('hint.ok'));
    ok.addEventListener('click', () => card.remove());
  };
  for (const h of hints) if (!h.on) show(h.textKey);
  const pending = hints.filter((h) => h.on);
  if (pending.length)
    s.eventHooks.push((_s, ev) => {
      for (const h of pending) if (h.on === ev.type) show(h.textKey);
    });
}
