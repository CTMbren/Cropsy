import type { JSX } from 'preact';
import type { VillagerDef } from '../core/content';

/**
 * Villager portraits: each villager has their own face, hair, outfit and props, drawn in the farm's
 * style (warm ink outline, top-left light, one shadow tone). The expression layer is shared, so
 * every villager can look neutral, happy, surprised or sad.
 */

export type Mood = 'neutral' | 'happy' | 'surprised' | 'sad';

const INK = '#4a2e1a';
const SW = 2.5;

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`;
}
const shade = (c: string, t = 0.24) => mix(c, '#3a1f0c', t);
const light = (c: string, t = 0.3) => mix(c, '#ffffff', t);

interface Look {
  skin: string;
  /** Behind the head (long hair, bun, hat brim back). */
  back?: (v: VillagerDef) => JSX.Element;
  /** Clothes on the shoulders. */
  outfit: (v: VillagerDef) => JSX.Element;
  /** Over the face: hair, hats, beards, glasses. Gets the mouth so beards can sit over it. */
  front: (v: VillagerDef, mood: Mood) => JSX.Element;
  /** Bushy brows etc. drawn instead of the default (none). */
  brows?: (mood: Mood) => JSX.Element;
  freckles?: boolean;
  blush?: boolean;
}

const shoulders = (fill: string, collar?: string) => (
  <>
    <path d="M8 66c1-13 11-18.5 24-18.5S55 53 56 66z" fill={fill} stroke={INK} stroke-width={SW} />
    <path d="M40 49c8 2.5 14 7 15.5 16H44c0-6-1.5-11-4-16z" fill={shade(fill, 0.18)} />
    {collar && <path d="M24 49l8 7 8-7-3-2.5-5 4.5-5-4.5z" fill={collar} stroke={INK} stroke-width="1.8" stroke-linejoin="round" />}
  </>
);

const LOOKS: Record<string, Look> = {
  goldie: {
    skin: '#f6c9a0',
    freckles: true,
    blush: true,
    back: (v) => <circle cx="32" cy="10.5" r="7" fill={v.hair} stroke={INK} stroke-width={SW} />,
    outfit: () => (
      <>
        {shoulders('#fff3d6')}
        <path d="M21 66V53c3-2 7-3 11-3s8 1 11 3v13z" fill="#4f9a5a" stroke={INK} stroke-width="2" />
        <path d="M23 52l-3-4M41 52l3-4" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
        <path d="M23 52l-3-4M41 52l3-4" stroke="#4f9a5a" stroke-width="1.6" stroke-linecap="round" />
        <rect x="27" y="56" width="10" height="6" rx="1.5" fill={shade('#4f9a5a', 0.2)} stroke={INK} stroke-width="1.4" />
      </>
    ),
    front: (v) => (
      <>
        <path d="M18.5 30c-1-10 5-16 13.5-16s14.5 6 13.5 16c-3-5-6-7.5-9-8-3 3-9 4.5-15 4-1.5 1-2.5 2.5-3 4z" fill={v.hair} stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M24 17c3-1.5 7-2 10-1" stroke={light(v.hair, 0.35)} stroke-width="1.6" stroke-linecap="round" fill="none" />
        <path d="M27 8.5q5-3 10 0" stroke={light(v.hair, 0.35)} stroke-width="1.4" fill="none" />
      </>
    ),
  },
  bruno: {
    skin: '#9a6440',
    back: () => <></>,
    outfit: () => (
      <>
        {shoulders('#c94a3a')}
        <path d="M14 66V58M22 66V51M42 66V51M50 66V58M8 60h48" stroke={shade('#c94a3a', 0.35)} stroke-width="1.6" />
        <path d="M25 49.5l7 5.5 7-5.5" fill="none" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      </>
    ),
    front: (v) => (
      <>
        <path d="M19 27c-.5-8.5 5-13.5 13-13.5S45.5 18.5 45 27c-2-3.5-5-5.5-13-5.5S21 23.5 19 27z" fill={v.hair} stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        {/* short beard along the jaw, clear of the mouth */}
        <path d="M18.8 28c-.3 11 6 17.5 13.2 17.5S45.5 39 45.2 28c-1 4-2 6-3.5 7.5-.5 3-2 5-3.7 5.5-1.5-.8-3.5-1.2-6-1.2s-4.5.4-6 1.2c-1.7-.5-3.2-2.5-3.7-5.5-1.5-1.5-2.5-3.5-3.5-7.5z" fill={v.hair} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M26.5 34.2c1.5-1.2 3.5-1.6 5.5-1.6s4 .4 5.5 1.6" fill="none" stroke={v.hair} stroke-width="2.6" stroke-linecap="round" />
        {/* pencil behind the ear */}
        <path d="M44 20l6 9" stroke={INK} stroke-width="4" stroke-linecap="round" />
        <path d="M44 20l6 9" stroke="#ffd54f" stroke-width="2" stroke-linecap="round" />
        <path d="M49.2 27.8l1 1.5" stroke="#f4a3a3" stroke-width="2" stroke-linecap="round" />
      </>
    ),
    brows: () => <path d="M24 25.5h5.5M34.5 25.5H40" stroke={INK} stroke-width="2.6" stroke-linecap="round" />,
  },
  rufus: {
    skin: '#f0c2a0',
    back: () => <></>,
    outfit: () => (
      <>
        {shoulders('#f3ede0', '#f3ede0')}
        <path d="M14 66c0-8 3-13 9-16l5 16zM50 66c0-8-3-13-9-16l-5 16z" fill="#7a5a3a" stroke={INK} stroke-width="2" stroke-linejoin="round" />
      </>
    ),
    front: (v) => (
      <>
        {/* grey tufts over the ears */}
        <path d="M17.5 31c-2-4-1-8 2.5-9 0 3 .5 6 1.5 8zM46.5 31c2-4 1-8-2.5-9 0 3-.5 6-1.5 8z" fill={v.hair} stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        {/* flat cap */}
        <path d="M17 22c1-7 7-11 15-11s14 4 15 11c-4-1.5-9-2-15-2s-11 .5-15 2z" fill="#6b7f5a" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M17 22c5-2 25-2.5 32-.5l-1 3c-8-2-22-2-30 .5z" fill={shade('#6b7f5a', 0.2)} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M23 15q9-3 18 0" stroke={light('#6b7f5a', 0.25)} stroke-width="1.4" fill="none" />
        {/* big grey moustache */}
        <path d="M24 37.5c2-3.5 5.5-4 8-2.5 2.5-1.5 6-1 8 2.5-2.5 1-5.5 1-8-.5-2.5 1.5-5.5 1.5-8 .5z" fill={v.hair} stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
      </>
    ),
    brows: (mood) => (
      <path
        d={mood === 'happy' ? 'M23.5 25.5q3-2.5 6 0M34.5 25.5q3-2.5 6 0' : mood === 'surprised' ? 'M23.5 23.5l6-1M34.5 22.5l6 1' : 'M23.5 24.5l6 2M34.5 26.5l6-2'}
        stroke="#e8e2d4"
        stroke-width="3.2"
        stroke-linecap="round"
        fill="none"
        style={{ paintOrder: 'stroke' }}
      />
    ),
  },
  pip: {
    skin: '#f6d0b0',
    freckles: true,
    blush: true,
    back: (v) => (
      <>
        <circle cx="17.5" cy="31" r="5" fill={v.hair} stroke={INK} stroke-width="2" />
        <circle cx="46.5" cy="31" r="5" fill={v.hair} stroke={INK} stroke-width="2" />
      </>
    ),
    outfit: () => (
      <>
        {shoulders('#ffffff')}
        <path d="M32 50v16" stroke={INK} stroke-width="1.6" />
        <circle cx="28" cy="55" r="1.4" fill={INK} />
        <circle cx="28" cy="61" r="1.4" fill={INK} />
        <circle cx="36" cy="55" r="1.4" fill={INK} />
        <circle cx="36" cy="61" r="1.4" fill={INK} />
        <path d="M26 49.5h12l-2 3H28z" fill="#f28fb0" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
      </>
    ),
    front: (v) => (
      <>
        <path d="M19 28c0-6 4-10 7-11 2 2 3 3.5 6 3.5s4-1.5 6-3.5c3 1 7 5 7 11-2-2.5-4-3.5-6-3.5-4 0-9-.5-13 0-2 .5-5 1.5-7 3.5z" fill={v.hair} stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
        {/* baker's toque */}
        <path d="M21 20c-5-1-6-8-1-10 1-5 7-6 9-3 2-3 8-3 10 1 4-1 8 3 5 8-1 2-2.5 3.5-3 4z" fill="#fff" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M21 20h20l-.5 4H21.5z" fill={shade('#ffffff', 0.12)} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M27 12c1 3 1 5 0 8M35 11c1 3 1 6 0 9" stroke={shade('#ffffff', 0.2)} stroke-width="1.4" fill="none" />
        {/* a smudge of flour */}
        <ellipse cx="40" cy="37" rx="2.4" ry="1.3" fill="#fff" opacity="0.85" />
      </>
    ),
  },
  ziggy: {
    skin: '#d9a07a',
    back: (v) => <path d="M17 26c-3 10-2 20 2 26h26c4-6 5-16 2-26z" fill={v.hair} stroke={INK} stroke-width={SW} stroke-linejoin="round" />,
    outfit: () => (
      <>
        {shoulders('#2f7f8a')}
        <path d="M20 50c5 4 19 4 24 0l2 4c-6 5-22 5-28 0z" fill="#f2c94c" stroke={INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M23 52.5l3 1M30 54h3M37 53.5l3-1" stroke="#c94a3a" stroke-width="1.6" stroke-linecap="round" />
      </>
    ),
    front: (v) => (
      <>
        <path d="M19 30c0-7 5-11 13-11s13 4 13 11c-4-4-8-5-13-5s-9 1-13 5z" fill={v.hair} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        {/* wide-brimmed hat with a feather */}
        <path d="M44 18c5-6 11-7 13-4-3 0-7 2-11 6z" fill="#f28fb0" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        <path d="M7 22c4-3 14-4 25-4s21 1 25 4c-4 2-14 3-25 3S11 24 7 22z" fill="#7a4fc4" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M20 19c0-7 5-11 12-11s12 4 12 11c-3 .5-7 1-12 1s-9-.5-12-1z" fill="#7a4fc4" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M20.5 16.5c4 1 19 1 23 0l.5 2.5c-4 1-20 1-24 0z" fill="#f2c94c" stroke={INK} stroke-width="1.6" />
        <path d="M24 11.5q5-2.5 10-1.5" stroke={light('#7a4fc4', 0.35)} stroke-width="1.6" fill="none" stroke-linecap="round" />
        {/* gold hoop earring */}
        <circle cx="45" cy="37" r="2.6" fill="none" stroke={INK} stroke-width="2.6" />
        <circle cx="45" cy="37" r="2.6" fill="none" stroke="#ffc531" stroke-width="1.2" />
      </>
    ),
  },
  hazel: {
    skin: '#e8b48f',
    back: (v) => (
      <>
        <circle cx="32" cy="12" r="7.5" fill={v.hair} stroke={INK} stroke-width={SW} />
        <path d="M26 6l12 11" stroke={INK} stroke-width="3.6" stroke-linecap="round" />
        <path d="M26 6l12 11" stroke="#ffd54f" stroke-width="1.8" stroke-linecap="round" />
      </>
    ),
    outfit: () => (
      <>
        {shoulders('#ffffff')}
        <path d="M32 50l-7 16h-5l3-14zM32 50l7 16h5l-3-14z" fill={shade('#ffffff', 0.1)} stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        <path d="M27 50l5 5 5-5" fill="#4f9a8a" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        <path d="M44 56c3-3 5-2 6 0-2 2-4 2.5-6 0z" fill="#6cc040" stroke={INK} stroke-width="1.3" />
      </>
    ),
    front: (v, mood) => (
      <>
        <path d="M18.5 31c-1-10 5-16.5 13.5-16.5S46.5 21 45.5 31c-2-5-4-7-6-8-4 2-11 3-16 2-2 1.5-4 3.5-5 6z" fill={v.hair} stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        {/* round reading glasses */}
        <g stroke={INK} stroke-width="1.8" fill="#fff" fill-opacity={mood === 'happy' ? 0.15 : 0.25}>
          <circle cx="27" cy="30" r="4.6" />
          <circle cx="37" cy="30" r="4.6" />
        </g>
        <path d="M31.6 30h.8M22.4 29.5l-3.5-1M41.6 29.5l3.5-1" stroke={INK} stroke-width="1.8" stroke-linecap="round" />
        <path d="M24.5 27.5l1.5-1.2M34.5 27.5l1.5-1.2" stroke="#fff" stroke-width="1.2" stroke-linecap="round" />
      </>
    ),
  },
  nell: {
    // river-keeper: silver braid, roll-neck fisherman's knit, a mustard oilskin sou'wester
    skin: '#dca37d',
    back: (v) => (
      <>
        <path d="M18 34c-4 6-4 14-1 21 2 1 4 0 5-2-2-6-2-12 0-17z" fill={v.hair} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        <path d="M17 41l4 1.5M16.5 46l4.5 1M17.5 51l3.5.5" stroke={shade(v.hair, 0.3)} stroke-width="1.3" stroke-linecap="round" />
        <path d="M18 54.5l3 1.5" stroke="#c0532f" stroke-width="2.4" stroke-linecap="round" />
      </>
    ),
    outfit: (v) => (
      <>
        {shoulders(v.color)}
        <path d="M24.5 49c2.5 2.5 12.5 2.5 15 0l1 4c-3 2.5-14 2.5-17 0z" fill={light(v.color, 0.2)} stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        <path d="M18 56v8M24 54v10M40 54v10M46 56v8" stroke={shade(v.color, 0.3)} stroke-width="1.4" stroke-linecap="round" />
        <path d="M21 59l3-2 3 2M37 59l3-2 3 2" fill="none" stroke={light(v.color, 0.35)} stroke-width="1.2" stroke-linecap="round" />
      </>
    ),
    front: (v) => (
      <>
        {/* silver hair at the temples, under the hat */}
        <path d="M18.6 33c-1-5 .5-9 3-11l3 2c-2 2-3.5 5-3.5 9zM45.4 33c1-5-.5-9-3-11l-3 2c2 2 3.5 5 3.5 9z" fill={v.hair} stroke={INK} stroke-width="2" stroke-linejoin="round" />
        {/* sou'wester: domed crown, brim longer at the back and sides */}
        <path d="M19 22c0-8 6-13 13-13s13 5 13 13z" fill="#e0a53a" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M37 11c4 2 7 6 7.5 10.5L41 22c-.5-4-2-7.5-4-11z" fill={shade('#e0a53a', 0.18)} />
        <path d="M10 25c4-3.5 12-5 22-5s18 1.5 22 5c-1 2.5-3 3-5 2.5-5-2-11-3-17-3s-12 1-17 3c-2 .5-4 0-5-2.5z" fill="#e0a53a" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M24 13.5c2-1.5 4-2 6-2" stroke="#fff3c4" stroke-width="1.6" stroke-linecap="round" />
        <path d="M20 22.5h24" stroke={shade('#e0a53a', 0.3)} stroke-width="1.4" />
      </>
    ),
    brows: (mood) => (
      <path
        d={mood === 'sad' ? 'M24.5 27.6l4.4-1.4M35.1 26.2l4.4 1.4' : mood === 'surprised' ? 'M24.5 25.6l4.5-.8M35 24.8l4.5.8' : 'M24.5 26.8l4.5-.4M35 26.4l4.5.4'}
        stroke={shade('#c8c2b4', 0.35)}
        stroke-width="1.8"
        stroke-linecap="round"
      />
    ),
  },
  juniper: {
    skin: '#f6c9a0',
    freckles: true,
    blush: true,
    back: (v) => (
      <>
        <path d="M17 27c-6 2-7 9-4 13 2-3 4-6 6-8zM47 27c6 2 7 9 4 13-2-3-4-6-6-8z" fill={v.hair} stroke={INK} stroke-width="2" stroke-linejoin="round" />
      </>
    ),
    outfit: () => (
      <>
        {shoulders('#f3ede0')}
        <path d="M20 66V54c4-1 8-1.5 12-1.5s8 .5 12 1.5v12z" fill="#5a8fd6" stroke={INK} stroke-width="2" />
        <path d="M23 54l-2-5M41 54l2-5" stroke={INK} stroke-width="3.4" stroke-linecap="round" />
        <path d="M23 54l-2-5M41 54l2-5" stroke="#5a8fd6" stroke-width="1.6" stroke-linecap="round" />
        <circle cx="23.5" cy="55.5" r="1.4" fill="#ffd54f" stroke={INK} stroke-width="1" />
        <circle cx="40.5" cy="55.5" r="1.4" fill="#ffd54f" stroke={INK} stroke-width="1" />
        {/* Moss, peeking in */}
        <g>
          <path d="M44 58c0-6 3-9.5 7.5-9.5S59 52 59 58v8H44z" fill="#c98a4b" stroke={INK} stroke-width="2" />
          <path d="M44.5 52c-3 0-4 4-2.5 7 1.5-1 2.5-3 3-5z" fill="#8b5a2b" stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
          <circle cx="49" cy="55" r="1.2" fill={INK} />
          <circle cx="54.5" cy="55" r="1.2" fill={INK} />
          <ellipse cx="51.8" cy="58.5" rx="2" ry="1.4" fill={INK} />
          <path d="M51.8 60v1.2" stroke={INK} stroke-width="1.2" />
        </g>
      </>
    ),
    front: (v) => (
      <>
        <path d="M18.5 31c-1-10 5-16.5 13.5-16.5S46.5 21 45.5 31c-3-4-6-6-8-6.5l-2 3-2-3-3 3-2-3c-4 1-7 3-10 6.5z" fill={v.hair} stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        {/* inventor's goggles up on her forehead */}
        <path d="M18 20.5c8-3 20-3 28 0" stroke={INK} stroke-width="4.4" fill="none" stroke-linecap="round" />
        <path d="M18 20.5c8-3 20-3 28 0" stroke="#7a4f2a" stroke-width="2.4" fill="none" stroke-linecap="round" />
        <circle cx="26.5" cy="19" r="4.6" fill="#7cc4f5" stroke={INK} stroke-width="2.2" />
        <circle cx="37.5" cy="19" r="4.6" fill="#7cc4f5" stroke={INK} stroke-width="2.2" />
        <circle cx="26.5" cy="19" r="2.8" fill="none" stroke="#b0b0b0" stroke-width="1.4" />
        <circle cx="37.5" cy="19" r="2.8" fill="none" stroke="#b0b0b0" stroke-width="1.4" />
        <path d="M25 17.5l1.4-1M36 17.5l1.4-1" stroke="#fff" stroke-width="1.2" stroke-linecap="round" />
      </>
    ),
  },
  tobias: {
    skin: '#f0c8a8',
    back: () => <path d="M5 21c5-3 15-4.5 27-4.5S54 18 59 21c-4 2.5-14 4-27 4S9 23.5 5 21z" fill="#e8c46a" stroke={INK} stroke-width={SW} stroke-linejoin="round" />,
    outfit: () => (
      <>
        {shoulders('#e8e0cc', '#e8e0cc')}
        <path d="M22 50l-2 16M42 50l2 16" stroke={INK} stroke-width="4" />
        <path d="M22 50l-2 16M42 50l2 16" stroke="#c94a3a" stroke-width="2" />
      </>
    ),
    front: (v) => (
      <>
        {/* white beard below the mouth, moustache above it */}
        <path d="M19 31c-.5 10 6 17 13 17s13.5-7 13-17c-1.5 3.5-3 6-5 7.5-1.5 2.5-4 3.5-8 3.5s-6.5-1-8-3.5c-2-1.5-3.5-4-5-7.5z" fill={v.hair} stroke={INK} stroke-width="2.2" stroke-linejoin="round" />
        <path d="M26 44q6 2.5 12 0" stroke={shade(v.hair, 0.2)} stroke-width="1.3" fill="none" />
        <path d="M24.5 35c2.5-3 5.5-3.5 7.5-2 2-1.5 5-1 7.5 2-2.5 1-5 .8-7.5-.5-2.5 1.3-5 1.5-7.5.5z" fill={v.hair} stroke={INK} stroke-width="1.6" stroke-linejoin="round" />
        {/* straw hat crown */}
        <path d="M20 21c0-6.5 5-10.5 12-10.5S44 14.5 44 21c-3 1-7 1.5-12 1.5S23 22 20 21z" fill="#e8c46a" stroke={INK} stroke-width={SW} stroke-linejoin="round" />
        <path d="M20.3 18.5c4 1.3 19.4 1.3 23.4 0l.2 2.5c-4 1.4-19.8 1.4-23.8 0z" fill="#c94a3a" stroke={INK} stroke-width="1.5" />
        <path d="M24 13.5l2 4M30 11.5l1 5M37 12.5l-1 4.5" stroke={shade('#e8c46a', 0.3)} stroke-width="1.1" />
        {/* laugh lines */}
        <path d="M21.5 31.5q1 1.5 0 3M42.5 31.5q-1 1.5 0 3" stroke={shade('#f0c8a8', 0.35)} stroke-width="1.1" fill="none" />
      </>
    ),
    brows: () => <path d="M24 26l5-.8M35 25.2l5 .8" stroke="#e8e2d4" stroke-width="2.4" stroke-linecap="round" />,
  },
};

/** Eyes and mouth: shared by everyone so moods read the same way on every face. */
function Expression({ mood }: { mood: Mood }) {
  const eye = (cx: number, r: number) => (
    <>
      <circle cx={cx} cy={30} r={r} fill={INK} />
      <circle cx={cx - r * 0.35} cy={30 - r * 0.4} r={r * 0.38} fill="#fff" />
    </>
  );
  if (mood === 'happy')
    return (
      <>
        <path d="M24.5 30.5q2.5-3 5 0M34.5 30.5q2.5-3 5 0" fill="none" stroke={INK} stroke-width="2.2" stroke-linecap="round" />
        <path d="M27 34.5c1.5 4.5 8.5 4.5 10 0z" fill="#b8323a" stroke={INK} stroke-width="1.8" stroke-linejoin="round" />
        <path d="M29.5 37.3q2.5 1.2 5 0" stroke="#f29b9b" stroke-width="1.4" fill="none" />
      </>
    );
  if (mood === 'surprised')
    return (
      <>
        {eye(27, 2.6)}
        {eye(37, 2.6)}
        <ellipse cx="32" cy="36.5" rx="2.3" ry="2.8" fill="#7a2e22" stroke={INK} stroke-width="1.6" />
      </>
    );
  if (mood === 'sad')
    return (
      <>
        <path d="M24.5 27.4l4.5-1.6M35 25.8l4.5 1.6" stroke={INK} stroke-width="1.8" stroke-linecap="round" />
        {eye(27, 1.9)}
        {eye(37, 1.9)}
        <path d="M28.5 37.5c2-1.8 5-1.8 7 0" fill="none" stroke={INK} stroke-width="2" stroke-linecap="round" />
      </>
    );
  return (
    <>
      {eye(27, 2.1)}
      {eye(37, 2.1)}
      <path d="M28.5 35.5c2 1.8 5 1.8 7 0" fill="none" stroke={INK} stroke-width="2" stroke-linecap="round" />
    </>
  );
}

/** The old one-size-fits-all face, kept for any villager added without a look. */
const FALLBACK: Look = {
  skin: '#f6c9a0',
  outfit: () => shoulders('#fff8e6'),
  front: (v) => <path d="M19 26c0-9 6-14 13-14s13 5 13 14c-4-4-9-6-13-6s-9 2-13 6z" fill={v.hair} stroke={INK} stroke-width={SW} />,
};

export function Portrait({ v, size, mood = 'neutral' }: { v: VillagerDef; size: number; mood?: Mood }) {
  const look = LOOKS[v.id] ?? FALLBACK;
  const clip = `pc-${v.id}`;
  const skin = look.skin;
  return (
    <svg class="portrait" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={v.name}>
      <defs>
        <clipPath id={clip}>
          <circle cx="32" cy="32" r="30" />
        </clipPath>
      </defs>
      <circle cx="32" cy="32" r="30" fill={v.color} />
      <g clip-path={`url(#${clip})`}>
        <circle cx="26" cy="24" r="24" fill={light(v.color, 0.18)} />
        <circle cx="32" cy="32" r="26" fill="none" stroke={light(v.color, 0.35)} stroke-width="1.5" opacity="0.6" />
        {look.back?.(v)}
        {look.outfit(v)}
        {/* neck, ears, face */}
        <path d="M27 42h10v8c-3 2-7 2-10 0z" fill={shade(skin, 0.15)} stroke={INK} stroke-width="2" />
        <ellipse cx="18.5" cy="31.5" rx="3" ry="3.8" fill={skin} stroke={INK} stroke-width="2" />
        <ellipse cx="45.5" cy="31.5" rx="3" ry="3.8" fill={shade(skin, 0.1)} stroke={INK} stroke-width="2" />
        <ellipse cx="32" cy="30" rx="13.5" ry="14" fill={skin} />
        <path d="M41 19c4 4 5.5 10 4 16-1 5-5 9-10 9.3 6-3 8-11 6-25.3z" fill={shade(skin, 0.14)} />
        <ellipse cx="32" cy="30" rx="13.5" ry="14" fill="none" stroke={INK} stroke-width={SW} />
        {look.blush !== false && <ellipse cx="23" cy="35" rx="2.6" ry="1.6" fill="#f29b9b" opacity={mood === 'happy' ? 0.85 : 0.5} />}
        {look.blush !== false && <ellipse cx="41" cy="35" rx="2.6" ry="1.6" fill="#f29b9b" opacity={mood === 'happy' ? 0.85 : 0.5} />}
        {look.freckles && (
          <g fill={shade(skin, 0.35)}>
            <circle cx="22" cy="33" r="0.6" />
            <circle cx="24" cy="34" r="0.6" />
            <circle cx="23.5" cy="32" r="0.5" />
            <circle cx="40" cy="33" r="0.6" />
            <circle cx="42" cy="34" r="0.6" />
            <circle cx="40.5" cy="32" r="0.5" />
          </g>
        )}
        <path d="M31.5 31.5q1 2.5 2 2" stroke={shade(skin, 0.4)} stroke-width="1.3" fill="none" stroke-linecap="round" />
        <Expression mood={mood} />
        {look.brows?.(mood)}
        {look.front(v, mood)}
      </g>
      <circle cx="32" cy="32" r="30" fill="none" stroke={INK} stroke-width="3" />
    </svg>
  );
}
