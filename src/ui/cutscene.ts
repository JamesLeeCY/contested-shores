// Cutscenes (spec §11 stage 7: static illustration + text, skippable).
import cutscenes from '../../data/cutscenes.json';
import { el } from './dom';
import { t } from './i18n';
import { cutArtSvg } from './cut-art';

interface CutsceneDef {
  titleKey: string;
  art: string;
  lines: string[];
}
const DEFS = cutscenes as Record<string, CutsceneDef>;

/** Shows a cutscene; resolves when the player finishes or skips it. */
export function playCutscene(parent: HTMLElement, id: string): Promise<void> {
  const def = DEFS[id];
  if (!def) return Promise.resolve();
  return new Promise((resolve) => {
    const root = el('div', 'cutscene', parent);
    const card = el('div', 'cut-card', root);
    el('div', `cut-art art-${def.art}`, card).innerHTML = cutArtSvg(def.art);
    el('h2', 'cut-title', card, t(def.titleKey));
    const text = el('div', 'cut-text', card);
    const bar = el('div', 'cut-bar', card);
    const skip = el('button', 'cut-skip', bar, t('cut.skip'));
    const next = el('button', 'cut-next', bar, t('cut.next'));
    let i = 0;
    const show = () => {
      el('p', 'cut-line', text, t(def.lines[i]));
      next.focus();
    };
    const close = () => {
      window.removeEventListener('keydown', key, true);
      root.remove();
      resolve();
    };
    const advance = () => {
      i++;
      if (i >= def.lines.length) close();
      else show();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === ' ' || e.key === 'Enter') advance();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', key, true);
    skip.onclick = close;
    next.onclick = advance;
    root.onclick = (e) => e.target === root && advance();
    show();
  });
}
