import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/core/content';
import { newFarm, setFlag, type FarmState } from '../../src/core/farm';
import { did, masteryWaitingADay, NOTES_PAGES, notesPages, NUDGES, nudge, PAGE_UNLOCK, readPage, syncNotes, TIP_GAP_S, TIPS, tipOfTheDay, unreadPages } from '../../src/core/notes';
import { migrate } from '../../src/core/save';
import { featuredCrop, marketOpen, priceFactor } from '../../src/core/shop';
import { marketPeriod, nextMarketPeriod } from '../../src/core/time';

const content = loadContent();
const T0 = 1_800_000_000;
const TZ = 0;

function farm(notes = true): FarmState {
  const s = newFarm(T0);
  s.level = 4;
  if (notes) setFlag(s, 'notes_open');
  return s;
}

describe("Tobias's notes", () => {
  it('every page has an unlock rule, and every tip points at a real page', () => {
    for (const p of NOTES_PAGES) expect(PAGE_UNLOCK[p.id]).toBeDefined();
    for (const t of TIPS) expect(NOTES_PAGES.some((p) => p.id === t.page)).toBe(true);
    for (const t of [...TIPS.map((x) => x.text), ...NOTES_PAGES.flatMap((p) => p.bullets.map((b) => (typeof b === 'string' ? b : b.text)))]) expect(t.split(/\s+/).length).toBeLessThanOrEqual(25);
    for (const n of NUDGES) expect(content.villagers.has(n.from)).toBe(true);
  });

  it('is handed over at the end of Chapter 1, with a letter from Tobias', () => {
    expect(content.questById.get('ch1_order')?.rewards.flags).toContain('notes_open');
    const s = farm(false);
    expect(syncNotes(s, content, T0, TZ)).toEqual([]);
    expect(s.mail.some((m) => m.id === 'tobias_notes')).toBe(false);
    setFlag(s, 'notes_open');
    syncNotes(s, content, T0, TZ);
    expect(s.mail.some((m) => m.id === 'tobias_notes')).toBe(true);
    expect(content.letters.has('tobias_notes')).toBe(true);
  });

  it('opens pages (and bullets) as the systems they explain open, and marks them new until read', () => {
    const s = farm();
    syncNotes(s, content, T0, TZ);
    const sell = () => notesPages(s, content).find((p) => p.page.id === 'selling')!;
    expect(sell().open).toBe(true);
    expect(sell().bullets.some((b) => b.includes('165%'))).toBe(false);
    expect(notesPages(s, content).find((p) => p.page.id === 'almanac')?.open).toBe(false);
    readPage(s, content, 'selling', T0);
    expect(sell().isNew).toBe(false);
    // the market opens: the page gets its market lines and is new again, with a toast
    setFlag(s, 'market_built');
    expect(syncNotes(s, content, T0, TZ)).toEqual(['Selling: crate, market and board']);
    expect(sell().bullets.some((b) => b.includes('165%'))).toBe(true);
    expect(sell().isNew).toBe(true);
    expect(unreadPages(s, content).some((p) => p.page.id === 'selling')).toBe(true);
    // nothing new: no toast
    expect(syncNotes(s, content, T0, TZ)).toEqual([]);
  });
});

describe('tips and nudges', () => {
  it('nudges show once, fill in their text, and stay quiet if the player already does the thing', () => {
    const s = farm();
    const b = nudge(s, 'market_better', T0, { crop: '6 strawberries', market: 330, crate: 168 });
    expect(b).toMatchObject({ from: 'pip', tip: false, show: 'town:market' });
    expect(b!.text).toContain('6 strawberries sells for 330');
    expect(nudge(s, 'market_better', T0)).toBeNull();
    const t = farm();
    did(t, 'market');
    expect(nudge(t, 'market_open', T0)).toBeNull();
  });

  it('wait for the notebook and respect Tips off', () => {
    expect(nudge(farm(false), 'fresh', T0)).toBeNull();
    const s = farm();
    s.settings.tips = false;
    expect(nudge(s, 'fresh', T0)).toBeNull();
    expect(tipOfTheDay(s, content, T0)).toBeNull();
  });

  it('tip of the day: 4 hours apart, only for unlocked systems, skips retired ones, then cycles', () => {
    const s = farm();
    const first = tipOfTheDay(s, content, T0)!;
    expect(first).toMatchObject({ from: 'tobias', tip: true });
    expect(first.show.startsWith('notes:')).toBe(true);
    expect(tipOfTheDay(s, content, T0 + TIP_GAP_S - 1)).toBeNull();
    // market tips need the market
    const seen: string[] = [first.id];
    for (let i = 1; i < 60; i++) {
      const t = tipOfTheDay(s, content, T0 + i * TIP_GAP_S);
      if (t) seen.push(t.id);
    }
    expect(seen.some((id) => id === 't_crate')).toBe(false);
    expect(seen.some((id) => id === 't_almanac' || id === 't_redo')).toBe(false);
    // the cycle starts again once every eligible tip has shown
    expect(new Set(seen).size).toBeLessThan(seen.length);
    // a tip retires once the habit is there
    const m = farm();
    setFlag(m, 'market_built');
    did(m, 'market', 3);
    for (let i = 0; i < 40; i++) expect(tipOfTheDay(m, content, T0 + i * TIP_GAP_S)?.id).not.toBe('t_crate');
  });

  it('a nudge also counts as the last tip, so a tip of the day waits 4 hours after it', () => {
    const s = farm();
    nudge(s, 'fresh', T0);
    expect(tipOfTheDay(s, content, T0 + 60)).toBeNull();
    expect(tipOfTheDay(s, content, T0 + TIP_GAP_S)).not.toBeNull();
  });

  it('notices a mastery star left waiting for a day', () => {
    const s = farm();
    expect(masteryWaitingADay(s, true, T0)).toBe(false);
    expect(masteryWaitingADay(s, true, T0 + 86399)).toBe(false);
    expect(masteryWaitingADay(s, true, T0 + 86400)).toBe(true);
    expect(masteryWaitingADay(s, false, T0 + 90000)).toBe(false);
    expect(masteryWaitingADay(s, true, T0 + 90001)).toBe(false);
  });
});

describe('market changes', () => {
  it('opens with the rebuilt market square; old saves past level 5 keep it', () => {
    const s = newFarm(T0);
    s.level = 8;
    expect(marketOpen(s, content)).toBe(false);
    setFlag(s, 'market_built');
    expect(marketOpen(s, content)).toBe(true);
    const old = newFarm(T0);
    old.version = 5;
    old.level = 6;
    expect(marketOpen(migrate(JSON.parse(JSON.stringify(old))), content)).toBe(true);
    const young = newFarm(T0);
    young.version = 5;
    young.level = 4;
    expect(marketOpen(migrate(JSON.parse(JSON.stringify(young))), content)).toBe(false);
    // nothing before Chapter 3 needs the market
    for (const q of content.quests.filter((x) => x.chapter < 3)) expect(JSON.stringify(q)).not.toContain('market_sell');
  });

  it('changes prices at local midnight, 8 am and 4 pm, never backwards', () => {
    const tz = 7 * 60; // UTC−7
    const midnight = Math.ceil((T0 - tz * 60) / 86400) * 86400 + tz * 60; // a local midnight
    const p = marketPeriod(midnight, tz);
    expect(marketPeriod(midnight - 1, tz)).toBe(p - 1);
    expect(marketPeriod(midnight + 8 * 3600 - 1, tz)).toBe(p);
    expect(marketPeriod(midnight + 8 * 3600, tz)).toBe(p + 1);
    expect(marketPeriod(midnight + 16 * 3600, tz)).toBe(p + 2);
    expect(nextMarketPeriod(midnight + 3600, tz)).toBe(midnight + 8 * 3600);
    // prices and the featured crop move between periods
    const s = newFarm(T0);
    s.level = 10;
    const featured = new Set(Array.from({ length: 30 }, (_, i) => featuredCrop(s, content, p + i)));
    expect(featured.size).toBeGreaterThan(3);
    const tomato = new Set(Array.from({ length: 12 }, (_, i) => priceFactor(s, content, 'tomato', p + i)));
    expect(tomato.size).toBeGreaterThan(3);
  });
});
