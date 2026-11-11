import type { CritterShape } from '../core/critters';

const INK = '#4a2e1a';

/** Small SVG versions of the Meadow Visitors for the sketchbook (the farm uses baked canvas art). */
export function CritterIcon({ shape, color, size = 44, unknown }: { shape: CritterShape; color: string; size?: number; unknown?: boolean }) {
  const c = unknown ? '#cfc4b0' : color;
  const ink = unknown ? '#a89a84' : INK;
  const sw = 2.4;
  const eye = (x: number, y: number) => !unknown && <circle cx={x} cy={y} r="1.6" fill={INK} />;
  let body: preact.JSX.Element;
  switch (shape) {
    case 'ladybug':
      body = (
        <>
          <ellipse cx="22" cy="25" rx="12" ry="11" fill={c} stroke={ink} stroke-width={sw} />
          <path d="M22 14v22" stroke={ink} stroke-width="2" />
          {!unknown && [[-6, -4], [6, -4], [-7, 4], [7, 4], [0, 8]].map(([dx, dy], i) => <circle key={i} cx={22 + dx} cy={25 + dy} r="2" fill={INK} />)}
          <circle cx="22" cy="12" r="5.5" fill={unknown ? c : '#2b2b2b'} stroke={ink} stroke-width="2" />
        </>
      );
      break;
    case 'bee':
      body = (
        <>
          <ellipse cx="18" cy="12" rx="6" ry="8" fill="#fff" fill-opacity="0.85" stroke={ink} stroke-width="2" transform="rotate(-25 18 12)" />
          <ellipse cx="28" cy="12" rx="6" ry="8" fill="#fff" fill-opacity="0.85" stroke={ink} stroke-width="2" transform="rotate(25 28 12)" />
          <ellipse cx="24" cy="25" rx="12" ry="9" fill={c} stroke={ink} stroke-width={sw} />
          <path d="M21 17v16M27 17v16" stroke={ink} stroke-width="3" />
          <circle cx="11" cy="24" r="5" fill={c} stroke={ink} stroke-width="2" />
          {eye(10, 23)}
        </>
      );
      break;
    case 'snail':
      body = (
        <>
          <path d="M5 35h30l-3-6H9z" fill="#d9c39a" stroke={ink} stroke-width="2" stroke-linejoin="round" />
          <circle cx="25" cy="21" r="11" fill={c} stroke={ink} stroke-width={sw} />
          <path d="M25 21m-2 0a2 2 0 1 1 4 0a5 5 0 1 1-9 1a8 8 0 1 1 15-3" fill="none" stroke={ink} stroke-width="1.6" opacity="0.6" />
          <path d="M9 29l-3-9M12 29v-9" stroke={ink} stroke-width="2" />
          {!unknown && <circle cx="6" cy="19" r="2" fill={INK} />}
          {!unknown && <circle cx="12" cy="19" r="2" fill={INK} />}
        </>
      );
      break;
    case 'caterpillar':
      body = (
        <>
          {[0, 1, 2, 3, 4].map((i) => (
            <circle key={i} cx={36 - i * 6} cy={29 - Math.sin(i * 1.1) * 3} r="5.5" fill={c} stroke={ink} stroke-width="2" />
          ))}
          <circle cx="9" cy="23" r="7" fill={c} stroke={ink} stroke-width={sw} />
          {eye(7, 22)}
          {eye(11, 22)}
          <path d="M6 17l-2-5M12 16l1-5" stroke={ink} stroke-width="2" />
        </>
      );
      break;
    case 'butterfly':
      body = (
        <>
          <ellipse cx="13" cy="15" rx="9" ry="11" fill={c} stroke={ink} stroke-width={sw} transform="rotate(-20 13 15)" />
          <ellipse cx="31" cy="15" rx="9" ry="11" fill={c} stroke={ink} stroke-width={sw} transform="rotate(20 31 15)" />
          <ellipse cx="15" cy="30" rx="6" ry="7" fill={c} stroke={ink} stroke-width="2" transform="rotate(25 15 30)" />
          <ellipse cx="29" cy="30" rx="6" ry="7" fill={c} stroke={ink} stroke-width="2" transform="rotate(-25 29 30)" />
          <ellipse cx="22" cy="23" rx="2.6" ry="11" fill="#3a2a1a" stroke={ink} stroke-width="1.5" />
          <path d="M21 13l-3-7M23 13l3-7" stroke={ink} stroke-width="1.6" />
        </>
      );
      break;
    case 'beetle':
      body = (
        <>
          <path d="M12 22l-7-3M12 30l-7 4M32 22l7-3M32 30l7 4" stroke={ink} stroke-width="2" />
          <ellipse cx="22" cy="27" rx="11" ry="11" fill={c} stroke={ink} stroke-width={sw} />
          <path d="M22 16v22" stroke={ink} stroke-width="2" opacity="0.5" />
          <circle cx="22" cy="13" r="6" fill={c} stroke={ink} stroke-width="2" />
          {color === '#7a4a2a' && !unknown && <path d="M19 9l-4-7M25 9l4-7" stroke={INK} stroke-width="3" />}
          {eye(20, 12)}
          {eye(24, 12)}
        </>
      );
      break;
    case 'dragonfly':
      body = (
        <>
          <ellipse cx="11" cy="15" rx="10" ry="3.5" fill="#e8f6ff" stroke={ink} stroke-width="2" />
          <ellipse cx="33" cy="15" rx="10" ry="3.5" fill="#e8f6ff" stroke={ink} stroke-width="2" />
          <ellipse cx="12" cy="21" rx="9" ry="3" fill="#e8f6ff" stroke={ink} stroke-width="2" />
          <ellipse cx="32" cy="21" rx="9" ry="3" fill="#e8f6ff" stroke={ink} stroke-width="2" />
          <ellipse cx="22" cy="27" rx="3" ry="13" fill={c} stroke={ink} stroke-width="2" />
          <circle cx="22" cy="10" r="5" fill={c} stroke={ink} stroke-width="2" />
          {eye(20, 9)}
          {eye(24, 9)}
        </>
      );
      break;
    case 'moth':
      body = (
        <>
          <ellipse cx="12" cy="20" rx="11" ry="9" fill={c} stroke={ink} stroke-width={sw} transform="rotate(-30 12 20)" />
          <ellipse cx="32" cy="20" rx="11" ry="9" fill={c} stroke={ink} stroke-width={sw} transform="rotate(30 32 20)" />
          <ellipse cx="22" cy="25" rx="4" ry="10" fill={c} stroke={ink} stroke-width="2" />
          <path d="M21 15l-5-8M23 15l5-8" stroke={ink} stroke-width="1.6" />
        </>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true">
      {body}
    </svg>
  );
}
