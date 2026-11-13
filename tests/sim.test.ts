import { describe, expect, it } from 'vitest';
import { fmtHours, simulate } from '../tools/sim';

describe('economy pacing (simulated casual player)', () => {
  const r = simulate(70);
  it('prints the timeline', () => {
    const rows = Object.entries(r.levelAt).map(([l, h]) => `L${l.padStart(2)}  ${fmtHours(h)}`);
    console.log(['Level timeline:', ...rows].join('\n'));
    console.log(['Milestones:', ...r.events.filter((e) => !e.e.startsWith('quest ')).map((e) => `${fmtHours(e.h).padEnd(8)} ${e.e}`)].join('\n'));
    console.log(`Final: level ${r.final.level}, ${r.final.coins} coins, ${r.final.ribbons} ribbons, farm ${r.final.width}x${r.final.height}, quests ${r.final.story.done.length}`);
    const b = r.board;
    const days = 70;
    console.log(`Board: filled ${JSON.stringify(b.filled)}, order coins ${b.orderCoins}, crate coins ${b.crateCoins}, order share ${(b.orderCoins / (b.orderCoins + b.crateCoins)).toFixed(2)}, board ribbons/day ${(b.ribbons / days).toFixed(2)}, specials ${b.specials} (${b.specialsIn24h} within 24 h), peak plot share ${b.peakPlotShare.toFixed(2)}`);
    console.log(`Mastery: picks ${JSON.stringify(b.picks)}, barn overflow shipped ${b.overflow}`);
    expect(r.final.level).toBeGreaterThan(1);
  });

  it('prints the same player selling at the market', () => {
    const m = simulate(70, 'value', 'market');
    const q = (id: string) => fmtHours(m.events.find((e) => e.e === `quest ${id}`)?.h ?? NaN);
    console.log(`Market seller: L22 ${fmtHours(m.levelAt[22])}, L30 ${fmtHours(m.levelAt[30])}, Chapter 5 ends ${q('ch5_tobias')}, Chapter 6 ends ${q('ch6_ferry')}, market coins ${m.board.marketCoins}, crate coins ${m.board.crateCoins}, order coins ${m.board.orderCoins}`);
    expect(m.board.marketCoins).toBeGreaterThan(0);
  });
});
