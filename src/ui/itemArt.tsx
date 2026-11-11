import type { JSX } from 'preact';

/**
 * Illustrated icons for crops, goods and decorations, in the same style as the farm art: warm ink
 * outline, light from the top-left, one shadow tone and one highlight. Unknown ids fall back to the
 * old coloured dot so new content never shows a blank.
 */

const INK = '#4a2e1a';

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
const shade = (c: string, t = 0.26) => mix(c, '#3a1f0c', t);
const light = (c: string, t = 0.3) => mix(c, '#ffffff', t);

/** A shaded ball: shadow crescent bottom-right, highlight top-left, ink outline. */
function Ball({ cx, cy, r, fill, rx = r, ry = r, sw = 2 }: { cx: number; cy: number; r: number; fill: string; rx?: number; ry?: number; sw?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={shade(fill)} />
      <ellipse cx={cx - rx * 0.13} cy={cy - ry * 0.13} rx={rx * 0.86} ry={ry * 0.86} fill={fill} />
      <ellipse cx={cx - rx * 0.38} cy={cy - ry * 0.42} rx={rx * 0.32} ry={ry * 0.2} fill="#fff" opacity="0.6" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={INK} stroke-width={sw} />
    </g>
  );
}

/** A pointed leaf from (x, y) at `deg` degrees from straight up. */
function Leaf({ x, y, len, w, deg, fill, sw = 1.6 }: { x: number; y: number; len: number; w: number; deg: number; fill: string; sw?: number }) {
  const h = w / 2;
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      <path d={`M0 0 C${-h * 1.3} ${-len * 0.35} ${-h} ${-len * 0.75} 0 ${-len} C${h} ${-len * 0.75} ${h * 1.3} ${-len * 0.35} 0 0Z`} fill={fill} />
      <path d={`M0 0 L0 ${-len} C${h} ${-len * 0.75} ${h * 1.3} ${-len * 0.35} 0 0Z`} fill={shade(fill, 0.2)} />
      <path d={`M0 ${-len * 0.12} L0 ${-len * 0.8}`} stroke={shade(fill, 0.4)} stroke-width="0.8" />
      <path d={`M0 0 C${-h * 1.3} ${-len * 0.35} ${-h} ${-len * 0.75} 0 ${-len} C${h} ${-len * 0.75} ${h * 1.3} ${-len * 0.35} 0 0Z`} fill="none" stroke={INK} stroke-width={sw} stroke-linejoin="round" />
    </g>
  );
}

const twinkle = (x: number, y: number, r: number, fill = '#fff') => (
  <path d={`M${x} ${y - r}L${x + r * 0.3} ${y - r * 0.3}L${x + r} ${y}L${x + r * 0.3} ${y + r * 0.3}L${x} ${y + r}L${x - r * 0.3} ${y + r * 0.3}L${x - r} ${y}L${x - r * 0.3} ${y - r * 0.3}Z`} fill={fill} />
);

const G1 = '#4caf50';
const G2 = '#3fa34d';

const ICONS: Record<string, () => JSX.Element> = {
  radish: () => (
    <>
      <Leaf x={16} y={13} len={11} w={6} deg={-35} fill={G1} />
      <Leaf x={16} y={13} len={11} w={6} deg={35} fill={G1} />
      <Leaf x={16} y={13} len={12} w={6.5} deg={0} fill={light(G1, 0.1)} />
      <path d="M16 29l-1.6-3.5h3.2z" fill="#fff" stroke={INK} stroke-width="1.4" stroke-linejoin="round" />
      <Ball cx={16} cy={20} r={7.5} fill="#e8506a" />
    </>
  ),
  carrot: () => (
    <>
      <Leaf x={20} y={11} len={9} w={4} deg={-25} fill={G2} />
      <Leaf x={20} y={11} len={10} w={4} deg={15} fill={G2} />
      <Leaf x={20} y={11} len={8} w={4} deg={55} fill={shade(G2, 0.1)} />
      <path d="M17 9.5c4-1.2 7.5 2 6.6 5.8L9 28.5c-1.2 1-2.6-.4-1.6-1.6z" fill="#f28a1e" />
      <path d="M23.6 15.3L9 28.5c-1.2 1-2.6-.4-1.6-1.6l12.5-14z" fill={shade('#f28a1e', 0.2)} />
      <path d="M13 18.5l2 1.5M10.5 22.5l2 1.3M16.5 15l1.6 1.2" stroke={shade('#f28a1e', 0.45)} stroke-width="1.2" stroke-linecap="round" />
      <path d="M17 9.5c4-1.2 7.5 2 6.6 5.8L9 28.5c-1.2 1-2.6-.4-1.6-1.6z" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
    </>
  ),
  lettuce: () => (
    <>
      {[-72, -38, 38, 72].map((d) => (
        <Leaf key={d} x={16} y={27} len={15} w={12} deg={d} fill={d > 0 ? shade('#5cb83a', 0.08) : '#5cb83a'} />
      ))}
      <Ball cx={16} cy={17.5} r={8.5} fill="#9ad94f" />
      <path d="M11 15c2-2.5 4-2.5 5 0 1-2.5 3.5-2.5 5 0M10.5 20c2 1.5 4 1.5 5.5 0 1.5 1.5 3.5 1.5 5.5 0" fill="none" stroke={shade('#9ad94f', 0.35)} stroke-width="1.2" stroke-linecap="round" />
      <path d="M16 27v-7" stroke={light('#9ad94f', 0.4)} stroke-width="1.4" stroke-linecap="round" />
    </>
  ),
  strawberry: () => (
    <>
      <path d="M16 29C8 24 5.5 16.5 9 12.5c2.5-2.7 5.5-1.6 7-.5 1.5-1.1 4.5-2.2 7 .5 3.5 4-1 11.5-7 16.5z" fill={shade('#e8323c')} />
      <path d="M15.4 27C9 22.5 7 16.5 9.6 13.2c2.2-2.3 4.8-1.3 6.2-.3 1.3-1 3.8-1.9 5.8.3 2.6 3-.8 9.4-6.2 13.8z" fill="#e8323c" />
      <ellipse cx="11.5" cy="15.5" rx="2" ry="1.3" fill="#fff" opacity="0.55" />
      {[
        [12, 19],
        [16, 17],
        [19.5, 19.5],
        [14, 23],
        [18, 23.5],
        [16, 20.5],
      ].map(([x, y]) => (
        <ellipse key={`${x},${y}`} cx={x} cy={y} rx="0.8" ry="1.1" fill="#ffe082" />
      ))}
      <path d="M16 29C8 24 5.5 16.5 9 12.5c2.5-2.7 5.5-1.6 7-.5 1.5-1.1 4.5-2.2 7 .5 3.5 4-1 11.5-7 16.5z" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      <path d="M9.5 11.5l4 .2L16 8l2.5 3.7 4-.2-3 3-3.5-1.5-3.5 1.5z" fill={G2} stroke={INK} stroke-width="1.5" stroke-linejoin="round" />
      <path d="M16 8V4.5" stroke={INK} stroke-width="2" stroke-linecap="round" />
    </>
  ),
  wheat: () => (
    <>
      <path d="M16 30V14M16 30l-6-14M16 30l6-14" stroke={INK} stroke-width="3.2" stroke-linecap="round" />
      <path d="M16 30V14M16 30l-6-14M16 30l6-14" stroke="#c9a227" stroke-width="1.6" stroke-linecap="round" />
      {[
        [10, 11, -22],
        [22, 11, 22],
        [16, 9, 0],
      ].map(([x, y, r]) => (
        <g key={x} transform={`rotate(${r} ${x} ${y + 4})`}>
          <Ball cx={x} cy={y} r={2.8} rx={2.8} ry={6.2} fill="#f2c230" sw={1.6} />
          <path d={`M${x - 2} ${y - 2}l2 1 2-1M${x - 2} ${y + 1}l2 1 2-1`} fill="none" stroke={shade('#f2c230', 0.45)} stroke-width="1" />
        </g>
      ))}
      <path d="M11 22h10" stroke={INK} stroke-width="3.5" stroke-linecap="round" />
      <path d="M11 22h10" stroke="#e07a3a" stroke-width="1.8" stroke-linecap="round" />
    </>
  ),
  tomato: () => (
    <>
      <Ball cx={16} cy={18} r={11} rx={11.5} ry={10} fill="#e53935" />
      <path d="M9.5 10.5l4.5 1.2L16 8l2 3.7 4.5-1.2-3 3.3H12.5z" fill="#43a047" stroke={INK} stroke-width="1.5" stroke-linejoin="round" />
      <path d="M16 8.5V5" stroke={INK} stroke-width="2.2" stroke-linecap="round" />
    </>
  ),
  corn: () => (
    <>
      <Ball cx={16} cy={14} r={5.5} rx={5.5} ry={11} fill="#ffd54f" />
      {[-6, -2, 2, 6, 10].map((dy) =>
        [-2.3, 0.4, 3].map((dx) => <circle key={`${dx},${dy}`} cx={16 + dx - 0.4} cy={13 + dy} r="0.75" fill={shade('#ffd54f', 0.35)} />),
      )}
      <Leaf x={14} y={30} len={17} w={8} deg={-18} fill="#7cb342" />
      <Leaf x={18} y={30} len={16} w={8} deg={22} fill={shade('#7cb342', 0.08)} />
    </>
  ),
  potato: () => (
    <>
      <path d="M6 18c-1-6 5-10 11-9.5 6 .5 10 4 9 9.5-1 5.5-6 7-11 6.5S7 23 6 18z" fill={shade('#c9955c')} />
      <path d="M7 17.2c-.7-5 4.5-8.5 9.7-8 5.3.4 8.7 3.4 7.9 8-.8 4.6-5.2 5.8-9.5 5.4S7.7 21.4 7 17.2z" fill="#c9955c" />
      <ellipse cx="11.5" cy="12.8" rx="3" ry="1.4" fill="#fff" opacity="0.5" />
      {[
        [11, 17],
        [17, 14],
        [21, 18.5],
        [15.5, 20.5],
      ].map(([x, y]) => (
        <path key={x} d={`M${x - 1} ${y}q1 -1 2 0`} fill="none" stroke={shade('#c9955c', 0.5)} stroke-width="1.2" stroke-linecap="round" />
      ))}
      <path d="M6 18c-1-6 5-10 11-9.5 6 .5 10 4 9 9.5-1 5.5-6 7-11 6.5S7 23 6 18z" fill="none" stroke={INK} stroke-width="2" />
    </>
  ),
  blueberry: () => (
    <>
      <Leaf x={16} y={9} len={8} w={6} deg={-50} fill="#388e3c" />
      <Leaf x={16} y={9} len={8} w={6} deg={45} fill="#388e3c" />
      <Ball cx={11} cy={20} r={6.5} fill="#4a5fd0" />
      <Ball cx={21} cy={20} r={6.5} fill={shade('#4a5fd0', 0.08)} />
      <Ball cx={16} cy={13.5} r={6} fill={light('#4a5fd0', 0.06)} />
      {[
        [11, 20],
        [21, 20],
        [16, 13.5],
      ].map(([x, y]) => (
        <path key={x} d={`M${x - 1.6} ${y - 0.5}l1.6 1.3 1.6-1.3`} fill="none" stroke={INK} stroke-width="1.2" />
      ))}
    </>
  ),
  pumpkin: () => (
    <>
      <path d="M16 9c0-3 1.5-4.5 4-5" fill="none" stroke={INK} stroke-width="3.6" stroke-linecap="round" />
      <path d="M16 9c0-3 1.5-4.5 4-5" fill="none" stroke="#6d8b2f" stroke-width="1.8" stroke-linecap="round" />
      <Ball cx={16} cy={18.5} r={12} rx={13} ry={10} fill="#f57c00" />
      <path d="M16 9c-4.5 0-6 4.5-6 9.5s1.5 9.5 6 9.5M16 9c4.5 0 6 4.5 6 9.5s-1.5 9.5-6 9.5" fill="none" stroke={shade('#f57c00', 0.4)} stroke-width="1.4" />
    </>
  ),
  sunflower: () => (
    <>
      {Array.from({ length: 12 }, (_, i) => (
        <Leaf key={i} x={16} y={16} len={13} w={6} deg={i * 30} fill={i % 2 ? shade('#fbc02d', 0.08) : '#fbc02d'} sw={1.3} />
      ))}
      <Ball cx={16} cy={16} r={6.5} fill="#6d4c2a" />
      {[
        [14, 15],
        [17.5, 14],
        [16, 18.5],
        [18.5, 17],
        [13.5, 18],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="0.8" fill="#4a321c" />
      ))}
    </>
  ),
  cotton: () => (
    <>
      <path d="M8 26l4-5M24 26l-4-5M16 29v-6" stroke={INK} stroke-width="3" stroke-linecap="round" />
      <path d="M8 26l4-5M24 26l-4-5M16 29v-6" stroke="#8d6e4a" stroke-width="1.4" stroke-linecap="round" />
      <Ball cx={11} cy={16} r={6} fill="#f5f5f5" />
      <Ball cx={21} cy={16} r={6} fill="#f5f5f5" />
      <Ball cx={16} cy={11} r={6.5} fill="#ffffff" />
      <Ball cx={16} cy={19} r={5.5} fill="#f5f5f5" />
    </>
  ),
  grapes: () => (
    <>
      <Leaf x={17} y={9} len={10} w={9} deg={55} fill="#4caf50" />
      <path d="M15 9V4" stroke={INK} stroke-width="2.2" stroke-linecap="round" />
      {[
        [10.5, 12],
        [16, 12],
        [21.5, 12],
        [13, 17.5],
        [19, 17.5],
        [16, 23],
      ].map(([x, y]) => (
        <Ball key={`${x},${y}`} cx={x} cy={y} r={3.7} fill="#8e44ad" sw={1.6} />
      ))}
    </>
  ),
  coffee: () => (
    <>
      {[
        [11.5, 17, -25],
        [20.5, 15, 20],
      ].map(([x, y, r]) => (
        <g key={x} transform={`rotate(${r} ${x} ${y})`}>
          <Ball cx={x} cy={y} r={5.5} rx={5.5} ry={8} fill="#8d4a2b" />
          <path d={`M${x} ${y - 6.5}c-2 3 2 10 0 13`} fill="none" stroke={INK} stroke-width="1.6" stroke-linecap="round" />
        </g>
      ))}
    </>
  ),
  golden_melon: () => (
    <>
      <path d="M16 7.5c0-2 1-3.5 3-4" fill="none" stroke={INK} stroke-width="3" stroke-linecap="round" />
      <path d="M16 7.5c0-2 1-3.5 3-4" fill="none" stroke="#7cb342" stroke-width="1.4" stroke-linecap="round" />
      <Ball cx={16} cy={18} r={11.5} rx={12} ry={10.5} fill="#ffc531" />
      <path d="M8 13q8 6 16 0M6 19q10 6 20 0M9 25q7 3 14 0M11 9.5q-3 8.5 0 17M16 8v20.5M21 9.5q3 8.5 0 17" fill="none" stroke={shade('#ffc531', 0.3)} stroke-width="1" opacity="0.8" />
      <ellipse cx="16" cy="18" rx="12" ry="10.5" fill="none" stroke={INK} stroke-width="2" />
      {twinkle(25, 8, 3.5, '#fff8d0')}
    </>
  ),
  // goods
  flour: () => (
    <>
      <path d="M9 11c-2 5-3 12-1 16 1 2 15 2 16 0 2-4 1-11-1-16z" fill={shade('#f3ead2', 0.12)} />
      <path d="M9.5 11.5c-1.8 4.6-2.6 11-.9 14.5 1.2 1.3 12 1.4 14 .6.5-3.7-.2-10.4-1.9-15.1z" fill="#f3ead2" />
      <path d="M9 11c-2 5-3 12-1 16 1 2 15 2 16 0 2-4 1-11-1-16z" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      <path d="M9 11c1-3 3-5 7-5s6 2 7 5" fill="#f3ead2" stroke={INK} stroke-width="2" />
      <path d="M11 11h10" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
      <path d="M11 11h10" stroke="#c0562a" stroke-width="1.6" stroke-linecap="round" />
      <path d="M16 25v-8M16 19l-2.5-2M16 21.5l2.5-2M16 19l2.5-2M16 21.5l-2.5-2" stroke="#c9a227" stroke-width="1.4" stroke-linecap="round" />
    </>
  ),
  jam: () => (
    <>
      <rect x="8" y="11" width="16" height="17" rx="4" fill={shade('#d6304a')} />
      <rect x="8.5" y="11" width="13.5" height="15.5" rx="3.6" fill="#d6304a" />
      <rect x="10" y="17" width="12" height="7" rx="1.5" fill="#fff8e6" stroke={INK} stroke-width="1.3" />
      <path d="M13 20.5h6" stroke="#d6304a" stroke-width="1.6" stroke-linecap="round" />
      <ellipse cx="11" cy="14" rx="1.2" ry="2.2" fill="#fff" opacity="0.55" />
      <rect x="8" y="11" width="16" height="17" rx="4" fill="none" stroke={INK} stroke-width="2" />
      <path d="M7 8.5q9-3 18 0l-1 3.5H8z" fill="#fff" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M10 8l1 3.5M14 7.2l.5 4.3M18 7.2l-.5 4.3M22 8l-1 3.5" stroke="#d6304a" stroke-width="1.3" />
      <path d="M7.5 12.2h17" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  pastry: () => (
    <>
      <path d="M3.5 21c2-8 7-12 12.5-12s10.5 4 12.5 12c-1.5 2.5-4 3-6 2-3 2-10 2-13 0-2 1-4.5.5-6-2z" fill={shade('#e8b55c', 0.2)} />
      <path d="M4.5 20.5c2-7.3 6.5-10.8 11.5-10.8s9.5 3.5 11.2 10.3c-1.5 1.8-3.5 2-5.2 1.3-3 1.6-9.5 1.6-12.5 0-1.8.8-3.6.6-5-.8z" fill="#e8b55c" />
      <path d="M11 11.5c1 4 1 8 0 11.5M16 9.8v13.5M21 11.5c-1 4-1 8 0 11.5" stroke={shade('#e8b55c', 0.4)} stroke-width="1.4" fill="none" stroke-linecap="round" />
      <ellipse cx="13" cy="13" rx="3" ry="1.2" fill="#fff" opacity="0.5" />
      <path d="M3.5 21c2-8 7-12 12.5-12s10.5 4 12.5 12c-1.5 2.5-4 3-6 2-3 2-10 2-13 0-2 1-4.5.5-6-2z" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
    </>
  ),
  honey: () => (
    <>
      <path d="M8 13c0-3 2-4 8-4s8 1 8 4v11c0 3-3 4-8 4s-8-1-8-4z" fill={shade('#f5b32a', 0.2)} />
      <path d="M8.6 13c0-2.6 2-3.6 7.4-3.6s7 1 7 3.6v10.5c0 2.6-2.6 3.5-7.2 3.5S8.6 26.1 8.6 23.5z" fill="#f5b32a" />
      <ellipse cx="11.5" cy="16" rx="1.3" ry="3" fill="#fff" opacity="0.55" />
      <path d="M8 13c0-3 2-4 8-4s8 1 8 4v11c0 3-3 4-8 4s-8-1-8-4z" fill="none" stroke={INK} stroke-width="2" />
      <path d="M8 13q4 3 8 0t8 0" fill="none" stroke={INK} stroke-width="1.6" />
      <path d="M10 7.5h12l-1 2.5H11z" fill="#c98a4b" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M22 5l5 5" stroke={INK} stroke-width="3.2" stroke-linecap="round" />
      <path d="M22 5l5 5" stroke="#c98a4b" stroke-width="1.6" stroke-linecap="round" />
      <path d="M13 19.5h6" stroke="#fff8d0" stroke-width="1.6" stroke-linecap="round" />
    </>
  ),
  honey_jam: () => (
    <>
      <rect x="8" y="11" width="16" height="17" rx="4" fill={shade('#e89a2a')} />
      <rect x="8.5" y="11" width="13.5" height="15.5" rx="3.6" fill="#e89a2a" />
      <rect x="10" y="17" width="12" height="7" rx="1.5" fill="#fff8e6" stroke={INK} stroke-width="1.3" />
      <circle cx="14" cy="20.5" r="1.6" fill="#3a5fb0" />
      <circle cx="18" cy="20.5" r="1.6" fill="#3a5fb0" />
      <ellipse cx="11" cy="14" rx="1.2" ry="2.2" fill="#fff" opacity="0.55" />
      <rect x="8" y="11" width="16" height="17" rx="4" fill="none" stroke={INK} stroke-width="2" />
      <path d="M7 8.5q9-3 18 0l-1 3.5H8z" fill="#f5b32a" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M7.5 12.2h17" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  // decorations
  flowerbed: () => (
    <>
      <path d="M4 22l12-6 12 6-12 6z" fill="#8a5430" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M4 22v3l12 6v-3zM28 22v3l-12 6v-3z" fill="#6e3f22" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
      {[
        [10, 18, '#e8506a'],
        [16, 14.5, '#ffe14d'],
        [22, 18, '#b39ddb'],
        [16, 21, '#f48fb1'],
      ].map(([x, y, c]) => (
        <g key={`${x}${y}`}>
          <path d={`M${x} ${(y as number) + 3}v-3`} stroke="#3fa34d" stroke-width="1.6" />
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={(x as number) + Math.cos((a * Math.PI) / 180) * 2.2} cy={(y as number) + Math.sin((a * Math.PI) / 180) * 2.2} r="1.8" fill={c as string} stroke={INK} stroke-width="0.9" />
          ))}
          <circle cx={x} cy={y} r="1.2" fill="#ffb300" />
        </g>
      ))}
    </>
  ),
  hay: () => (
    <>
      <path d="M4 14l10-5 14 5v9l-10 5L4 23z" fill={shade('#f2c230', 0.2)} />
      <path d="M4 14l10-5 14 5-10 5z" fill={light('#f2c230', 0.2)} />
      <path d="M4 14l14 5v9L4 23z" fill="#f2c230" />
      <path d="M7 16v8M11 17.5v8M15 18.5v8M21 18v8M25 16.5v7" stroke={shade('#f2c230', 0.35)} stroke-width="1.1" />
      <path d="M4 14l10-5 14 5v9l-10 5L4 23zM4 14l14 5 10-5M18 19v9" fill="none" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M9.5 15.5v9M22.5 17.5v8" stroke="#c0562a" stroke-width="1.6" />
    </>
  ),
  bench: () => (
    <>
      <path d="M6 22v5M26 18v5M10 24v4M22 20v4" stroke={INK} stroke-width="3.2" stroke-linecap="round" />
      <path d="M4 20l18-7 6 3-18 7z" fill="#c98a4b" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M4 20v2l6 3v-2zM10 23v2l18-7v-2z" fill={shade('#c98a4b')} stroke={INK} stroke-width="1.5" stroke-linejoin="round" />
      <path d="M8 18l14-6M10 19l14-6" stroke={shade('#c98a4b', 0.3)} stroke-width="1" />
      <path d="M22 13V6l6 3v7" fill="#c98a4b" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
    </>
  ),
  scarecrow: () => (
    <>
      <path d="M16 30V12M6 15h20" stroke={INK} stroke-width="3.5" stroke-linecap="round" />
      <path d="M16 30V12M6 15h20" stroke="#8b5a2b" stroke-width="1.8" stroke-linecap="round" />
      <path d="M11 14h10l1 9H10z" fill="#5a8fd6" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M13 17h2v2h-2z" fill="#e0a35e" />
      <Ball cx={16} cy={10} r={4.5} fill="#e0a35e" sw={1.6} />
      <path d="M8 7.5h16" stroke={INK} stroke-width="2" stroke-linecap="round" />
      <path d="M11 7.5c0-3 2-4.5 5-4.5s5 1.5 5 4.5z" fill="#8b5a2b" stroke={INK} stroke-width="1.6" />
      <path d="M14 9.5h.1M18 9.5h.1" stroke={INK} stroke-width="2" stroke-linecap="round" />
    </>
  ),
  lamp: () => (
    <>
      <circle cx="16" cy="10" r="8" fill="#ffe14d" opacity="0.35" />
      <path d="M16 30V15M12 30h8" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
      <path d="M16 30V15" stroke="#3a3a3a" stroke-width="1.6" />
      <path d="M11.5 7.5h9l-1.5 7h-6z" fill="#ffd54f" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M10.5 7.5L16 3.5l5.5 4z" fill="#4a4a4a" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
      <ellipse cx="14.5" cy="10" rx="1" ry="2" fill="#fff" opacity="0.7" />
    </>
  ),
  beehive: () => (
    <>
      <path d="M8 28h16" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
      {[
        [16, 9, 4.5],
        [16, 14, 7],
        [16, 20, 9],
        [16, 25.5, 8],
      ].map(([x, y, r]) => (
        <Ball key={y} cx={x} cy={y} r={r} rx={r} ry={3.4} fill="#f5b32a" sw={1.6} />
      ))}
      <ellipse cx="16" cy="25" rx="2.2" ry="1.8" fill={INK} />
      <ellipse cx="25" cy="10" rx="2.2" ry="1.6" fill="#ffd54f" stroke={INK} stroke-width="1.1" />
      <path d="M24.3 9.2v1.6M25.7 9.2v1.6" stroke={INK} stroke-width="0.8" />
      <ellipse cx="24.5" cy="8" rx="1.3" ry="0.9" fill="#fff" opacity="0.85" />
    </>
  ),
  pumpkins: () => (
    <>
      <Ball cx={20.5} cy={20} r={7.5} rx={8.5} ry={6.5} fill={shade('#f57c00', 0.06)} />
      <path d="M20.5 13.5c-2.5 0-3.5 3-3.5 6.5s1 6.5 3.5 6.5 3.5-3 3.5-6.5-1-6.5-3.5-6.5" fill="none" stroke={shade('#f57c00', 0.4)} stroke-width="1.2" />
      <Ball cx={11} cy={22} r={7} rx={8} ry={6} fill="#f57c00" />
      <path d="M11 16c-2.4 0-3.3 2.8-3.3 6s.9 6 3.3 6 3.3-2.8 3.3-6-.9-6-3.3-6" fill="none" stroke={shade('#f57c00', 0.4)} stroke-width="1.2" />
      <path d="M11 16v-3M20.5 13.5v-3" stroke={INK} stroke-width="2.4" stroke-linecap="round" />
    </>
  ),
  windmill: () => (
    <>
      <path d="M12 29l2-17h4l2 17z" fill="#f3ede0" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      <path d="M16 12h2l2 17h-4z" fill={shade('#f3ede0', 0.15)} />
      <path d="M14.5 29v-4h3v4" fill="#8b5a2b" stroke={INK} stroke-width="1.4" />
      {[45, 135, 225, 315].map((a) => (
        <g key={a} transform={`rotate(${a} 16 11)`}>
          <path d="M16 11v-9.5" stroke={INK} stroke-width="2.6" stroke-linecap="round" />
          <rect x="16.3" y="2" width="4" height="7.5" fill="#fff8e6" stroke={INK} stroke-width="1.3" />
        </g>
      ))}
      <circle cx="16" cy="11" r="1.8" fill="#c0562a" stroke={INK} stroke-width="1.2" />
    </>
  ),
  fountain: () => (
    <>
      <ellipse cx="16" cy="23" rx="12" ry="5" fill="#9e9e9e" stroke={INK} stroke-width="1.8" />
      <ellipse cx="16" cy="22" rx="9.5" ry="3.4" fill="#7cc4f5" stroke={INK} stroke-width="1.3" />
      <path d="M4 23v2.5c0 3 24 3 24 0V23" fill={shade('#9e9e9e')} stroke={INK} stroke-width="1.6" />
      <path d="M14.5 22v-9h3v9" fill="#bdbdbd" stroke={INK} stroke-width="1.4" />
      <path d="M16 12c-4 0-6 3-7 7M16 12c4 0 6 3 7 7M16 12V6" fill="none" stroke="#7cc4f5" stroke-width="1.8" stroke-linecap="round" />
      <ellipse cx="13" cy="21.5" rx="2.5" ry="0.8" fill="#fff" opacity="0.7" />
    </>
  ),
  statue: () => (
    <>
      <path d="M8 29h16v-4H8z" fill="#9e9e9e" stroke={INK} stroke-width="1.8" />
      <path d="M10 25h12v-3H10z" fill="#bdbdbd" stroke={INK} stroke-width="1.6" />
      <path d="M13 22l-1-8h8l-1 8z" fill="#ffc531" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
      <Ball cx={16} cy={10} r={4} fill="#ffc531" sw={1.6} />
      <path d="M12 15l-3-5M20 15l3-5" stroke={INK} stroke-width="3" stroke-linecap="round" />
      <path d="M12 15l-3-5M20 15l3-5" stroke="#ffc531" stroke-width="1.4" stroke-linecap="round" />
      {twinkle(25, 5, 3, '#fff8d0')}
    </>
  ),
};

export function hasItemIcon(id: string | undefined): boolean {
  return !!id && id in ICONS;
}

/** An illustrated icon for a crop, good or decoration; falls back to the coloured dot. */
export function ItemIcon({ id, color, small, size }: { id?: string; color?: string; small?: boolean; size?: number }) {
  const draw = id ? ICONS[id] : undefined;
  const px = size ?? (small ? 26 : 34);
  if (!draw) return <span class={`seed-icon${small ? ' sm' : ''}`} style={{ background: color }} aria-hidden="true" />;
  return (
    <svg class="item-icon" width={px} height={px} viewBox="0 0 32 32" aria-hidden="true">
      {draw()}
    </svg>
  );
}
