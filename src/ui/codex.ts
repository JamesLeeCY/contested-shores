// Codex (spec §9.4): units, buildings, people, places and source disputes. Each entry has an
// introduction, historical background, the game's trade-offs, disputes (if any) and sources.
import codex from '../../data/codex.json';
import { el } from './dom';
import { t } from './i18n';

interface Entry {
  id: string;
  category: string;
  dispute: boolean;
  sources: string[];
}
const ENTRIES = codex as Entry[];
const CATEGORIES = ['units', 'buildings', 'people', 'places', 'disputes', 'eggs'];

export function openCodex(parent: HTMLElement, onClose?: () => void, startAt?: string) {
  const root = el('div', 'codex', parent);
  const card = el('div', 'codex-card', root);
  const head = el('div', 'codex-head', card);
  el('h2', '', head, t('codex.title'));
  const close = el('button', 'menu-btn', head, t('codex.close'));
  const tabs = el('div', 'codex-tabs', card);
  const body = el('div', 'codex-body', card);
  const list = el('div', 'codex-list', body);
  const detail = el('div', 'codex-detail', body);

  const showEntry = (e: Entry) => {
    detail.replaceChildren();
    el('h3', '', detail, t(`codex.${e.id}.title`));
    if (e.dispute) el('span', 'codex-flag', detail, t('codex.disputed'));
    for (const sec of ['intro', 'history', 'design', ...(e.dispute ? ['dispute'] : [])]) {
      el('h4', '', detail, t(`codex.sec.${sec}`));
      el('p', sec === 'dispute' ? 'codex-dispute' : '', detail, t(`codex.${e.id}.${sec}`));
    }
    el('h4', '', detail, t('codex.sec.sources'));
    const ul = el('ul', 'codex-sources', detail);
    for (const s of e.sources) el('li', '', ul, t(s));
    for (const b of list.querySelectorAll('button')) b.classList.toggle('on', b.dataset.id === e.id);
  };
  const showCategory = (cat: string, select?: string) => {
    for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b.dataset.cat === cat);
    list.replaceChildren();
    const items = ENTRIES.filter((e) => e.category === cat);
    for (const e of items) {
      const b = el('button', 'codex-item', list, t(`codex.${e.id}.title`) + (e.dispute ? ' ⚑' : ''));
      b.dataset.id = e.id;
      b.onclick = () => showEntry(e);
    }
    showEntry(items.find((e) => e.id === select) ?? items[0]);
  };
  for (const c of CATEGORIES) {
    const b = el('button', 'menu-toggle', tabs, t(`codex.cat.${c}`));
    b.dataset.cat = c;
    b.onclick = () => showCategory(c);
  }
  const start = ENTRIES.find((e) => e.id === startAt);
  showCategory(start?.category ?? 'units', start?.id);
  const key = (ev: KeyboardEvent) => ev.key === 'Escape' && done();
  const done = () => {
    window.removeEventListener('keydown', key);
    root.remove();
    onClose?.();
  };
  window.addEventListener('keydown', key);
  close.onclick = done;
}
