/** The HTML loading screen in index.html: progress while art loads, then fade out. */

/** Shows real progress (0–1) once there are files to wait for; until then the bar just animates. */
export function splashProgress(p: number): void {
  const bar = document.querySelector<HTMLElement>('#splash .bar');
  const fill = bar?.querySelector<HTMLElement>('i');
  if (!bar || !fill) return;
  bar.classList.add('real');
  fill.style.width = `${Math.round(Math.max(0.05, Math.min(1, p)) * 100)}%`;
}

/** Fades out the loading screen. */
export function hideSplash(): void {
  const el = document.getElementById('splash');
  if (!el || el.classList.contains('gone')) return;
  el.classList.add('gone');
  window.setTimeout(() => el.remove(), 400);
}
