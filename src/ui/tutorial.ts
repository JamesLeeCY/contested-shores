// New-player tutorial: a guided session on the Taijiang map. Each step shows an instruction
// (and highlights the relevant part of the interface) and advances when the player has done it.
import type { Entity } from '../sim/types';
import type { World } from '../sim/world';
import { el } from './dom';
import { t } from './i18n';
import type { Session } from './session';

const Z = 'faction_zheng';
const V = 'faction_voc';
/** Where the tutorial camp stands (north Saccam, next to the eastern woods). */
export const TUTORIAL_CAMP: [number, number] = [124, 38];
const FLAG: [number, number] = [119.5, 44.5];

/** World setup for the tutorial: a camp, workers, a few soldiers, a junk on the lagoon shore. */
export function setupTutorial(w: World) {
  for (const f of w.factions.values()) f.stage = 2;
  Object.assign(w.faction(Z)!.resources, { grain: 500, wood: 250, powder: 60, deerskin: 40 });
  // Disease and upkeep would only distract here.
  w.rules.disease.chanceZheng = 0;
  w.rules.disease.chanceVoc = 0;
  w.ext.flags.supplyEnabled = false;
  w.spawnBuilding('camp_zheng', Z, TUTORIAL_CAMP[0], TUTORIAL_CAMP[1]);
  for (let i = 0; i < 5; i++) w.spawnUnit('laborer', Z, 123.5 + (i % 3), 43.5 + Math.floor(i / 3), 'tut_labor');
  for (let i = 0; i < 6; i++) w.spawnUnit('shield_soldier', Z, 118 + (i % 3) * 0.9, 40 + Math.floor(i / 3) * 0.9, 'tut_army');
  for (let i = 0; i < 4; i++) w.spawnUnit('archer_zheng', Z, 118 + (i % 2) * 0.9, 42.2 + Math.floor(i / 2) * 0.9, 'tut_army');
  w.spawnUnit('koxinga', Z, 121, 41, 'koxinga');
  w.spawnUnit('junk', Z, 108.5, 38.5, 'tut_junk');
}

interface Step {
  id: string;
  /** Interface element to outline (CSS selector), if any. */
  highlight?: string;
  /** Run once when the step starts. */
  enter?: (s: Session) => void;
  done: (s: Session) => boolean;
}

const units = (w: World, pred: (e: Entity) => boolean) => [...w.all()].filter((e) => e.kind === 'unit' && pred(e));
const near = (e: Entity, [x, y]: [number, number], r: number) => Math.hypot(e.x - x, e.y - y) <= r;

function steps(): Step[] {
  let cam0: [number, number] = [0, 0];
  let enemies: number[] = [];
  return [
    {
      id: 'camera',
      highlight: '.minimap',
      enter: (s) => (cam0 = [s.camera.cx, s.camera.cy]),
      done: (s) => Math.hypot(s.camera.cx - cam0[0], s.camera.cy - cam0[1]) > 6,
    },
    { id: 'select', highlight: '.selpanel', enter: (s) => s.camera.centerOn(121, 42), done: (s) => [...s.selected].some((id) => s.world.get(id)?.tag === 'tut_army') },
    { id: 'box', done: (s) => [...s.selected].filter((id) => s.world.get(id)?.tag === 'tut_army').length >= 5 },
    {
      id: 'move',
      enter: (s) => s.tutorialMarker?.(FLAG),
      done: (s) => units(s.world, (e) => e.tag === 'tut_army' && near(e, FLAG, 3)).length >= 5,
    },
    {
      id: 'gather',
      enter: (s) => s.tutorialMarker?.(null),
      done: (s) => units(s.world, (e) => e.tag === 'tut_labor' && e.order?.type === 'gather' && e.order.resource === 'wood').length >= 2,
    },
    { id: 'resources', highlight: '.resbar', done: (s) => s.world.faction(Z)!.resources.wood >= 260 },
    {
      id: 'build',
      highlight: '.cmdpanel',
      done: (s) => s.world.buildings().some((b) => b.type === 'barracks_zheng' && b.owner === Z),
    },
    { id: 'wait_build', done: (s) => s.world.buildings().some((b) => b.type === 'barracks_zheng' && (b.built ?? 1) >= 1) },
    { id: 'train', highlight: '.cmdpanel', done: (s) => units(s.world, (e) => e.type === 'shield_soldier' && e.tag !== 'tut_army').length >= 1 },
    {
      id: 'tide',
      highlight: '.clocks',
      enter: (s) => s.camera.centerOn(108, 38),
      done: (s) => units(s.world, (e) => e.tag === 'tut_junk' && e.x < 100).length >= 1,
    },
    {
      id: 'combat',
      enter: (s) => {
        const w = s.world;
        enemies = [0, 1, 2, 3].map((i) => w.spawnUnit('pikeman', V, 113 + (i % 2), 48 + Math.floor(i / 2), 'tut_enemy').id);
        // Let the player see them.
        s.camera.centerOn(116, 46);
      },
      done: (s) => enemies.every((id) => !s.world.get(id)),
    },
    {
      id: 'diplomacy',
      highlight: '.diplo',
      enter: (s) => {
        const c = s.world.buildings().find((b) => b.village === 'sinkan');
        if (c) s.camera.centerOn(c.x, c.y);
      },
      done: (s) => (s.world.ext.parties.sinkan?.log ?? []).some((l) => l.faction === Z && (l.reason === 'gift' || l.reason === 'pacify')),
    },
    { id: 'pause', done: (s) => s.stepper.paused },
    { id: 'done', done: () => false },
  ];
}

/** Runs the tutorial steps over a session; returns the panel element. */
export function runTutorial(s: Session, onFinish: () => void) {
  const list = steps();
  let i = -1;
  const box = el('div', 'tutorial panel', s.ui);
  const count = el('div', 'tut-count', box);
  const title = el('div', 'tut-title', box);
  const text = el('div', 'tut-text', box);
  const bar = el('div', 'tut-bar', box);
  const skip = el('button', 'menu-btn', bar, t('tutorial.skip_step'));
  const finish = el('button', 'menu-btn primary', bar, t('tutorial.finish'));
  finish.style.display = 'none';
  finish.onclick = onFinish;
  let lit: Element | null = null;
  const next = () => {
    lit?.classList.remove('tut-highlight');
    i++;
    const st = list[i];
    st.enter?.(s);
    count.textContent = t('tutorial.progress', { n: Math.min(i + 1, list.length - 1), total: list.length - 1 });
    title.textContent = t(`tutorial.${st.id}.title`);
    text.textContent = t(`tutorial.${st.id}.text`);
    lit = st.highlight ? s.ui.querySelector(st.highlight) : null;
    lit?.classList.add('tut-highlight');
    const last = st.id === 'done';
    skip.style.display = last ? 'none' : '';
    finish.style.display = last ? '' : 'none';
    s.world.emit({ type: 'tutorial_step', id: st.id });
  };
  skip.onclick = () => next();
  next();
  s.frameHooks.push((ss) => {
    const st = list[i];
    // The diplomacy panel only exists while a village is selected: re-find it every frame.
    if (st.highlight === '.diplo') {
      lit?.classList.remove('tut-highlight');
      lit = st.highlight ? ss.ui.querySelector(st.highlight) : null;
      lit?.classList.add('tut-highlight');
    }
    if (st.done(ss)) next();
  });
  return box;
}

/** Index of the current tutorial step id (for tests). */
export function tutorialStepIds() {
  return steps().map((s) => s.id);
}
