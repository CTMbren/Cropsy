import { pinOrder } from './board';
import type { Content } from './content';
import { addItem, hasFlag, setFlag, type FarmState } from './farm';
import { grantBuilding } from './processing';
import { sendMail } from './story';

/**
 * The crafting update: recipe cards from friends, Juniper's loom letter, and the first side quest,
 * "Tobias's Pickle Crocks", which runs beside the main story and never blocks it.
 */

// ── Recipe cards ─────────────────────────────────────────────────
/**
 * A friend's recipe card comes with their 3-heart moment. Saves that already saw it get the card
 * the first time this runs. Returns the recipe ids just granted.
 */
export function syncRecipeCards(state: FarmState, content: Content, now: number, offsetMin: number): string[] {
  const out: string[] = [];
  for (const b of content.buildings.values())
    for (const r of b.recipes) {
      if (!r.card || hasFlag(state, `recipe:${r.id}`) || !hasFlag(state, `event:${r.card}:3`)) continue;
      setFlag(state, `recipe:${r.id}`);
      sendMail(state, `card_${r.id}`, 'now', now, offsetMin);
      out.push(r.id);
    }
  return out;
}

// ── Juniper's loom ───────────────────────────────────────────────
export function syncLoomLetter(state: FarmState, content: Content, now: number, offsetMin: number): boolean {
  const loom = content.buildings.get('loom');
  if (!loom || state.level < (loom.unlock_level ?? 1) || hasFlag(state, 'loom_letter')) return false;
  setFlag(state, 'loom_letter');
  sendMail(state, 'juniper_loom', 'now', now, offsetMin);
  return true;
}

// ── Side quest: Tobias's Pickle Crocks ───────────────────────────
export const PICKLES_LEVEL = 8;
export const PICKLES_GOLDIE = 'side_pickles_goldie';
export const PICKLES_BRUNO = 'side_pickles_bruno';

/** 0 not started, 1 Goldie's order, 2 Bruno's order, 3 done. */
export const picklesStep = (state: FarmState) => state.side?.pickles ?? 0;

function goldieOrder() {
  return { id: PICKLES_GOLDIE, villager: 'goldie', wants: { radish: 12, carrot: 6 }, coins: 120, xp: 20, story: 'side:pickles', note: 'For Tobias\'s crocks: radishes and carrots, please!' };
}
function brunoOrder() {
  return { id: PICKLES_BRUNO, villager: 'bruno', wants: { wood: 15, stone: 10 }, coins: 0, xp: 30, story: 'side:pickles', note: 'Shelves for the pickle crocks. Wood and stone.' };
}

export interface SideQuestView {
  title: string;
  text: string;
}

/** For the quest tracker: what the side quest wants now, or null. */
export function sideQuest(state: FarmState): SideQuestView | null {
  const step = picklesStep(state);
  if (step === 1) return { title: "Tobias's Pickle Crocks", text: "Fill Goldie's order on the Board: 12 radishes, 6 carrots" };
  if (step === 2) return { title: "Tobias's Pickle Crocks", text: "Fill Bruno's order on the Board: 15 wood, 10 stone" };
  return null;
}

/** Starts the side quest at level 8, and keeps its order pinned (old saves, a lost order). */
export function syncSideQuest(state: FarmState, now: number, offsetMin: number): boolean {
  const step = picklesStep(state);
  if (step === 0 && state.level >= PICKLES_LEVEL && hasFlag(state, 'board_open')) {
    state.side = { ...state.side, pickles: 1 };
    sendMail(state, 'goldie_crocks', 'now', now, offsetMin);
    pinOrder(state, goldieOrder());
    return true;
  }
  if (step === 1 && !state.board.orders.some((o) => o.id === PICKLES_GOLDIE)) pinOrder(state, goldieOrder());
  if (step === 2 && !state.board.orders.some((o) => o.id === PICKLES_BRUNO)) pinOrder(state, brunoOrder());
  return false;
}

/** After a Board order is filled: moves the side quest on. Returns true when the station is handed over. */
export function sideQuestOrderDone(state: FarmState, content: Content, orderId: string, now: number, offsetMin: number): boolean {
  const step = picklesStep(state);
  if (step === 1 && orderId === PICKLES_GOLDIE) {
    state.side = { ...state.side, pickles: 2 };
    sendMail(state, 'goldie_crocks_bruno', 'now', now, offsetMin);
    pinOrder(state, brunoOrder());
    return false;
  }
  if (step === 2 && orderId === PICKLES_BRUNO) {
    state.side = { ...state.side, pickles: 3 };
    grantBuilding(state, content, 'pickling');
    setFlag(state, 'pickling_built');
    // the first jar is already on the shelf, waiting to be collected
    const r = content.buildings.get('pickling')?.recipes.find((x) => x.id === 'pickled_radishes');
    if (r && state.buildings.pickling) state.buildings.pickling.queue.push({ recipe: r.id, startsAt: now - r.dur_s, durS: r.dur_s });
    else addItem(state, 'pickled_radishes', 1);
    sendMail(state, 'goldie_crocks_done', 'now', now, offsetMin);
    return true;
  }
  return false;
}
