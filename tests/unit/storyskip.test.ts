import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { newFarm } from '../../src/core/farm';
import { advance, sendMail, skipStoryWait, STORY_SKIP_COOLDOWN_S, storySkipCooldown, storyWaitLetter } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;

/** A farm that just finished `doneThrough`, with its next-morning letter on the way. */
function waiting(doneThrough: string, letter: string, level = 10) {
  const s = newFarm(T0);
  s.level = level;
  const i = content.quests.findIndex((q) => q.id === doneThrough);
  s.story.done = content.quests.slice(0, i + 1).map((q) => q.id);
  s.story.active = null;
  for (const q of content.quests.slice(0, i + 1)) for (const f of q.rewards.flags ?? []) s.flags.push(f);
  sendMail(s, letter, 'next_day', T0, TZ);
  advance(s, content, T0, TZ);
  return s;
}

describe('skip the story wait', () => {
  it("finds the letter the story is waiting on: a quest's letter, or the one that opens the next quest", () => {
    // Tobias's letter after Ziggy: the next quest asks you to read it
    const a = waiting('ch3_ziggy', 'tobias_3');
    expect(storyWaitLetter(a, content, T0)).toBe('tobias_3');
    // Rufus's wheel letter: its flag opens the flour quest
    const b = waiting('ch2_mill', 'rufus_wheel');
    expect(storyWaitLetter(b, content, T0)).toBe('rufus_wheel');
    // waiting on a level is not a wait you can skip
    const c = newFarm(T0);
    c.story.done = content.quests.filter((q) => q.chapter === 1).map((q) => q.id);
    c.level = 2;
    advance(c, content, T0, TZ);
    expect(storyWaitLetter(c, content, T0)).toBeNull();
  });

  it('delivers the letter now, then waits 24 hours before the next skip', () => {
    const s = waiting('ch3_ziggy', 'tobias_3');
    expect(storySkipCooldown(s, T0)).toBe(0);
    expect(skipStoryWait(s, content, T0)).toBe('tobias_3');
    expect(s.mail.find((m) => m.id === 'tobias_3')!.arrivesAt).toBe(T0);
    expect(storyWaitLetter(s, content, T0)).toBeNull();
    expect(storySkipCooldown(s, T0 + 3600)).toBe(STORY_SKIP_COOLDOWN_S - 3600);
    // the next wait can't be skipped until the cooldown is over
    sendMail(s, 'tobias_4', 'next_day', T0 + 60, TZ);
    s.story.done.push(...content.quests.filter((q) => q.chapter === 4).map((q) => q.id));
    s.story.active = null;
    advance(s, content, T0 + 60, TZ);
    expect(storyWaitLetter(s, content, T0 + 60)).toBe('tobias_4');
    expect(skipStoryWait(s, content, T0 + 60)).toBeNull();
    // a day later the skip is back
    s.storySkipAt = T0 + 60 - STORY_SKIP_COOLDOWN_S;
    expect(skipStoryWait(s, content, T0 + 60)).toBe('tobias_4');
  });
});
