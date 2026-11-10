/**
 * Tiny synthesized sound effects (no audio files to download). iOS only lets Web Audio start after a
 * user gesture, so the context is created on the first tap. Web Audio follows the iPhone's silent switch.
 */
type Sfx = 'plant' | 'harvest' | 'clear' | 'coin' | 'levelup' | 'quest' | 'ui' | 'denied' | 'mail';

let ctx: AudioContext | null = null;
let muted = false;
let combo = 0;
let comboTimer: number | undefined;

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'ambient';
}

export function setMuted(m: boolean): void {
  muted = m;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'triangle', vol = 0.18, slideTo?: number): void {
  if (!ctx) return;
  const t = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function play(s: Sfx): void {
  if (muted || !ctx || ctx.state !== 'running') return;
  const jitter = 1 + (Math.random() - 0.5) * 0.08;
  switch (s) {
    case 'plant':
      tone(220 * jitter, 0, 0.12, 'sine', 0.22, 140);
      break;
    case 'harvest': {
      // pitch steps up through a drag-harvest combo
      combo = Math.min(combo + 1, 10);
      window.clearTimeout(comboTimer);
      comboTimer = window.setTimeout(() => (combo = 0), 600);
      const f = 520 * Math.pow(2, combo / 12) * jitter;
      tone(f, 0, 0.09, 'square', 0.08);
      tone(f * 1.5, 0.05, 0.12, 'triangle', 0.14);
      break;
    }
    case 'clear':
      tone(160 * jitter, 0, 0.15, 'sawtooth', 0.08, 90);
      break;
    case 'coin':
      tone(988, 0, 0.08, 'square', 0.07);
      tone(1319, 0.07, 0.18, 'square', 0.07);
      break;
    case 'levelup':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.16));
      break;
    case 'quest':
      [659, 784, 988].forEach((f, i) => tone(f, i * 0.08, 0.2, 'triangle', 0.14));
      break;
    case 'mail':
      tone(880, 0, 0.1, 'sine', 0.15);
      tone(1175, 0.1, 0.16, 'sine', 0.15);
      break;
    case 'ui':
      tone(700 * jitter, 0, 0.05, 'sine', 0.1);
      break;
    case 'denied':
      tone(200, 0, 0.12, 'square', 0.06, 150);
      break;
  }
}
