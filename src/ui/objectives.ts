// Objective panel (top left, collapsible, spec §9.1) with scenario choices (談判投降, 議和).
import { availableChoices } from '../sim/scenario/runtime';
import { objectives } from '../sim/scenario/triggers';
import { el } from './dom';
import { t } from './i18n';
import type { Session } from './session';

export class ObjectivePanel {
  readonly root: HTMLDivElement;
  private list: HTMLDivElement;
  private choices: HTMLDivElement;
  private sig = '';
  private collapsed = false;

  constructor(private readonly s: Session) {
    this.root = el('div', 'objectives panel', s.ui);
    const head = el('div', 'obj-head', this.root, t('ui.objectives'));
    head.onclick = () => {
      this.collapsed = !this.collapsed;
      this.root.classList.toggle('collapsed', this.collapsed);
    };
    this.list = el('div', 'obj-list', this.root);
    this.choices = el('div', 'obj-choices', this.root);
  }

  update() {
    const w = this.s.world;
    const mine = objectives(w).filter((o) => o.faction === this.s.player);
    const choices = availableChoices(w, this.s.player);
    const sig = JSON.stringify([mine, choices.map((c) => c.id)]);
    this.root.style.display = mine.length || choices.length ? 'block' : 'none';
    if (sig === this.sig) return;
    this.sig = sig;
    this.list.replaceChildren();
    for (const o of mine) {
      const row = el('div', `obj obj-${o.status}${o.primary ? '' : ' obj-secondary'}`, this.list);
      el('span', 'obj-mark', row, o.status === 'done' ? '✔' : o.status === 'failed' ? '✘' : '◆');
      el('span', 'obj-text', row, t(o.textKey));
    }
    this.choices.replaceChildren();
    for (const c of choices) {
      const b = el('button', 'obj-choice', this.choices, t(c.labelKey));
      b.onclick = () => this.s.issue({ type: 'choice', owner: this.s.player, id: c.id });
    }
  }
}
