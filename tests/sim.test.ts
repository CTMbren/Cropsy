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
});
