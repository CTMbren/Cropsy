import { itemName, type Content, type Objective, type QuestDef, type Rewards } from './content';
import { pinOrder } from './board';
import { grantBuilding } from './processing';
import { expand, grantXp, hasFlag, hasItems, setFlag, spawnObstacles, takeItems, type FarmState, type ObstacleKind } from './farm';
import { nextLocalMidnight } from './time';

/** Gameplay events the quest tracker listens to. */
export type GameEvent =
  | { type: 'harvest'; crop: string }
  | { type: 'clear'; obstacle: string }
  | { type: 'sell'; n: number }
  | { type: 'read_mail'; id: string }
  | { type: 'order_done'; id: string }
  | { type: 'project'; id: string; stage: number };

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
  completed?: QuestDef;
  started?: QuestDef;
  expanded?: boolean;
}

/** Starts the next quest if none is active. Mail-given quests start immediately. */
export function advance(state: FarmState, content: Content, now: number, offsetMin: number): StoryOutcome {
  const out: StoryOutcome = { levelsGained: 0 };
  if (state.story.active) return out;
  const q = nextQuest(state, content);
  if (!q) return out;
  state.story.active = { id: q.id, status: q.giver === 'mail' ? 'active' : 'offered', progress: q.objectives.map(() => 0) };
  out.started = q;
  if (q.giver === 'mail') begin(state, q, now, offsetMin);
  return out;
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
    default:
      return 0;
  }
}

/** Feeds a gameplay event to the active quest. Mail quests complete on their own; villager quests wait to be handed in. */
export function onEvent(state: FarmState, content: Content, e: GameEvent, now: number, offsetMin: number): StoryOutcome {
  const a = state.story.active;
  const q = activeQuest(state, content);
  const out: StoryOutcome = { levelsGained: 0 };
  if (!a || !q || a.status !== 'active') return out;
  q.objectives.forEach((o, i) => {
    a.progress[i] = Math.min(target(o), a.progress[i] + matches(o, e));
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
  const next = advance(state, content, now, offsetMin);
  return { levelsGained: levelsGained + next.levelsGained, completed: q, started: next.started };
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
      return `Restore the ${content.projects.get(o.id)?.name ?? o.id} (in Town)`;
  }
}
