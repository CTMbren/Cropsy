import almanacJson from '../../content/almanac.json';
import { hasFlag, hasSignature, masteryLevel, setFlag, type FarmState } from './farm';
import { sendMail } from './story';

/**
 * Hazel's Almanac: her notes for each star a crop earns, and the letters that mark the Almanac's
 * big moments (the three new mastery tracks, a crop's first ★10 gold page).
 */
const data = almanacJson as { notes: Record<string, Record<string, string>>; later: string[] };

/** Stars Hazel writes a crop-specific note for; after ★10 she adds one every 5 stars. */
export const NOTE_STARS = [1, 3, 5, 7, 10];

/** Hazel's notes a crop has unlocked so far, oldest first. */
export function almanacNotes(cropId: string, level: number): { star: number; text: string }[] {
  const own = data.notes[cropId] ?? {};
  const out: { star: number; text: string }[] = [];
  for (const star of NOTE_STARS) if (star <= level && own[star]) out.push({ star, text: own[star] });
  for (let star = 15, i = 0; star <= level; star += 5, i++) out.push({ star, text: data.later[(i + cropId.length) % data.later.length] });
  return out;
}

/** Next star that will unlock a note. */
export const nextNoteStar = (level: number) => NOTE_STARS.find((s) => s > level) ?? (Math.floor(level / 5) + 1) * 5;

/** Sends Hazel's Almanac letters when they're due. Returns the letters sent. */
export function syncAlmanac(state: FarmState, now: number, offsetMin: number): string[] {
  const sent: string[] = [];
  if (hasFlag(state, 'almanac_open') && !hasFlag(state, 'almanac_v2')) {
    setFlag(state, 'almanac_v2');
    sendMail(state, 'hazel_almanac', 'now', now, offsetMin);
    sent.push('hazel_almanac');
  }
  if (!hasFlag(state, 'signature_note') && Object.keys(state.harvests ?? {}).some((id) => hasSignature(state, id))) {
    setFlag(state, 'signature_note');
    sendMail(state, 'hazel_signature', 'now', now, offsetMin);
    sent.push('hazel_signature');
  }
  return sent;
}

/** Crops with their ★10 gold signature. */
export const signatureCrops = (state: FarmState) => Object.keys(state.harvests ?? {}).filter((id) => masteryLevel(state, id) >= 10);
