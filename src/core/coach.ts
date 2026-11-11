import type { Content } from './content';
import { stageOf, type FarmState } from './farm';
import { activeQuest } from './story';

/**
 * The guided first few minutes. Instead of a separate tutorial, a small hint follows Chapter 1:
 * it names the next thing to do and points at it (a nav button, the visitor, a seed, or plots on
 * the farm). It stops for good once Goldie's carrot order is filled.
 */
export type CoachTarget = 'mail' | 'visitor' | 'barn' | 'board' | 'seed' | 'farm';
export type FarmHighlight = 'weeds' | 'empty' | 'ripe';

export interface CoachHint {
  text: string;
  target: CoachTarget;
  /** Plots to pulse on the farm. */
  farm?: FarmHighlight;
  /** For target "seed": which seed to pulse. */
  seed?: string;
}

const TUTORIAL = ['ch1_letter', 'ch1_weeds', 'ch1_harvest', 'ch1_ship', 'ch1_order'];

export function coachHint(state: FarmState, content: Content, now: number, selectedCrop: string): CoachHint | null {
  const a = state.story.active;
  const q = activeQuest(state, content);
  if (!a || !q || !TUTORIAL.includes(q.id)) return null;
  const plots = Object.entries(state.plots).filter(([k]) => !state.obstacles[k]);
  const ripe = plots.some(([, p]) => p.crop && stageOf(p, now) === 'ripe');
  const growing = plots.some(([, p]) => p.crop && stageOf(p, now) !== 'ripe');
  const empty = plots.some(([, p]) => !p.crop);

  if (a.status === 'offered') return { text: 'Someone is at your gate! Tap them to say hello.', target: 'visitor' };
  if (a.status === 'ready') return { text: 'All done! Tap your visitor to finish the quest.', target: 'visitor' };

  switch (q.id) {
    case 'ch1_letter':
      return { text: 'A letter has arrived. Tap Mail to read it.', target: 'mail' };
    case 'ch1_weeds':
      return { text: 'Tap the weeds to pull them. You can drag across several at once.', target: 'farm', farm: 'weeds' };
    case 'ch1_harvest':
      if (ripe) return { text: 'Your crops are ripe! Tap them, or drag across them, to harvest.', target: 'farm', farm: 'ripe' };
      if (empty && selectedCrop !== 'radish' && !growing) return { text: 'Pick Radish in the seed tray. It grows in 30 seconds.', target: 'seed', seed: 'radish' };
      if (empty) return { text: 'Tap empty soil to plant. Fill a few plots!', target: 'farm', farm: 'empty' };
      return { text: 'Growing… Radishes are ready in 30 seconds. Watch them sparkle.', target: 'farm' };
    case 'ch1_ship':
      return { text: 'Open the Barn and ship 5 crops in the shipping crate.', target: 'barn' };
    case 'ch1_order':
      return state.board.orders.some((o) => o.story === 'ch1_order')
        ? { text: "Goldie pinned an order on the Board. Grow carrots, then fill it there.", target: 'board' }
        : null;
    default:
      return null;
  }
}
