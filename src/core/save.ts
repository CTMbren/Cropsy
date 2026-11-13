import { blockerAt } from './land';
import { masteryLevelFor, masteryThreshold, oldMasteryThreshold, SAVE_VERSION, type FarmState } from './farm';

/** A save record as stored in one of the two alternating slots. */
export interface SaveRecord {
  version: number;
  seq: number;
  checksum: string;
  data: FarmState;
}

/** FNV-1a 32-bit over the JSON text — catches truncated or hand-edited saves. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function makeRecord(data: FarmState, seq: number): SaveRecord {
  return { version: SAVE_VERSION, seq, checksum: fnv1a(JSON.stringify(data)), data };
}

export function isValid(r: unknown): r is SaveRecord {
  if (!r || typeof r !== 'object') return false;
  const rec = r as SaveRecord;
  return typeof rec.seq === 'number' && typeof rec.checksum === 'string' && !!rec.data && fnv1a(JSON.stringify(rec.data)) === rec.checksum;
}

/** Ordered migrations: index i upgrades a save from version i+1 to i+2. Never delete one. */
const migrations: ((d: Record<string, unknown>) => Record<string, unknown>)[] = [
  // v1 → v2 (Phase 1): barn inventory, obstacles, story, mail, request board, settings, event log.
  // Phase 0 farms were already cleared, so they get no obstacles; the story starts from Tobias's letter.
  (d) => ({
    ...d,
    obstacles: {},
    inventory: (d.inventory as Record<string, number>) ?? {},
    lastCrop: {},
    expansions: 0,
    flags: [],
    story: { done: [], active: null },
    mail: [],
    board: { day: -1, orders: [] },
    settings: { muted: false },
    log: [],
  }),
  // v2 → v3 (Phase 2): Ribbons, tools, processing buildings, restoration projects, first-harvest record.
  (d) => ({
    ...d,
    ribbons: 0,
    tools: [],
    buildings: {},
    projects: {},
    seen: Object.keys((d.inventory as Record<string, number>) ?? {}),
  }),
  // v3 → v4: friendship, barn capacity, music setting (soil and fertilizer default on plots).
  (d) => ({
    ...d,
    villagers: {},
    barnLevel: 0,
    settings: { ...((d.settings as object) ?? {}), music: true },
  }),
  // v4 → v5 (Almanac mastery): gentler mastery curve. Levels are recounted from harvests, and every
  // level the new curve adds pays the Ribbon it would have paid; its pick waits on the crop.
  (d) => {
    const harvests = (d.harvests as Record<string, number>) ?? {};
    let owed = 0;
    for (const n of Object.values(harvests)) owed += Math.max(0, masteryLevelFor(n, masteryThreshold) - masteryLevelFor(n, oldMasteryThreshold));
    return { ...d, ribbons: ((d.ribbons as number) ?? 0) + owed };
  },
  // v5 → v6 (Tobias's notes): the market now opens when the story rebuilds it. Farms that
  // already had it (level 5+) keep it.
  (d) => {
    const flags = [...((d.flags as string[]) ?? [])];
    if (((d.level as number) ?? 1) >= 5 && !flags.includes('market_early')) flags.push('market_early');
    return { ...d, flags };
  },
  // v6 → v7 (proper random rolls): Bruno's boulders never held gold because of a weak roll. Pay
  // one nugget for every 10 boulders his crew already cleared, with a note from Bruno.
  (d) => {
    const n = 4 + ((d.expansions as number) ?? 0);
    const cleared = Object.keys((d.plots as Record<string, unknown>) ?? {}).filter((k) => {
      const [x, y] = k.split(',').map(Number);
      return (x >= n || y >= n) && blockerAt(k) === 'boulder';
    }).length;
    const owed = Math.floor(cleared / 10);
    if (!owed) return d;
    const inventory = { ...((d.inventory as Record<string, number>) ?? {}) };
    inventory.gold = (inventory.gold ?? 0) + owed;
    const mail = [...((d.mail as { id: string; arrivesAt: number; read: boolean }[]) ?? [])];
    if (!mail.some((m) => m.id === 'bruno_gold')) mail.push({ id: 'bruno_gold', arrivesAt: (d.lastSeen as number) ?? 0, read: false });
    return { ...d, inventory, mail };
  },
  // v7 → v8 (crafting update): buildings may have a second line (`lines`); old ones have one.
  (d) => d,
  // v8 → v9: every pickling slot now works at once, so the Cellar Expansion is gone. Anyone who
  // bought it gets the 45,000 coins, 30 wood and 20 stone back.
  (d) => {
    const buildings = { ...((d.buildings as Record<string, { lines?: number }>) ?? {}) };
    const p = buildings.pickling;
    if (!p || (p.lines ?? 1) < 2) return d;
    buildings.pickling = { ...p, lines: 1 };
    const inventory = { ...((d.inventory as Record<string, number>) ?? {}) };
    inventory.wood = (inventory.wood ?? 0) + 30;
    inventory.stone = (inventory.stone ?? 0) + 20;
    return { ...d, buildings, inventory, coins: ((d.coins as number) ?? 0) + 45000 };
  },
];

export class SaveTooNewError extends Error {}

export function migrate(data: Record<string, unknown>): FarmState {
  let d = data;
  let v = typeof d.version === 'number' ? d.version : 1;
  if (v > SAVE_VERSION) throw new SaveTooNewError(`Save version ${v} is newer than this game (${SAVE_VERSION}). Reload to update.`);
  while (v < SAVE_VERSION) {
    d = migrations[v - 1](d);
    v += 1;
    d.version = v;
  }
  return d as unknown as FarmState;
}

/** Picks the newest valid record of the two slots. */
export function pickLatest(a: unknown, b: unknown): SaveRecord | null {
  const valid = [a, b].filter(isValid) as SaveRecord[];
  if (!valid.length) return null;
  return valid.sort((x, y) => y.seq - x.seq)[0];
}

/** Copyable backup code: base64url of the JSON. (Compression comes later.) */
export function toSaveCode(data: FarmState): string {
  const bytes = new TextEncoder().encode(JSON.stringify(makeRecord(data, 0)));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromSaveCode(code: string): FarmState {
  const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const rec = JSON.parse(new TextDecoder().decode(bytes));
  if (!isValid(rec)) throw new Error('That save code is damaged or incomplete.');
  return migrate(rec.data as unknown as Record<string, unknown>);
}
