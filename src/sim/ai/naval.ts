// Fleet plan steps for the 1683 scenarios. Step arguments use '/' between parameters; a squadron
// <tag> may join several tags with '+' (e.g. main+shi_lang: the main fleet and its flagship).
//   wait:<seconds>                                   hold the plan until the scenario clock passes it
//   sail:<tag>/<region>                              a tagged squadron sails on a region, fighting on the way
//   encircle:<tag>/<n>[/<radius>]                    squadron ships gang up on enemy ships within radius, n per target (五點梅花)
//   fire_attack:<tag>                                fire ships go for the nearest big enemy ship
//   harbor:<tag>/<region>                            ships keep to a harbour and engage whoever comes close
//   sortie_wind:<tag>/<region>/<home>/<bearing>      sail out while the wind blows from about <bearing>, else go home
//   flagship:<unitTag>/<region>[/<flag>]             a badly hit flagship (or once <flag> is set) breaks off to a region
//   drop:<verb>/<tag>                                stop a running background step (e.g. drop:sail/center)
import { distToEntity } from '../geometry';
import { isVisibleTo } from '../systems/fog';
import { isMoving } from '../systems/movement';
import type { Entity } from '../types';
import { centroid, inRegion, issue, regionCenter, type AiCtx } from './common';

type Result = 'done' | 'running' | 'persist';
type Handler = (ctx: AiCtx, arg: string) => Result;

const ids = (es: Entity[]) => es.map((e) => e.id);
const retreated = (ctx: AiCtx) => ((ctx.ai.mem.retreated ??= []) as number[]);
const isFire = (ctx: AiCtx, e: Entity) => ctx.world.data.units.get(e.type)!.traits.includes('suicide');

/** Afloat ships of this side with one of the tags (`main+shi_lang`); flagships that broke off excluded. */
function squadron(ctx: AiCtx, tags: string): Entity[] {
  const gone = retreated(ctx);
  const list = tags.split('+');
  return [...ctx.world.all()].filter((e) => e.kind === 'unit' && e.owner === ctx.owner && e.moveClass !== 'foot' && list.includes(e.tag ?? '') && !gone.includes(e.id));
}

/** Enemy ships this side can see. */
function enemyShips(ctx: AiCtx): Entity[] {
  const w = ctx.world;
  const foe = w.enemyOf(ctx.owner);
  return [...w.all()].filter((e) => e.kind === 'unit' && e.owner === foe && e.moveClass !== 'foot' && isVisibleTo(w, ctx.owner, e));
}

const wait: Handler = (ctx, arg) => (ctx.world.tick / ctx.world.ticksPerSecond >= Number(arg) ? 'done' : 'running');

const sail: Handler = (ctx, arg) => {
  const [tag, region] = arg.split('/');
  const [x, y] = regionCenter(ctx.world, region);
  // Fire ships sail with their squadron until fire_attack picks a victim for them.
  const idle = squadron(ctx, tag).filter((s) => s.order?.type !== 'attack' && !isMoving(s) && s.attackTarget === undefined && !inRegion(ctx.world, region, s));
  if (idle.length) issue(ctx, { type: 'attack_move', ids: ids(idle), x, y });
  return 'persist';
};

/** Splits a squadron into groups of n, each on one enemy ship (the weakest near the squadron first). */
const encircle: Handler = (ctx, arg) => {
  const [tag, nArg, rArg] = arg.split('/');
  const n = Math.max(1, Number(nArg ?? 5));
  const radius = Number(rArg ?? 14);
  const ships = squadron(ctx, tag).filter((s) => !isFire(ctx, s));
  if (!ships.length) return 'persist';
  const [cx, cy] = centroid(ships);
  const targets = enemyShips(ctx)
    .filter((e) => Math.hypot(e.x - cx, e.y - cy) < radius)
    .sort((a, b) => a.hp - b.hp || a.id - b.id);
  if (!targets.length) return 'persist';
  const free = [...ships];
  for (const t of targets) {
    if (!free.length) break;
    free.sort((a, b) => distToEntity(a.x, a.y, t) - distToEntity(b.x, b.y, t) || a.id - b.id);
    const group = free.splice(0, n).filter((s) => s.attackTarget !== t.id);
    if (group.length) issue(ctx, { type: 'attack', ids: ids(group), target: t.id });
  }
  return 'persist';
};

const fire_attack: Handler = (ctx, tag) => {
  const fires = squadron(ctx, tag).filter((s) => isFire(ctx, s) && s.order?.type !== 'attack');
  if (!fires.length) return 'persist';
  const targets = enemyShips(ctx).filter((e) => !isFire(ctx, e));
  for (const f of fires) {
    // Prefer big ships within reach; a fire ship is wasted on a small one far away.
    const t = targets
      .filter((e) => Math.hypot(e.x - f.x, e.y - f.y) < 12)
      .sort((a, b) => b.maxHp - a.maxHp || Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
    if (t) issue(ctx, { type: 'attack', ids: [f.id], target: t.id });
  }
  return 'persist';
};

const harbor: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [tag, region] = arg.split('/');
  const r = w.map.regions.find((x) => x.id === region)!;
  const nearHarbour = (e: Entity) => e.x >= r.x - 4 && e.y >= r.y - 4 && e.x < r.x + r.w + 4 && e.y < r.y + r.h + 4;
  const foes = enemyShips(ctx).filter(nearHarbour);
  const [x, y] = regionCenter(w, region);
  const leash = (e: Entity) => e.x >= r.x - 6 && e.y >= r.y - 6 && e.x < r.x + r.w + 6 && e.y < r.y + r.h + 6;
  const ships = squadron(ctx, tag).filter((s) => !isFire(ctx, s));
  // Harbour ships hold position (fire at whatever comes in range) instead of chasing on their own.
  const loose = ships.filter((s) => !s.hold);
  if (loose.length) issue(ctx, { type: 'stance', ids: ids(loose), hold: true });
  for (const s of ships) {
    // Never chase far from the harbour (and its guns); fight on the way back.
    if (!leash(s)) {
      if (!isMoving(s)) issue(ctx, { type: 'attack_move', ids: [s.id], x, y });
      continue;
    }
    if (foes.length) {
      if (s.attackTarget === undefined) {
        const t = foes.reduce((a, b) => (Math.hypot(a.x - s.x, a.y - s.y) <= Math.hypot(b.x - s.x, b.y - s.y) ? a : b));
        issue(ctx, { type: 'attack', ids: [s.id], target: t.id });
      }
    } else if (!inRegion(w, region, s) && !isMoving(s)) issue(ctx, { type: 'attack_move', ids: [s.id], x, y });
  }
  return 'persist';
};

/** Out while the wind is fair (within 60° of `bearing`), back to harbour when it turns. */
const sortie_wind: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [tag, region, home, bearing] = arg.split('/');
  const wind = w.ext.wind;
  const diff = wind ? Math.abs(((wind.from - Number(bearing) + 540) % 360) - 180) : 180;
  const fair = diff <= 60;
  const mem = ctx.ai.mem as Record<string, unknown>;
  if (mem[`sortie_${tag}`] !== fair) {
    mem[`sortie_${tag}`] = fair;
    const ships = squadron(ctx, tag).filter((s) => !isFire(ctx, s));
    const [x, y] = regionCenter(w, fair ? region : home);
    if (ships.length) issue(ctx, { type: fair ? 'attack_move' : 'move', ids: ids(ships), x, y });
    return 'persist';
  }
  // Keep harbour duty once back home.
  if (!fair) return harbor(ctx, `${tag}/${home}`);
  return sail(ctx, `${tag}/${region}`);
};

const flagship: Handler = (ctx, arg) => {
  const w = ctx.world;
  const [unitTag, region, flag] = arg.split('/');
  const f = [...w.all()].find((e) => e.tag === unitTag && e.owner === ctx.owner);
  if (!f) return 'persist';
  const gone = retreated(ctx);
  const threshold = (w.rules.ai as { flagshipRetreatHp?: number }).flagshipRetreatHp ?? 0.45;
  if (!gone.includes(f.id) && (f.hp < f.maxHp * threshold || (flag && w.ext.flags[flag]))) gone.push(f.id);
  if (gone.includes(f.id) && !inRegion(w, region, f) && !isMoving(f)) {
    const [x, y] = regionCenter(w, region);
    issue(ctx, { type: 'move', ids: [f.id], x, y });
  }
  return 'persist';
};

const drop: Handler = (ctx, arg) => {
  const [verb, tag] = arg.split('/');
  const head = `${verb}:${tag}`;
  // Matches the step with or without extra joined tags (sail:center+shi_lang/...).
  ctx.ai.background = ctx.ai.background.filter((b) => !(b === head || b.startsWith(`${head}/`) || b.startsWith(`${head}+`)));
  return 'done';
};

export const NAVAL_STEPS: Record<string, Handler> = { wait, sail, encircle, fire_attack, harbor, sortie_wind, flagship, drop };
