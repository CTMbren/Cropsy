import type { BoardDef, Content, OrderTier } from './content';
import { CRITTERS, critterById, crittersOpen } from './critters';
import { addItem, grantXp, hasFlag, takeItems, unlockedCrops, type FarmState, type OrderState } from './farm';
import { fishingOpen } from './fishing';
import { addFriendship, friends, type FriendshipChange } from './friendship';
import { merchantHere } from './merchant';
import { fnv1a } from './save';
import { dayIndex, rng } from './time';

/**
 * The request board. A new order is posted every couple of hours (time away counts) until the
 * regular slots are full; orders never expire, and any regular order can be passed for free.
 * From level 6 there is also one gold Daily Special: three lines handed in one at a time, which
 * pays once all three are in. Everything is seeded from the tick or the day, so reopening the
 * app shows the same board.
 */

const board = (content: Content): BoardDef => content.board;
/** Regular slots on the board (the empty-board text uses it). */
export const boardSlots = (content: Content) => board(content).slots;
export const boardTickHours = (content: Content) => board(content).tick_hours;

/** The 2-hour tick number for local time `now`. */
export function boardTick(content: Content, now: number, offsetMin: number): number {
  return Math.floor((now - offsetMin * 60) / (board(content).tick_hours * 3600));
}

/** Unix seconds when the next order is posted. */
export function nextPostAt(content: Content, now: number, offsetMin: number): number {
  return (boardTick(content, now, offsetMin) + 1) * board(content).tick_hours * 3600 + offsetMin * 60;
}

export const isSpecial = (o: OrderState) => o.tier === 'special';
const isRegular = (o: OrderState) => !o.story && !isSpecial(o);
export const specialOpen = (state: FarmState, content: Content) => state.level >= board(content).special_level;

type Pick = { id: string; value: number; xp: number; grow?: number; kind: 'crop' | 'good' | 'honey' | 'fish' | 'sketch' };

/** A Special line that asks you to sketch a critter (Hazel's), not to hand in an item. */
export const SKETCH = 'sketch:';
export const isSketch = (id: string) => id.startsWith(SKETCH);

/** Is this line ready to hand in? (A sketch line is ready once that critter is in the Sketchbook.) */
export function lineReady(state: FarmState, id: string, n: number): boolean {
  if (isSketch(id)) return !!state.critters?.seen.includes(id.slice(SKETCH.length));
  return (state.inventory[id] ?? 0) >= n;
}

const itemsOnly = (wants: Record<string, number>) => Object.fromEntries(Object.entries(wants).filter(([id]) => !isSketch(id)));
const allReady = (state: FarmState, wants: Record<string, number>) => Object.entries(wants).every(([id, n]) => lineReady(state, id, n));

/** Goods the player can make: from buildings they own (the mill counts once it's turning). */
function makeableGoods(state: FarmState, content: Content): Pick[] {
  const out: Pick[] = [];
  for (const [id, def] of content.buildings) {
    const usable = state.buildings[id] && (def.where === 'farm' || hasFlag(state, `${id}_built`));
    if (!usable) continue;
    for (const r of def.recipes) {
      const g = content.goods.get(r.output);
      // goods made from honey (honey berry jam) stay off the board: honey is too slow to gather
      if (g && !r.inputs.honey) out.push({ id: g.id, value: g.sell, xp: r.xp, kind: 'good' });
    }
  }
  return out;
}

/** Everything an order may ask for right now, by kind. */
function pools(state: FarmState, content: Content) {
  const crops: Pick[] = unlockedCrops(state, content)
    .map((c) => ({ id: c.id, value: c.sell, xp: c.xp, grow: c.grow_s, kind: 'crop' as const }))
    .sort((a, b) => a.grow! - b.grow!);
  // honey is only asked for once you have some: it comes slowly, 5 pollen at a time
  const honey = crittersOpen(state, content) && (state.inventory.honey ?? 0) >= 1 && content.goods.get('honey');
  // only the shallows fish bite at any hour, so they're always catchable
  const fish = fishingOpen(state) ? ['minnow', 'perch', 'brook_trout', 'crayfish'].map((id) => content.goods.get(id)).filter((g) => !!g) : [];
  return {
    crops,
    goods: makeableGoods(state, content),
    honey: honey ? [{ id: 'honey', value: honey.sell, xp: 1, kind: 'honey' as const }] : [],
    fish: fish.map((g) => ({ id: g!.id, value: g!.sell, xp: 2, kind: 'fish' as const })),
  };
}

const usablePlots = (state: FarmState) => Object.keys(state.plots).filter((k) => !state.obstacles[k]).length;

/** How many to ask for: crops by share of the field, the rest in small counts. */
function qty(p: Pick, share: number, plots: number, r: () => number, tier: OrderTier): number {
  if (p.kind === 'crop') return Math.max(2, Math.round(plots * share * (0.6 + 0.4 * r())));
  const big = tier === 'special' ? 1 : 0;
  if (p.kind === 'sketch') return 1;
  if (p.kind === 'good') return 1 + big + (plots >= 49 && r() < 0.5 ? 1 : 0);
  // honey comes 5 pollen at a time from the meadow visitors, so it's asked for in ones and twos
  if (p.kind === 'honey') return 1 + (big && r() < 0.5 ? 1 : 0);
  return 2 + Math.floor(r() * 2); // fish
}

const pickFrom = <T>(xs: T[], r: () => number): T => xs[Math.floor(r() * xs.length)];

/** Prefer something the poster loves or likes (most of the time), else anything in the pool. */
function choose(pool: Pick[], villager: string, content: Content, r: () => number): Pick {
  const v = content.villagers.get(villager);
  const fav = pool.filter((p) => v?.loves?.includes(p.id) || v?.likes?.includes(p.id));
  return fav.length && r() < board(content).poster_pick ? pickFrom(fav, r) : pickFrom(pool, r);
}

function noteFor(content: Content, villager: string, item: string, r: () => number): string {
  const notes = board(content).posters[villager]?.notes ?? [];
  const name = content.cropById.get(item)?.name ?? content.goods.get(item)?.name ?? item;
  if (!notes.length) return '';
  // the item is lower case mid-sentence, capitalised when it starts one
  const lower = name.toLowerCase();
  return pickFrom(notes, r).replace(/\{item\}/g, (_m, at: number, text: string) => (/^$|[.!?]\s+$/.test(text.slice(0, at)) ? lower[0].toUpperCase() + lower.slice(1) : lower));
}

/** Villagers who post regular orders today: everyone you've met (Ziggy only while his cart is in town). */
function posters(state: FarmState, content: Content, day: number): string[] {
  const met = new Set(['goldie', ...friends(state, content)]);
  return [...met].filter((v) => board(content).posters[v] && (v !== 'ziggy' || merchantHere(content, day, state)));
}

function price(lines: [Pick, number][], mult: number) {
  let coins = 0;
  let xp = 2;
  for (const [p, n] of lines) {
    coins += p.value * n;
    xp += p.xp * n;
  }
  return { coins: Math.round(coins * mult), xp };
}

/** A critter you haven't sketched that your crops can draw in (never a secret one). */
function sketchTarget(state: FarmState, content: Content, crops: Pick[], r: () => number): Pick | null {
  if (!crittersOpen(state, content)) return null;
  const grown = new Set(crops.map((c) => c.id));
  const seen = new Set(state.critters?.seen ?? []);
  const can = CRITTERS.filter((x) => !x.secret && !seen.has(x.id) && (x.crops === 'any' || x.crops.some((id) => grown.has(id))));
  if (!can.length) return null;
  const x = pickFrom(can, r);
  return { id: SKETCH + x.id, value: 120, xp: 10, kind: 'sketch' };
}

/** A line's display name (a sketch line names the critter). */
export function lineName(content: Content, id: string): string {
  if (isSketch(id)) return `Sketch: ${critterById.get(id.slice(SKETCH.length))?.name ?? id}`;
  return content.cropById.get(id)?.name ?? content.goods.get(id)?.name ?? id;
}

/** One regular order for a tick. */
export function generateOrder(state: FarmState, content: Content, tick: number, day: number): OrderState | null {
  const b = board(content);
  const r = rng(parseInt(fnv1a(`board:${tick}`), 16));
  const P = pools(state, content);
  if (!P.crops.length) return null;
  const who = posters(state, content, day);
  const villager = pickFrom(who, r);
  const plots = usablePlots(state);
  const tier: OrderTier = r() < b.tiers.easy.weight ? 'easy' : 'medium';
  const lines: [Pick, number][] = [];
  if (tier === 'easy') {
    // the fastest third of what you grow, plus anything under 15 minutes
    const fast = P.crops.filter((c, i) => i < Math.ceil(P.crops.length / 3) || c.grow! <= 900);
    const c = choose(fast, villager, content, r);
    lines.push([c, qty(c, b.tiers.easy.share, plots, r, tier)]);
  } else {
    const t = b.tiers.medium;
    const crops = P.crops.filter((c) => c.grow! <= t.max_grow_s);
    const roll = r();
    if (P.goods.length && roll < 0.3) {
      const g = choose(P.goods, villager, content, r);
      lines.push([g, qty(g, t.share, plots, r, tier)]);
    } else if (P.honey.length && roll >= 0.3 && roll < 0.36) {
      lines.push([P.honey[0], qty(P.honey[0], t.share, plots, r, tier)]);
    } else {
      const two = crops.length > 1 && r() < 0.5;
      const pool = [...crops];
      for (let i = 0; i < (two ? 2 : 1); i++) {
        const c = choose(pool, villager, content, r);
        pool.splice(pool.indexOf(c), 1);
        lines.push([c, qty(c, two ? t.share / 2 : t.share, plots, r, tier)]);
      }
    }
  }
  const { coins, xp } = price(lines, tier === 'easy' ? b.tiers.easy.mult : b.tiers.medium.mult);
  return {
    id: `t${tick}`,
    villager,
    tier,
    wants: Object.fromEntries(lines.map(([p, n]) => [p.id, n])),
    coins,
    xp,
    note: noteFor(content, villager, lines[0][0].id, r),
  };
}

/** Is every item available to this player (grown, made, caught or collected)? */
function available(state: FarmState, content: Content, ids: string[]): Pick[] | null {
  const P = pools(state, content);
  const all = [...P.crops.filter((c) => c.grow! <= board(content).tiers.special.max_grow_s), ...P.goods, ...P.honey, ...P.fish];
  // a written Special may name any shallows fish
  const out = ids.map((id) => all.find((p) => p.id === id));
  return out.every((p) => !!p) ? (out as Pick[]) : null;
}

/** Who posts today's Special: a met villager (not the last one), or now and then a letter from Tobias. */
function specialPoster(state: FarmState, content: Content, day: number, r: () => number): string {
  const b = board(content);
  let who = posters(state, content, day).filter((v) => v !== state.board.lastSpecialBy);
  if (!who.length) who = posters(state, content, day);
  if (state.level >= 10 && state.board.lastSpecialBy !== 'tobias' && r() < b.tobias_weight / (who.length + b.tobias_weight)) return 'tobias';
  return pickFrom(who, r);
}

/** Today's Daily Special. */
export function generateSpecial(state: FarmState, content: Content, day: number): OrderState | null {
  const b = board(content);
  const t = b.tiers.special;
  const r = rng(parseInt(fnv1a(`special:${day}`), 16));
  const P = pools(state, content);
  if (!P.crops.length) return null;
  const villager = specialPoster(state, content, day, r);
  const plots = usablePlots(state);
  const done = new Set(state.board.keepsakes ?? []);
  const written = b.specials.find((sp) => sp.villager === villager && !done.has(sp.id) && available(state, content, sp.items));
  let picks: Pick[];
  if (written) picks = available(state, content, written.items)!;
  else {
    // a slow crop (the slower half of what's allowed), a good, and a wild line
    const crops = P.crops.filter((c) => c.grow! <= t.max_grow_s);
    const slow = choose(crops.slice(Math.floor(crops.length / 2)), villager, content, r);
    const rest = crops.filter((c) => c !== slow);
    const good = P.goods.length ? choose(P.goods, villager, content, r) : rest.length ? choose(rest, villager, content, r) : slow;
    // fish once the creek is open (bites come every few minutes); before that, another crop.
    // Hazel would rather you sketched a critter she hasn't seen on your farm yet.
    const sketch = villager === 'hazel' ? sketchTarget(state, content, P.crops, r) : null;
    const wilds = sketch ? [sketch] : P.fish;
    // (a fallback crop line is never one of the quickest few: this is the hard one)
    const left = rest.filter((c) => c !== good && c.grow! > 900);
    const wild = wilds.length ? choose(wilds, villager, content, r) : left.length ? choose(left, villager, content, r) : good;
    picks = [...new Map([slow, good, wild].map((p) => [p.id, p])).values()];
  }
  // the crop lines share the field (a lone crop line takes half the share, so it's never one huge pile)
  const cropLines = Math.max(2, picks.filter((p) => p.kind === 'crop').length);
  const lines: [Pick, number][] = picks.map((p) => [p, qty(p, t.share / cropLines, plots, r, 'special')]);
  const { coins, xp } = price(lines, t.mult);
  const name = content.villagers.get(villager)?.name.split(' ')[0] ?? villager;
  return {
    id: `sp${day}`,
    villager,
    tier: 'special',
    title: written?.title ?? pickFrom(b.posters[villager]?.titles ?? [`${name}'s Special`], r),
    note: written?.note ?? noteFor(content, villager, picks[0].id, r),
    wants: Object.fromEntries(lines.map(([p, n]) => [p.id, n])),
    done: {},
    coins,
    xp,
    ribbons: t.ribbons,
    ...(written ? { special: written.id } : {}),
  };
}

/**
 * Posts what the board is owed: one order per tick since the last post (up to the free slots),
 * and the Daily Special once a day when none is waiting. Returns how many new orders went up.
 */
export function refreshBoard(state: FarmState, content: Content, now: number, offsetMin: number): number {
  if (!hasFlag(state, 'board_open')) return 0;
  const b = board(content);
  const B = state.board;
  const day = dayIndex(now, offsetMin);
  const tick = boardTick(content, now, offsetMin);
  // first look (or a save from before ticks): post a few right away
  B.tick ??= tick - b.first_posts;
  B.day = day;
  let posted = 0;
  if (tick > B.tick) {
    const free = b.slots - B.orders.filter(isRegular).length;
    const owed = Math.min(tick - B.tick, Math.max(0, free));
    for (let t = tick - owed + 1; t <= tick; t++) {
      const o = generateOrder(state, content, t, day);
      if (o && !B.orders.some((x) => x.id === o.id)) {
        B.orders.push(o);
        posted++;
      }
    }
    B.tick = tick;
  }
  // a day that starts while a Special is still waiting is skipped: they never stack up
  if (B.orders.some(isSpecial)) B.specialDay = day;
  else if (specialOpen(state, content) && (B.specialDay ?? -1) < day) {
    const sp = generateSpecial(state, content, day);
    B.specialDay = day;
    if (sp) {
      B.orders.push(sp);
      B.lastSpecialBy = sp.villager;
      posted++;
    }
  }
  return posted;
}

export function pinOrder(state: FarmState, order: OrderState): void {
  if (state.board.orders.some((o) => o.id === order.id)) return;
  state.board.orders.unshift(order);
}

/** Board order for display: story first, then the Special, then regular orders oldest first. */
export function boardOrders(state: FarmState): OrderState[] {
  const rank = (o: OrderState) => (o.story ? 0 : isSpecial(o) ? 1 : 2);
  return [...state.board.orders].sort((a, b) => rank(a) - rank(b));
}

/** Orders with something you can deliver now (a Special counts if any line can go in). */
export function fillableCount(state: FarmState): number {
  return state.board.orders.filter((o) => (isSpecial(o) ? Object.entries(o.wants).some(([id, n]) => lineReady(state, id, n)) : allReady(state, o.wants))).length;
}

export type FulfilResult =
  | { ok: true; order: OrderState; coins: number; levelsGained: number; friendship: FriendshipChange; keepsake?: { name: string; text: string } }
  | { ok: false; reason: 'missing' | 'unknown' };

function payOut(state: FarmState, content: Content, order: OrderState): FulfilResult {
  // the town clock improvement: orders pay 20% more
  const coins = state.flags.includes('imp:clock') ? Math.round(order.coins * 1.2) : order.coins;
  state.coins += coins;
  state.ribbons += order.ribbons ?? 0;
  const levelsGained = grantXp(state, order.xp);
  state.board.orders = state.board.orders.filter((o) => o.id !== order.id);
  const mult = isSpecial(order) ? board(content).tiers.special.friendship_mult : 1;
  const friendship = addFriendship(state, content, order.villager, content.economy.friendship.order * mult);
  let keepsake: { name: string; text: string } | undefined;
  if (order.special && !(state.board.keepsakes ?? []).includes(order.special)) {
    (state.board.keepsakes ??= []).push(order.special);
    keepsake = board(content).specials.find((s) => s.id === order.special)?.keepsake;
  }
  return { ok: true, order, coins, levelsGained, friendship, ...(keepsake ? { keepsake } : {}) };
}

/** Delivers a whole order (for a Special: every line still open). */
export function fulfilOrder(state: FarmState, content: Content, orderId: string): FulfilResult {
  const order = state.board.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: 'unknown' };
  if (!allReady(state, order.wants)) return { ok: false, reason: 'missing' };
  takeItems(state, itemsOnly(order.wants));
  if (isSpecial(order)) {
    order.done = { ...order.done, ...order.wants };
    order.wants = {};
  }
  return payOut(state, content, order);
}

export type LineResult = { ok: true; paid: FulfilResult | null } | { ok: false; reason: 'missing' | 'unknown' };

/** Hands in one line of a Special. The reward pays once the last line is in. */
export function handInLine(state: FarmState, content: Content, orderId: string, itemId: string): LineResult {
  const order = state.board.orders.find((o) => o.id === orderId);
  const n = order?.wants[itemId];
  if (!order || !isSpecial(order) || !n) return { ok: false, reason: 'unknown' };
  if (!lineReady(state, itemId, n)) return { ok: false, reason: 'missing' };
  if (!isSketch(itemId)) takeItems(state, { [itemId]: n });
  order.done = { ...order.done, [itemId]: n };
  delete order.wants[itemId];
  return { ok: true, paid: Object.keys(order.wants).length ? null : payOut(state, content, order) };
}

/** Passes on a regular order for free; its slot fills on the next tick. */
export function passOrder(state: FarmState, orderId: string): boolean {
  const o = state.board.orders.find((x) => x.id === orderId);
  if (!o || !isRegular(o)) return false;
  state.board.orders = state.board.orders.filter((x) => x !== o);
  return true;
}

/** Test/debug helper. */
export function giveItems(state: FarmState, items: Record<string, number>): void {
  for (const [id, n] of Object.entries(items)) addItem(state, id, n);
}
