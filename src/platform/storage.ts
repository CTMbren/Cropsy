import { createStore, get, set } from 'idb-keyval';
import type { FarmState } from '../core/farm';
import { makeRecord, migrate, pickLatest, type SaveRecord } from '../core/save';

const store = createStore('cropsy', 'saves');
const SLOTS = ['slotA', 'slotB'] as const;

let seq = 0;
let persistAsked = false;
/** Set when a save exists but couldn't be loaded: nothing may be written over it. */
let writeBlocked = false;

/** Backups that ordinary saves never touch: the farm at the start of each day, and before a restore. */
export const BACKUP_KEYS = { daily: 'backupDaily', beforeRestore: 'backupBeforeRestore' } as const;
type BackupKey = keyof typeof BACKUP_KEYS;
const DAY_MS = 20 * 3600 * 1000;

/** Loads the newest valid save from the two alternating slots, or null for a new game. */
export async function loadSave(): Promise<FarmState | null> {
  const [a, b] = await Promise.all(SLOTS.map((s) => get<SaveRecord>(s, store)));
  // any slot data at all means there is a farm to protect, even if it turns out unreadable
  if (a || b) writeBlocked = true;
  const rec = pickLatest(a, b);
  if (!rec) {
    if (a || b) throw new Error('Both save slots failed their checksum');
    return null;
  }
  seq = rec.seq;
  const state = migrate(rec.data as unknown as Record<string, unknown>);
  writeBlocked = false;
  return state;
}

/** True when a save exists but couldn't be loaded, so saving is switched off to protect it. */
export const savesBlocked = () => writeBlocked;

/** The player chose to start over (or restored something) after a failed load: saving may resume. */
export function unblockSaves(): void {
  writeBlocked = false;
}

/** Everything in the save store, raw, for copying out a farm the game couldn't load. */
export async function rawSaveDump(): Promise<string> {
  const keys = [...SLOTS, ...Object.values(BACKUP_KEYS)];
  const vals = await Promise.all(keys.map((k) => get(k, store).catch(() => null)));
  return JSON.stringify(Object.fromEntries(keys.map((k, i) => [k, vals[i] ?? null])));
}

/** Writes a backup slot that ordinary saves never touch. */
export async function writeBackup(which: BackupKey, state: FarmState): Promise<void> {
  await set(BACKUP_KEYS[which], { ...makeRecord(structuredClone(state), 0), savedAt: Date.now() }, store);
}

/** Refreshes the daily backup with a farm that just loaded fine, at most once every ~20 hours. */
export async function dailyBackup(state: FarmState): Promise<void> {
  const cur = await get<{ savedAt?: number }>(BACKUP_KEYS.daily, store).catch(() => undefined);
  if (cur?.savedAt && Date.now() - cur.savedAt < DAY_MS) return;
  await writeBackup('daily', state);
}

/** A backup slot's farm and when it was taken, or null if there isn't a readable one. */
export async function readBackup(which: BackupKey): Promise<{ state: FarmState; savedAt: number } | null> {
  const rec = await get<SaveRecord & { savedAt?: number }>(BACKUP_KEYS[which], store).catch(() => undefined);
  const ok = rec && pickLatest(rec, undefined);
  if (!ok) return null;
  try {
    return { state: migrate(ok.data as unknown as Record<string, unknown>), savedAt: rec.savedAt ?? 0 };
  } catch {
    return null;
  }
}

/**
 * Writes to the older slot, so a write interrupted mid-way never touches the last good save.
 * IndexedDB transactions are atomic; the checksum catches anything else.
 */
export async function writeSave(state: FarmState): Promise<void> {
  if (writeBlocked) return;
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
