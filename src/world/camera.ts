/** The player's own zoom and pan, remembered on this phone (a convenience: losing it is harmless). */
export interface SavedCamera {
  /** Field size it was saved for; a new field size means fitting again. */
  w: number;
  h: number;
  scale: number;
  /** Offset from the fitted position, in screen pixels. */
  dx: number;
  dy: number;
}

const KEY = 'cropsy:camera';

export function loadCamera(): SavedCamera | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as SavedCamera | null;
    return v && Number.isFinite(v.scale) ? v : null;
  } catch {
    return null;
  }
}

export function saveCamera(c: SavedCamera): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* storage unavailable */
  }
}

export function clearCamera(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}
