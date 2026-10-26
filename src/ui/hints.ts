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
  // One card at a time (a small screen has no room for a stack): the next waits for "got it".
  const queue: string[] = [];
  let title: HTMLElement | null = null;
  const retitle = () => title && (title.textContent = t('hint.title') + (queue.length ? ` (+${queue.length})` : ''));
  const next = () => {
    if (box.childElementCount || !queue.length) return;
    const textKey = queue.shift()!;
    const card = el('div', 'hint-card panel', box);
    title = el('div', 'hint-title', card, '');
    retitle();
    el('div', 'hint-text', card, t(textKey));
    const ok = el('button', 'hint-ok', card, t('hint.ok'));
    ok.addEventListener('click', () => {
      card.remove();
      next();
    });
  };
  const show = (textKey: string) => {
    if (seen(textKey) || queue.includes(textKey)) return;
    markSeen(textKey);
    queue.push(textKey);
    next();
    retitle();
  };
  for (const h of hints) if (!h.on) show(h.textKey);
  const pending = hints.filter((h) => h.on);
  if (pending.length)
    s.eventHooks.push((_s, ev) => {
      for (const h of pending) if (h.on === ev.type) show(h.textKey);
    });
}
