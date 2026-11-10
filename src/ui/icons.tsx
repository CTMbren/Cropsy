/** Chunky outlined icons drawn inline so they stay crisp and need no downloads. */
const INK = '#4a2e1a';

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 32 32', 'aria-hidden': true as const };
  switch (name) {
    case 'menu':
      return (
        <svg {...common}>
          <path d="M7 10h18M7 16h18M7 22h18" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
        </svg>
      );
    case 'share':
      return (
        <svg {...common} style={{ verticalAlign: '-3px' }}>
          <path d="M16 4v16M10 10l6-6 6 6M8 16v11h16V16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      );
    case 'farm':
      return (
        <svg {...common}>
          <path d="M4 20 16 13l12 7-12 7z" fill="#a86a3c" stroke={INK} stroke-width="2.4" stroke-linejoin="round" />
          <path d="M16 13v-5m0 0c-3 0-5-2-5-4 3 0 5 2 5 4zm0 0c3 0 5-2 5-4-3 0-5 2-5 4z" fill="#5cb83a" stroke={INK} stroke-width="2" stroke-linejoin="round" />
        </svg>
      );
    case 'barn':
      return (
        <svg {...common}>
          <path d="M5 14 16 5l11 9v13H5z" fill="#e8323c" stroke={INK} stroke-width="2.4" stroke-linejoin="round" />
          <path d="M12 27v-8h8v8M12 19l8 8M20 19l-8 8" fill="#fff" stroke={INK} stroke-width="2" stroke-linejoin="round" />
        </svg>
      );
    case 'board':
      return (
        <svg {...common}>
          <rect x="6" y="5" width="20" height="17" rx="2" fill="#c98a4b" stroke={INK} stroke-width="2.4" />
          <path d="M10 22v6M22 22v6" stroke={INK} stroke-width="2.6" stroke-linecap="round" />
          <rect x="9" y="8" width="7" height="8" fill="#fff8e6" stroke={INK} stroke-width="1.6" />
          <rect x="17.5" y="9" width="6" height="7" fill="#fff8e6" stroke={INK} stroke-width="1.6" />
        </svg>
      );
    case 'mail':
      return (
        <svg {...common}>
          <rect x="4" y="8" width="24" height="17" rx="2.5" fill="#fff8e6" stroke={INK} stroke-width="2.4" />
          <path d="m5 10 11 8 11-8" fill="none" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="8" y="14" width="16" height="13" rx="2.5" fill="#ffc531" stroke={INK} stroke-width="2.4" />
          <path d="M11 14v-3a5 5 0 0 1 10 0v3" fill="none" stroke={INK} stroke-width="2.4" />
        </svg>
      );
    case 'replant':
      return (
        <svg {...common}>
          <path d="M8 16a8 8 0 0 1 14-5.3M24 16a8 8 0 0 1-14 5.3" fill="none" stroke={INK} stroke-width="2.6" stroke-linecap="round" />
          <path d="m22 5 .5 6-6-.5M10 27l-.5-6 6 .5" fill="none" stroke={INK} stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M16 18v-4m0 0c-2 0-3.5-1.4-3.5-3 2 0 3.5 1.4 3.5 3zm0 0c2 0 3.5-1.4 3.5-3-2 0-3.5 1.4-3.5 3z" fill="#5cb83a" stroke={INK} stroke-width="1.6" />
        </svg>
      );
    case 'wood':
      return (
        <svg {...common}>
          <rect x="4" y="11" width="24" height="10" rx="5" fill="#c98a4b" stroke={INK} stroke-width="2.4" />
          <circle cx="23" cy="16" r="3" fill="#e8b27a" stroke={INK} stroke-width="1.8" />
        </svg>
      );
    case 'stone':
      return (
        <svg {...common}>
          <path d="M6 22c-1-5 3-11 9-11 7-1 12 4 11 10-1 4-5 5-10 5s-9 0-10-4z" fill="#9a9a9a" stroke={INK} stroke-width="2.4" />
          <path d="M11 16c2-2 5-2 7-1" fill="none" stroke="#d0d0d0" stroke-width="2" stroke-linecap="round" />
        </svg>
      );
    case 'ribbon':
      return (
        <svg {...common}>
          <path d="m11 17-4 11 5-2 3 4 2-12M21 17l4 11-5-2-3 4-2-12" fill="#3a8fd6" stroke={INK} stroke-width="2" stroke-linejoin="round" />
          <circle cx="16" cy="12" r="8" fill="#ffc531" stroke={INK} stroke-width="2.4" />
          <circle cx="16" cy="12" r="4" fill="#fff6b0" stroke={INK} stroke-width="1.6" />
        </svg>
      );
    case 'town':
      return (
        <svg {...common}>
          <path d="M3 27V15l6-5 6 5v12z" fill="#fff8e6" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
          <path d="M13 27V11l8-6 8 6v16z" fill="#f3d9a4" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
          <path d="M19 27v-6h4v6M7 27v-5h4v5" fill="#c98a4b" stroke={INK} stroke-width="1.8" />
        </svg>
      );
    case 'saw':
      return (
        <svg {...common}>
          <path d="M6 22 22 6l4 4-16 16z" fill="#cfd8dc" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
          <path d="m9 23-2 2m5-5-2 2m5-5-2 2m5-5-2 2m5-5-2 2" stroke={INK} stroke-width="1.6" />
          <rect x="21" y="3" width="8" height="6" rx="2" transform="rotate(45 25 6)" fill="#c98a4b" stroke={INK} stroke-width="2" />
        </svg>
      );
    case 'pickaxe':
      return (
        <svg {...common}>
          <path d="M8 26 22 12" stroke={INK} stroke-width="5" stroke-linecap="round" />
          <path d="M8 26 22 12" stroke="#c98a4b" stroke-width="2.5" stroke-linecap="round" />
          <path d="M12 7c6-3 12-1 15 4l-3 1c-3-3-7-4-11-3z" fill="#cfd8dc" stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
        </svg>
      );
    case 'building':
      return (
        <svg {...common}>
          <path d="M5 14 16 6l11 8v13H5z" fill="#f3ede0" stroke={INK} stroke-width="2.4" stroke-linejoin="round" />
          <path d="M3 15 16 5l13 10" fill="none" stroke="#e8323c" stroke-width="3" stroke-linecap="round" />
          <rect x="13" y="18" width="6" height="9" fill="#c98a4b" stroke={INK} stroke-width="2" />
        </svg>
      );
    case 'gold':
      return (
        <svg {...common}>
          <path d="M6 22 11 12h10l5 10z" fill="#ffc531" stroke={INK} stroke-width="2.4" stroke-linejoin="round" />
          <path d="M12 15h4" stroke="#fff6b0" stroke-width="2" stroke-linecap="round" />
        </svg>
      );
    default:
      return null;
  }
}
