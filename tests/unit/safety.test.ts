import 'fake-indexeddb/auto';
import { createStore, get, set } from 'idb-keyval';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/core/content';
import { barnCapacity, newFarm, SAVE_VERSION } from '../../src/core/farm';
import { collect, startRecipe } from '../../src/core/processing';
import { makeRecord } from '../../src/core/save';

const content = loadContent();
const T0 = 1_800_000_000;

// localStorage stand-in for the node test environment
const mem = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });

async function freshStorage() {
  vi.resetModules();
  const store = createStore('cropsy', 'saves');
  for (const k of ['slotA', 'slotB', 'backupDaily', 'backupBeforeRestore']) await set(k, undefined, store);
  return { store, storage: await import('../../src/platform/storage') };
}

describe('saves are never written over a farm that failed to load', () => {
  beforeEach(() => mem.clear());

  it('blocks writes when the save is from a newer version, and allows them after starting over', async () => {
    const { store, storage } = await freshStorage();
    const farm = newFarm(T0);
    farm.coins = 12_345;
    const rec = makeRecord(farm, 5);
    await set('slotA', { ...rec, version: SAVE_VERSION + 1, data: { ...rec.data, version: SAVE_VERSION + 1 }, checksum: undefined }, store);
    // re-checksum so it's a valid record that only fails at migrate()
    const { fnv1a } = await import('../../src/core/save');
    const bad = await get<Record<string, unknown>>('slotA', store);
    await set('slotA', { ...bad, checksum: fnv1a(JSON.stringify(bad!.data)) }, store);

    await expect(storage.loadSave()).rejects.toThrow(/newer/);
    expect(storage.savesBlocked()).toBe(true);
    await storage.writeSave(newFarm(T0));
    await storage.writeSave(newFarm(T0));
    expect(((await get<{ data: { coins: number } }>('slotA', store))!.data).coins).toBe(12_345);
    expect(await get('slotB', store)).toBeUndefined();
    expect(await storage.rawSaveDump()).toContain('12345');

    storage.unblockSaves();
    await storage.writeSave(newFarm(T0));
    const slots = [await get<{ data: { coins: number } }>('slotA', store), await get<{ data: { coins: number } }>('slotB', store)];
    expect(slots.some((x) => x && x.data.coins !== 12_345)).toBe(true);
  });

  it('keeps a daily backup that ordinary saves never touch', async () => {
    const { storage } = await freshStorage();
    const farm = newFarm(T0);
    farm.coins = 777;
    await storage.writeSave(farm);
    await storage.dailyBackup(farm);
    farm.coins = 1;
    await storage.writeSave(farm);
    await storage.writeSave(farm);
    await storage.dailyBackup(farm); // too soon: the morning's farm is kept
    expect((await storage.readBackup('daily'))?.state.coins).toBe(777);
    await storage.writeBackup('beforeRestore', farm);
    expect((await storage.readBackup('beforeRestore'))?.state.coins).toBe(1);
  });
});

describe('a full barn never sells things behind the player\'s back', () => {
  it('leaves finished goods in the building until there is room', () => {
    const s = newFarm(T0);
    s.level = 10;
    s.buildings.mill = { slots: 2, queue: [] };
    s.inventory.wheat = 10;
    expect(startRecipe(s, content, 'mill', 'flour', T0).ok).toBe(true);
    s.inventory.wheat = barnCapacity(s, content);
    const r = collect(s, content, 'mill', T0 + 99_999);
    expect(r.leftForSpace).toBe(1);
    expect(s.inventory.flour ?? 0).toBe(0);
    expect(s.buildings.mill.queue).toHaveLength(1);
    s.inventory.wheat = 0;
    expect(collect(s, content, 'mill', T0 + 99_999).items.flour).toBe(1);
  });
});
