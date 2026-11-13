import { itemName, type Content, type Objective, type QuestDef, type Rewards } from './content';
import { pinOrder } from './board';
import { addFriendship, type FriendshipChange } from './friendship';
import { grantBuilding } from './processing';
import { grantDecor } from './decor';
import { expand, grantXp, hasFlag, hasItems, setFlag, spawnObstacles, takeItems, type FarmState, type ObstacleKind } from './farm';
import { nextLocalMidnight } from './time';

/** Gameplay events the quest tracker listens to. */
export type GameEvent =
  | { type: 'harvest'; crop: string }
  | { type: 'clear'; obstacle: string }
  | { type: 'sell'; n: number }
  | { type: 'read_mail'; id: string }
  | { type: 'order_done'; id: string }
  | { type: 'project'; id: string; stage: number }
  | { type: 'merchant_buy' }
  | { type: 'fish'; fish: string };

export const target = (o: Objective): number => ('n' in o ? o.n : 1);

export function activeQuest(state: FarmState, content: Content): QuestDef | null {
  return state.story.active ? (content.questById.get(state.story.active.id) ?? null) : null;
}

/**
 * The story is a linear chain: the next quest is the first one not yet done. It waits until the
 * player reaches its level or earns its flag, so chapters are paced by progress, not a timer.
 */
function nextQuest(state: FarmState, content: Content): QuestDef | null {
  const q = content.quests.find((x) => !state.story.done.includes(x.id)) ?? null;
  if (!q) return null;
  if ((q.min_level ?? 1) > state.level) return null;
  if (q.requires_flag && !hasFlag(state, q.requires_flag)) return null;
  return q;
}

/** What the story is waiting for when no quest is active (for the tracker). */
export function waitingFor(state: FarmState, content: Content): { level?: number; flag?: string; title: string } | null {
  if (state.story.active) return null;
  const q = content.quests.find((x) => !state.story.done.includes(x.id));
  if (!q) return null;
  if ((q.min_level ?? 1) > state.level) return { level: q.min_level, title: q.title };
  if (q.requires_flag && !hasFlag(state, q.requires_flag)) return { flag: q.requires_flag, title: q.title };
  return null;
}

export interface StoryOutcome {
  levelsGained: number;
  friendship?: FriendshipChange;
  completed?: QuestDef;
  started?: QuestDef;
  expanded?: boolean;
}

/**
 * Re-grants the unlock flags of every finished quest (e.g. `almanac_open` from Tobias's letter).
 * Flags are never taken away, so this only fixes saves that somehow missed one. Returns the flags it added.
 */
export function restoreQuestFlags(state: FarmState, content: Content): string[] {
  const added: string[] = [];
  for (const id of state.story.done) {
    for (const f of content.questById.get(id)?.rewards.flags ?? []) {
      if (hasFlag(state, f)) continue;
      setFlag(state, f);
      added.push(f);
    }
  }
  return added;
}

/** Items something is waiting for: board orders and the active quest's hand-in (most wanted per item). */
export function itemsWanted(state: FarmState, content: Content): Record<string, number> {
  const want: Record<string, number> = {};
  const add = (items: Record<string, number>) => {
    for (const [id, n] of Object.entries(items)) want[id] = Math.max(want[id] ?? 0, n);
  };
  for (const o of state.board.orders) add(o.wants);
  for (const o of activeQuest(state, content)?.objectives ?? []) if (o.type === 'hand_in') add(o.items);
  return want;
}

// ── Skipping a wait ──────────────────────────────────────────────
/** How long after a skip the next one is allowed. */
export const STORY_SKIP_COOLDOWN_S = 24 * 3600;

/**
 * The letter the story is waiting on that hasn't arrived yet (usually "tomorrow morning"): a letter
 * the active quest asks you to read, or the letter whose flag opens the next quest. Null when the
 * story isn't waiting on the clock (waiting on a level, or nothing to wait for).
 */
export function storyWaitLetter(state: FarmState, content: Content, now: number): string | null {
  const coming = (id: string) => state.mail.some((m) => m.id === id && m.arrivesAt > now);
  for (const o of activeQuest(state, content)?.objectives ?? []) if (o.type === 'read_mail' && coming(o.id)) return o.id;
  const w = waitingFor(state, content);
  if (w?.flag) {
    const m = state.mail.find((x) => x.arrivesAt > now && content.letters.get(x.id)?.effects?.flags?.includes(w.flag!));
    if (m) return m.id;
  }
  return null;
}

/** Seconds until the skip can be used again (0 = ready). */
export function storySkipCooldown(state: FarmState, now: number): number {
  return state.storySkipAt === undefined ? 0 : Math.max(0, state.storySkipAt + STORY_SKIP_COOLDOWN_S - now);
}

/** Delivers the letter the story is waiting on right now. Once every 24 hours. Returns the letter id. */
export function skipStoryWait(state: FarmState, content: Content, now: number): string | null {
  const id = storyWaitLetter(state, content, now);
  if (!id || storySkipCooldown(state, now) > 0) return null;
  const m = state.mail.find((x) => x.id === id)!;
  m.arrivesAt = now;
  state.storySkipAt = now;
  return id;
}

/** Where the letter a quest is waiting on stands: not sent, on its way, in the mailbox, or read. */
export function letterStatus(state: FarmState, id: string, now: number): { state: 'missing' | 'coming' | 'waiting' | 'read'; arrivesAt?: number } {
  const m = state.mail.find((x) => x.id === id);
  if (!m) return { state: 'missing' };
  if (m.arrivesAt > now) return { state: 'coming', arrivesAt: m.arrivesAt };
  return { state: m.read ? 'read' : 'waiting' };
}

/** Makes sure the active quest's letter was actually sent (old saves could miss one). */
export function ensureQuestMail(state: FarmState, content: Content, now: number, offsetMin: number): string[] {
  const q = activeQuest(state, content);
  const sent: string[] = [];
  for (const o of q?.objectives ?? [])
    if (o.type === 'read_mail' && !state.mail.some((m) => m.id === o.id)) {
      sendMail(state, o.id, 'now', now, offsetMin);
      sent.push(o.id);
    }
  return sent;
}

/** Starts the next quest if none is active. Mail-given quests start immediately. */
export function advance(state: FarmState, content: Content, now: number, offsetMin: number): StoryOutcome {
  const out: StoryOutcome = { levelsGained: 0 };
  if (state.story.active) {
    ensureQuestMaterials(state, content);
    return out;
  }
  const q = nextQuest(state, content);
  if (!q) return out;
  state.story.active = { id: q.id, status: q.giver === 'mail' ? 'active' : 'offered', progress: q.objectives.map(() => 0) };
  ensureQuestMaterials(state, content);
  out.started = q;
  if (q.giver === 'mail') {
    begin(state, q, now, offsetMin);
    // the letter may already have been read (e.g. it arrived as a reward before this chapter existed)
    for (const o of q.objectives) {
      if (o.type === 'read_mail' && state.mail.some((m) => m.id === o.id && m.read && m.arrivesAt <= now)) {
        const r = onEvent(state, content, { type: 'read_mail', id: o.id }, now, offsetMin);
        return { ...r, started: r.started ?? q };
      }
    }
  }
  return out;
}

const OBSTACLE_GIVES: Partial<Record<ObstacleKind, { item: string; qty: number }>> = {
  branch: { item: 'wood', qty: 1 },
  stump: { item: 'wood', qty: 2 },
  rock: { item: 'stone', qty: 1 },
  boulder: { item: 'stone', qty: 3 },
};
/** Which obstacle to place when a quest needs a material the farm can't provide. */
const SOURCE_FOR: Record<string, ObstacleKind> = { wood: 'branch', stone: 'rock' };

/**
 * Makes sure the active quest is possible: if it asks you to clear weeds the farm doesn't have, or
 * to bring wood or stone with no branches or rocks left to gather, the missing obstacles appear on
 * empty plots. Farms from before the story existed were already cleared, which left quests stuck.
 * Safe to call any time; it only places what's missing (and waits if every plot is planted).
 */
export function ensureQuestMaterials(state: FarmState, content: Content): string[] {
  const a = state.story.active;
  const q = activeQuest(state, content);
  if (!a || !q) return [];
  const placed: string[] = [];
  const count = (kind: ObstacleKind | 'any') => Object.values(state.obstacles).filter((k) => kind === 'any' || k === kind).length;
  q.objectives.forEach((o, i) => {
    if (o.type === 'clear') {
      const missing = o.n - (a.progress[i] ?? 0) - count(o.obstacle);
      if (missing > 0) placed.push(...spawnObstacles(state, o.obstacle === 'any' ? 'weeds' : o.obstacle, missing));
    }
    if (o.type === 'hand_in' && a.status !== 'ready') {
      for (const [item, need] of Object.entries(o.items)) {
        const source = SOURCE_FOR[item];
        if (!source) continue;
        let available = state.inventory[item] ?? 0;
        for (const kind of Object.values(state.obstacles)) {
          const g = OBSTACLE_GIVES[kind];
          if (g?.item === item) available += g.qty;
        }
        if (need - available > 0) placed.push(...spawnObstacles(state, source, need - available));
      }
    }
  });
  return placed;
}

/** Side effects when a quest becomes active (pinning story orders, delivering its letter). */
function begin(state: FarmState, q: QuestDef, now: number, offsetMin: number): void {
  for (const o of q.objectives) {
    if (o.type === 'deliver_order') pinOrder(state, { ...o.order, story: q.id });
    if (o.type === 'read_mail' && !state.mail.some((m) => m.id === o.id)) sendMail(state, o.id, 'now', now, offsetMin);
  }
}

export function sendMail(state: FarmState, id: string, delay: 'now' | 'next_day', now: number, offsetMin: number): void {
  if (state.mail.some((m) => m.id === id)) return;
  state.mail.push({ id, arrivesAt: delay === 'now' ? now : nextLocalMidnight(now, offsetMin), read: false });
}

export function inbox(state: FarmState, now: number) {
  return state.mail.filter((m) => m.arrivesAt <= now).sort((a, b) => b.arrivesAt - a.arrivesAt);
}

export const unreadCount = (state: FarmState, now: number) => inbox(state, now).filter((m) => !m.read).length;

/** Marks a letter read and applies its effects once (e.g. Bruno's gate expands the farm). */
export function readMail(state: FarmState, content: Content, id: string, now: number, offsetMin: number): StoryOutcome {
  const m = state.mail.find((x) => x.id === id && x.arrivesAt <= now);
  const out: StoryOutcome = { levelsGained: 0 };
  if (!m) return out;
  m.read = true;
  const letter = content.letters.get(id);
  const effectFlag = `effect:${id}`;
  if (letter?.effects && !hasFlag(state, effectFlag)) {
    setFlag(state, effectFlag);
    if (letter.effects.expand) {
      expand(state);
      out.expanded = true;
    }
    if (letter.effects.coins) state.coins += letter.effects.coins;
    if (letter.effects.decor) grantDecor(state, letter.effects.decor);
    for (const f of letter.effects.flags ?? []) {
      setFlag(state, f);
      // "<building>_built" flags hand the player that building (e.g. the mill)
      if (f.endsWith('_built')) grantBuilding(state, content, f.slice(0, -'_built'.length));
    }
  }
  const r = onEvent(state, content, { type: 'read_mail', id }, now, offsetMin);
  // a letter's flag can unlock the next quest (e.g. the mill wheel letter)
  const next = advance(state, content, now, offsetMin);
  return { ...r, started: r.started ?? next.started, expanded: out.expanded };
}

function matches(o: Objective, e: GameEvent): number {
  switch (o.type) {
    case 'harvest':
      return e.type === 'harvest' && (o.crop === 'any' || o.crop === e.crop) ? 1 : 0;
    case 'clear':
      return e.type === 'clear' && (o.obstacle === 'any' || o.obstacle === e.obstacle) ? 1 : 0;
    case 'sell':
      return e.type === 'sell' ? e.n : 0;
    case 'read_mail':
      return e.type === 'read_mail' && e.id === o.id ? 1 : 0;
    case 'deliver_order':
      return e.type === 'order_done' && e.id === o.order.id ? 1 : 0;
    case 'project':
      return e.type === 'project' && e.id === o.id ? 1 : 0;
    case 'merchant_buy':
      return e.type === 'merchant_buy' ? 1 : 0;
    case 'fish':
      return e.type === 'fish' && (o.fish === 'any' || o.fish === e.fish) ? 1 : 0;
    default:
      return 0;
  }
}

/** Objectives measured from the farm itself rather than counted from events. */
function derived(state: FarmState, content: Content, o: Objective): number | null {
  if (o.type === 'discover') return state.seen.filter((id) => content.cropById.has(id)).length;
  if (o.type === 'mastery') return Math.max(0, ...Object.values(state.harvests ?? {}));
  if (o.type === 'fish_species') return state.fishing?.seen.length ?? 0;
  // project stages count whenever they were delivered (e.g. before the quest was offered)
  if (o.type === 'project') return state.projects[o.id] ?? 0;
  return null;
}

/**
 * Updates progress for objectives measured from the farm (crops discovered, best crop's harvests)
 * and marks a villager quest ready when everything is done. Safe to call any time.
 */
export function refreshQuest(state: FarmState, content: Content): void {
  const a = state.story.active;
  const q = activeQuest(state, content);
  if (!a || !q || a.status !== 'active') return;
  let any = false;
  q.objectives.forEach((o, i) => {
    const v = derived(state, content, o);
    if (v !== null) {
      a.progress[i] = Math.min(target(o), v);
      any = true;
    }
  });
  if (any && q.giver !== 'mail' && q.objectives.every((o, i) => o.type !== 'hand_in' && a.progress[i] >= target(o))) a.status = 'ready';
}

/** Feeds a gameplay event to the active quest. Mail quests complete on their own; villager quests wait to be handed in. */
export function onEvent(state: FarmState, content: Content, e: GameEvent, now: number, offsetMin: number): StoryOutcome {
  const a = state.story.active;
  const q = activeQuest(state, content);
  const out: StoryOutcome = { levelsGained: 0 };
  if (!a || !q || a.status !== 'active') return out;
  q.objectives.forEach((o, i) => {
    a.progress[i] = Math.min(target(o), derived(state, content, o) ?? a.progress[i] + matches(o, e));
  });
  if (q.objectives.every((o, i) => o.type !== 'hand_in' && a.progress[i] >= target(o))) {
    a.status = 'ready';
    if (q.giver === 'mail') return complete(state, content, now, offsetMin);
  }
  return out;
}

export function canHandIn(state: FarmState, q: QuestDef): boolean {
  return q.objectives.every((o) => o.type !== 'hand_in' || (hasItems(state, o.items) && state.coins >= (o.coins ?? 0)));
}

export type TalkResult =
  | { kind: 'intro'; quest: QuestDef; lines: string[] }
  | { kind: 'outro'; quest: QuestDef; lines: string[]; outcome: StoryOutcome }
  | { kind: 'reminder'; quest: QuestDef; lines: string[] }
  | { kind: 'none' };

/** Tapping the visiting villager: hear the intro, get a reminder, or hand the quest in. */
export function talk(state: FarmState, content: Content, now: number, offsetMin: number): TalkResult {
  const a = state.story.active;
  const q = activeQuest(state, content);
  if (!a || !q || q.giver === 'mail') return { kind: 'none' };
  if (a.status === 'offered') {
    a.status = 'active';
    begin(state, q, now, offsetMin);
    refreshQuest(state, content);
    return { kind: 'intro', quest: q, lines: q.intro ?? [] };
  }
  const handIn = q.objectives.find((o) => o.type === 'hand_in');
  if (a.status === 'active' && handIn && handIn.type === 'hand_in' && canHandIn(state, q)) {
    takeItems(state, handIn.items);
    state.coins -= handIn.coins ?? 0;
    q.objectives.forEach((o, i) => (a.progress[i] = target(o)));
    a.status = 'ready';
  }
  if (a.status === 'ready') {
    const lines = q.outro ?? [];
    return { kind: 'outro', quest: q, lines, outcome: complete(state, content, now, offsetMin) };
  }
  return { kind: 'reminder', quest: q, lines: [objectiveText(q.objectives[0], content)] };
}

function grant(state: FarmState, r: Rewards, now: number, offsetMin: number): number {
  if (r.coins) state.coins += r.coins;
  if (r.ribbons) state.ribbons += r.ribbons;
  for (const [kind, n] of Object.entries(r.spawn ?? {})) spawnObstacles(state, kind as ObstacleKind, n ?? 0);
  for (const f of r.flags ?? []) setFlag(state, f);
  for (const m of r.mail ?? []) sendMail(state, m.id, m.delay, now, offsetMin);
  return r.xp ? grantXp(state, r.xp) : 0;
}

function complete(state: FarmState, content: Content, now: number, offsetMin: number): StoryOutcome {
  const q = activeQuest(state, content)!;
  state.story.done.push(q.id);
  state.story.active = null;
  const levelsGained = grant(state, q.rewards, now, offsetMin);
  const friendship = q.giver !== 'mail' ? addFriendship(state, content, q.giver, content.economy.friendship.quest) : undefined;
  const next = advance(state, content, now, offsetMin);
  return { levelsGained: levelsGained + next.levelsGained, completed: q, started: next.started, friendship };
}

/** Plain-language objective for the quest tracker. */
export function objectiveText(o: Objective, content: Content): string {
  switch (o.type) {
    case 'read_mail':
      return 'Read the letter in your mailbox';
    case 'clear':
      return `Clear ${o.n} ${{ any: 'obstacles', weeds: 'weeds', branch: 'branches', rock: 'rocks', stump: 'stumps', boulder: 'boulders' }[o.obstacle]}`;
    case 'harvest':
      return `Harvest ${o.n} ${o.crop === 'any' ? 'crops' : (content.cropById.get(o.crop)?.name ?? o.crop)}`;
    case 'sell':
      return `Sell ${o.n} crops at the shipping crate`;
    case 'deliver_order': {
      const [id, n] = Object.entries(o.order.wants)[0];
      return `Fill the board order: ${n} ${content.cropById.get(id)?.name ?? id}`;
    }
    case 'hand_in': {
      const parts = Object.entries(o.items).map(([id, n]) => `${n} ${itemName(content, id).toLowerCase()}`);
      if (o.coins) parts.push(`${o.coins} coins`);
      return `Bring ${parts.join(', ')}`;
    }
    case 'project':
      return `Finish the ${content.projects.get(o.id)?.name ?? o.id} project (in Town)`;
    case 'merchant_buy':
      return o.n === 1 ? "Buy something from Ziggy's cart (in Town)" : `Buy ${o.n} things from Ziggy's cart`;
    case 'discover':
      return `Grow ${o.n} different crops`;
    case 'mastery':
      return `Harvest one crop ${o.n} times`;
    case 'fish':
      return o.fish === 'any' ? `Catch ${o.n} fish at the Creek (in Town)` : `Catch ${o.n} ${itemName(content, o.fish).toLowerCase()}`;
    case 'fish_species':
      return `Catch ${o.n} different kinds of fish`;
  }
}
