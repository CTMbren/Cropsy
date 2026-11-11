/**
 * Optional, privacy-friendly visit counter. Off unless the build sets VITE_GOATCOUNTER to a
 * GoatCounter site code (a free, cookie-free counter). It sends one page view per launch with no
 * identifiers: no cookies, no save data, nothing about the farm.
 */
export function countVisit(): void {
  const code = import.meta.env.VITE_GOATCOUNTER as string | undefined;
  if (!code || !/^[a-z0-9-]+$/i.test(code)) return;
  const standalone = window.matchMedia('(display-mode: standalone)').matches;
  const url = `https://${code}.goatcounter.com/count?p=${encodeURIComponent(standalone ? '/app' : '/web')}&t=Cropsy&rnd=${Math.random().toString(36).slice(2)}`;
  // GoatCounter's tracking pixel: a plain GET with no cookies
  const img = new Image();
  img.referrerPolicy = 'no-referrer';
  img.src = url;
}
