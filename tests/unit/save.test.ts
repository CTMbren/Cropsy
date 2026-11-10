import { describe, expect, it } from 'vitest';
import { newFarm, SAVE_VERSION } from '../../src/core/farm';
import { fromSaveCode, makeRecord, migrate, pickLatest, SaveTooNewError, toSaveCode } from '../../src/core/save';

const T0 = 1_800_000_000;

describe('save slots', () => {
  it('picks the newest valid slot and skips a corrupted one', () => {
    const a = makeRecord(newFarm(T0), 4);
    const b = makeRecord(newFarm(T0), 5);
    expect(pickLatest(a, b)?.seq).toBe(5);
    const corrupted = { ...b, data: { ...b.data, coins: 999999 } };
    expect(pickLatest(a, corrupted)?.seq).toBe(4);
    expect(pickLatest(undefined, null)).toBeNull();
  });

  it('refuses to load a save written by newer code', () => {
    expect(() => migrate({ ...newFarm(T0), version: SAVE_VERSION + 1 } as never)).toThrow(SaveTooNewError);
  });
});

describe('backup codes', () => {
  it('round-trips a farm', () => {
    const s = newFarm(T0);
    s.coins = 1234;
    expect(fromSaveCode(toSaveCode(s)).coins).toBe(1234);
  });

  it('rejects a damaged code', () => {
    const code = toSaveCode(newFarm(T0));
    expect(() => fromSaveCode(code.slice(0, -12) + 'AAAAAAAAAAAA')).toThrow();
  });
});
