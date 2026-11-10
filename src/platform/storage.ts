import { createStore, get, set } from 'idb-keyval';
import type { FarmState } from '../core/farm';
import { makeRecord, migrate, pickLatest, type SaveRecord } from '../core/save';

const store = createStore('cropsy', 'saves');
const SLOTS = ['slotA', 'slotB'] as const;

let seq = 0;
let persistAsked = false;

/** Loads the newest valid save from the two alternating slots, or null for a new game. */
export async function loadSave(): Promise<FarmState | null> {
  const [a, b] = await Promise.all(SLOTS.map((s) => get<SaveRecord>(s, store)));
  const rec = pickLatest(a, b);
  if (!rec) return null;
  seq = rec.seq;
  return migrate(rec.data as unknown as Record<string, unknown>);
}

/**
 * Writes to the older slot, so a write interrupted mid-way never touches the last good save.
 * IndexedDB transactions are atomic; the checksum catches anything else.
 */
export async function writeSave(state: FarmState): Promise<void> {
  seq += 1;
  const slot = SLOTS[seq % 2];
  await set(slot, makeRecord(structuredClone(state), seq), store);
  try {
    localStorage.setItem('cropsy:lastSavedAt', String(Date.now()));
  } catch {
    /* storage can be unavailable in private mode; IndexedDB is the source of truth */
  }
}

/** Asks the browser not to evict our data. Safari only grants this meaningfully to installed apps. */
export async function requestPersistence(): Promise<boolean> {
  if (persistAsked || !navigator.storage?.persist) return false;
  persistAsked = true;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export function lastSavedAt(): number | null {
  try {
    const v = localStorage.getItem('cropsy:lastSavedAt');
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}
