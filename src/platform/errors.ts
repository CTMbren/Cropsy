/**
 * A small local error log. Nothing leaves the phone: the player can copy a problem report from
 * Settings and send it themselves. Kept in localStorage (not the save) so a broken save can't
 * hide the errors that broke it.
 */
const KEY = 'cropsy:errors';
const MAX = 20;

export interface ErrorEntry {
  t: number;
  msg: string;
  where?: string;
}

export function recentErrors(): ErrorEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as ErrorEntry[];
  } catch {
    return [];
  }
}

export function recordError(msg: string, where?: string): void {
  try {
    const list = recentErrors();
    // don't fill the log with one error repeating every frame
    if (list.length && list[list.length - 1].msg === msg) return;
    list.push({ t: Date.now(), msg: msg.slice(0, 300), where: where?.slice(0, 200) });
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* storage unavailable */
  }
}

export function clearErrors(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function installErrorLog(): void {
  window.addEventListener('error', (e) => recordError(e.message || String(e.error), e.error?.stack?.split('\n')[1]?.trim() ?? `${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { message?: string; stack?: string } | string;
    recordError(typeof r === 'string' ? r : (r?.message ?? 'Unhandled promise rejection'), typeof r === 'string' ? undefined : r?.stack?.split('\n')[1]?.trim());
  });
}
