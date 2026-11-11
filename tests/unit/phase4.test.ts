import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { markBackedUp, needsBackupNudge, snoozeBackup } from '../../src/core/backup';
import { coachHint } from '../../src/core/coach';
import { clearObstacle, harvest, key, newFarm, plant, sell } from '../../src/core/farm';
import { advance, onEvent, readMail, talk } from '../../src/core/story';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;
const DAY = 86400;

describe('first-minutes coach', () => {
  it('walks through Chapter 1 and then gets out of the way', () => {
    const s = newFarm(T0);
    let now = T0;
    advance(s, content, now, TZ);
    expect(coachHint(s, content, now, 'radish')?.target).toBe('mail');
    readMail(s, content, 'tobias_1', now, TZ);
    expect(coachHint(s, content, now, 'radish')?.target).toBe('visitor');
    talk(s, content, now, TZ);
    expect(coachHint(s, content, now, 'radish')).toMatchObject({ target: 'farm', farm: 'weeds' });
    for (const k of ['0,0', '3,0', '2,1']) {
      clearObstacle(s, k);
      onEvent(s, content, { type: 'clear', obstacle: 'weeds' }, now, TZ);
    }
    expect(coachHint(s, content, now, 'radish')?.target).toBe('visitor');
    talk(s, content, now, TZ);
    talk(s, content, now, TZ);
    // harvest quest: pick radish, plant, wait, harvest
    expect(coachHint(s, content, now, 'carrot')).toMatchObject({ target: 'seed', seed: 'radish' });
    expect(coachHint(s, content, now, 'radish')).toMatchObject({ target: 'farm', farm: 'empty' });
    for (let i = 0; i < 5; i++) plant(s, content, key(i % 2, 1 + Math.floor(i / 2)), 'radish', now);
    s.obstacles = {};
    for (const [k, p] of Object.entries(s.plots)) if (!p.crop) s.plots[k] = { ...p, crop: 'radish', plantedAt: now, growS: 30 };
    expect(coachHint(s, content, now, 'radish')?.text).toMatch(/Growing/);
    now += 30;
    expect(coachHint(s, content, now, 'radish')).toMatchObject({ farm: 'ripe' });
    for (const k of Object.keys(s.plots).slice(0, 5)) {
      harvest(s, content, k, now);
      onEvent(s, content, { type: 'harvest', crop: 'radish' }, now, TZ);
    }
    talk(s, content, now, TZ);
    talk(s, content, now, TZ);
    expect(coachHint(s, content, now, 'radish')?.target).toBe('barn');
    sell(s, content, 'radish', 5);
    onEvent(s, content, { type: 'sell', n: 5 }, now, TZ);
    talk(s, content, now, TZ);
    talk(s, content, now, TZ);
    expect(coachHint(s, content, now, 'radish')?.target).toBe('board');
    // after the carrot order, no more hints
    s.story.done.push('ch1_order');
    s.story.active = { id: 'ch1_gate', status: 'active', progress: [0] };
    expect(coachHint(s, content, now, 'radish')).toBeNull();
  });
});

describe('backup reminder', () => {
  it('asks at level 5, waits 3 days after "later" and a week after a backup', () => {
    const s = newFarm(T0);
    expect(needsBackupNudge(s, T0)).toBe(false);
    s.level = 5;
    expect(needsBackupNudge(s, T0)).toBe(true);
    snoozeBackup(s, T0);
    expect(needsBackupNudge(s, T0 + 2 * DAY)).toBe(false);
    expect(needsBackupNudge(s, T0 + 3 * DAY)).toBe(true);
    markBackedUp(s, T0 + 3 * DAY);
    expect(needsBackupNudge(s, T0 + 9 * DAY)).toBe(false);
    expect(needsBackupNudge(s, T0 + 10 * DAY)).toBe(true);
  });
});
