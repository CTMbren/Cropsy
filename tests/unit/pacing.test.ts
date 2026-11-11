import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { simulate } from '../../tools/sim';

/**
 * Guards the pacing targets from the design doc using the economy simulator (a casual player:
 * one 30-minute first session, then four check-ins a day). If a content change breaks these,
 * run `npm run sim` to see the full timeline and retune.
 */
describe('pacing (simulated casual player)', () => {
  const r = simulate(56);
  const day = (h: number) => h / 24;

  it('reaches level 5 in the first session', () => {
    expect(r.levelAt[5]).toBeLessThan(1);
  });

  it('reaches level 10 in about 2 to 4 days', () => {
    expect(day(r.levelAt[10])).toBeGreaterThan(1.5);
    expect(day(r.levelAt[10])).toBeLessThan(4);
  });

  it('finishes Chapter 3 within 3 weeks', () => {
    const done = r.events.find((e) => e.e === 'quest ch3_ziggy');
    expect(done && day(done.h)).toBeLessThan(21);
  });

  it('reaches level 30 in roughly 4 to 8 weeks', () => {
    expect(day(r.levelAt[30])).toBeGreaterThan(28);
    expect(day(r.levelAt[30])).toBeLessThan(56);
  });

  it('never dead-ends: every story quest gets finished', () => {
    expect(r.final.story.done.length).toBe(loadContent().quests.length);
  });

  it('the farm keeps growing', () => {
    expect(r.final.width).toBeGreaterThanOrEqual(8);
  });
});
