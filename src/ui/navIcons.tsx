/** Shaded icons for the bottom bar, in the same style as the farm art. */
const INK = '#4a2e1a';

export function NavIcon({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {ICONS[name] ?? ICONS.farm}
    </svg>
  );
}

const ICONS: Record<string, preact.JSX.Element> = {
  farm: (
    <>
      <path d="M3 21l13-7 13 7-13 7z" fill="#a86a3c" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
      <path d="M3 21v2.5l13 7v-2.5zM29 21v2.5l-13 7v-2.5z" fill="#7a4626" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M8 20.5l9 4.8M12 18.3l9 4.8M16 16l9 4.8" stroke="#8e5530" stroke-width="1.4" stroke-linecap="round" />
      <path d="M16 19v-7" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
      <path d="M16 19v-7" stroke="#5cb83a" stroke-width="1.6" stroke-linecap="round" />
      <path d="M16 13c-1-4-4-6-7.5-5.5.5 3.5 3.5 5.5 7.5 5.5z" fill="#6cc040" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M16 11.5c1-4 4-6 7.5-5.5-.5 3.5-3.5 5.5-7.5 5.5z" fill="#4f9a2f" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
    </>
  ),
  barn: (
    <>
      <path d="M4 14L16 5l12 9v14H4z" fill="#e8323c" />
      <path d="M16 5l12 9v14h-6V12z" fill="#c42630" />
      <path d="M2.5 15L16 4.5 29.5 15" fill="none" stroke={INK} stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M2.5 15L16 4.5 29.5 15" fill="none" stroke="#fff8e6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M4 14L16 5l12 9v14H4z" fill="none" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
      <rect x="11" y="18" width="10" height="10" fill="#fff8e6" stroke={INK} stroke-width="1.8" />
      <path d="M11 18l10 10M21 18L11 28" stroke="#c42630" stroke-width="1.8" />
      <circle cx="16" cy="12.5" r="2.4" fill="#fff8e6" stroke={INK} stroke-width="1.6" />
    </>
  ),
  board: (
    <>
      <path d="M9 22v7M23 22v7" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
      <path d="M9 22v7M23 22v7" stroke="#8b5a2b" stroke-width="1.6" stroke-linecap="round" />
      <rect x="4" y="5" width="24" height="18" rx="2.5" fill="#c98a4b" stroke={INK} stroke-width="2.2" />
      <rect x="6.5" y="7.5" width="19" height="13" rx="1" fill="#a86a3c" />
      <path d="M8 9l7 .5-.5 9-7-.5z" fill="#fff8e6" stroke={INK} stroke-width="1.5" stroke-linejoin="round" />
      <path d="M17 9.5l7-.5.5 7.5-7 .5z" fill="#fff3b0" stroke={INK} stroke-width="1.5" stroke-linejoin="round" />
      <path d="M9.5 12.5h4M9.5 15h3.5M18.5 12.5h4" stroke="#b09a80" stroke-width="1.1" stroke-linecap="round" />
      <circle cx="11.5" cy="9.5" r="1.5" fill="#e8323c" stroke={INK} stroke-width="1" />
      <circle cx="20.5" cy="10" r="1.5" fill="#3f7fd0" stroke={INK} stroke-width="1" />
    </>
  ),
  town: (
    <>
      <path d="M2.5 28V16l6.5-5.5L15.5 16v12z" fill="#fff3d6" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      <path d="M1.5 16.5L9 10l7.5 6.5" fill="none" stroke={INK} stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M1.5 16.5L9 10l7.5 6.5" fill="none" stroke="#5a8fd6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M13 28V11.5L21.5 4.5 30 11.5V28z" fill="#f3d9a4" />
      <path d="M21.5 4.5L30 11.5V28h-6V9z" fill="#dcbf86" />
      <path d="M13 28V11.5L21.5 4.5 30 11.5V28z" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      <path d="M11.5 12.5l10-8.5 10 8.5" fill="none" stroke={INK} stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M11.5 12.5l10-8.5 10 8.5" fill="none" stroke="#c9483a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
      <path d="M19 28v-6.5h5V28" fill="#8b5a2b" stroke={INK} stroke-width="1.7" />
      <rect x="18.5" y="13" width="6" height="4.5" fill="#ffe8a0" stroke={INK} stroke-width="1.5" />
      <path d="M6.5 28v-5h4v5" fill="#c98a4b" stroke={INK} stroke-width="1.6" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="8" width="25" height="17.5" rx="2.5" fill="#fff8e6" />
      <path d="M3.5 22l9-7M28.5 22l-9-7" stroke="#e3d6bf" stroke-width="1.6" />
      <path d="M3.5 10.5L16 19.5l12.5-9V8H3.5z" fill="#f3e6cc" />
      <rect x="3.5" y="8" width="25" height="17.5" rx="2.5" fill="none" stroke={INK} stroke-width="2.2" />
      <path d="M4.5 9.5L16 18.5l11.5-9" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      <circle cx="16" cy="18" r="3.6" fill="#d6304a" stroke={INK} stroke-width="1.6" />
      <path d="M16 19.6l-1.6-1.5a1 1 0 0 1 1.6-1.2 1 1 0 0 1 1.6 1.2z" fill="#fff" />
    </>
  ),
  lock: (
    <>
      <path d="M11 14.5v-3.5a5 5 0 0 1 10 0v3.5" fill="none" stroke={INK} stroke-width="4.4" />
      <path d="M11 14.5v-3.5a5 5 0 0 1 10 0v3.5" fill="none" stroke="#b0b0b0" stroke-width="2" />
      <rect x="7" y="14" width="18" height="14" rx="3" fill="#e09a0b" />
      <rect x="7" y="14" width="15" height="12" rx="3" fill="#ffc531" />
      <rect x="7" y="14" width="18" height="14" rx="3" fill="none" stroke={INK} stroke-width="2.2" />
      <circle cx="16" cy="20" r="2" fill={INK} />
      <path d="M16 21v3" stroke={INK} stroke-width="2" stroke-linecap="round" />
    </>
  ),
};
