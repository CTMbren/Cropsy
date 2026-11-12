/**
 * A gentle, looping farm tune synthesized on the fly (no audio files to download): a soft bass,
 * plucked chords and a slow pentatonic melody. Scheduled a little ahead with the Web Audio clock,
 * and paused whenever the game is hidden.
 */
let ctx: AudioContext | null = null;
let level = 0.5;
let master: GainNode | null = null;
let timer: number | undefined;
let nextTime = 0;
let step = 0;
let wanted = false;

const BPM = 84;
const STEP = 60 / BPM / 2; // eighth notes
// I – vi – IV – V in C major, two bars each
const CHORDS = [
  [48, 52, 55],
  [45, 48, 52],
  [41, 45, 48],
  [43, 47, 50],
];
// pentatonic melody, 0 = rest
const MELODY = [
  76, 0, 74, 72, 0, 69, 72, 0, 74, 0, 76, 79, 0, 76, 74, 0,
  72, 0, 69, 0, 67, 69, 72, 0, 69, 0, 67, 64, 0, 67, 69, 0,
  72, 0, 74, 76, 0, 74, 72, 0, 69, 72, 0, 74, 72, 0, 69, 0,
  67, 0, 69, 72, 0, 74, 76, 0, 74, 0, 72, 0, 67, 0, 0, 0,
];

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

function note(midi: number, t: number, dur: number, type: OscillatorType, vol: number): void {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = hz(midi);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function schedule(): void {
  if (!ctx) return;
  while (nextTime < ctx.currentTime + 0.3) {
    const bar = Math.floor(step / 8) % 8;
    const chord = CHORDS[Math.floor(bar / 2)];
    const beat = step % 8;
    if (beat === 0) note(chord[0] - 12, nextTime, STEP * 7, 'sine', 0.22);
    if (beat % 2 === 1) chord.forEach((n, i) => note(n + 12, nextTime + i * 0.012, STEP * 1.6, 'triangle', 0.05));
    const m = MELODY[step % MELODY.length];
    if (m) note(m, nextTime, STEP * 1.8, 'sine', 0.07);
    nextTime += STEP;
    step += 1;
  }
}

function start(): void {
  if (!ctx || timer !== undefined || ctx.state !== 'running') return;
  nextTime = ctx.currentTime + 0.1;
  timer = window.setInterval(schedule, 100);
}

function stop(): void {
  window.clearInterval(timer);
  timer = undefined;
}

/** Call after the first tap (iOS only allows audio after a gesture). */
export function initMusic(audio: AudioContext): void {
  if (ctx) return;
  ctx = audio;
  master = ctx.createGain();
  master.gain.value = level;
  master.connect(ctx.destination);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stop();
    else if (wanted) start();
  });
  if (wanted) start();
}

/** 0–1 music volume (default 0.5). */
export function setMusicVolume(v: number): void {
  level = Math.max(0, Math.min(1, v));
  if (master) master.gain.value = level;
}

export function setMusic(on: boolean): void {
  wanted = on;
  if (on) start();
  else stop();
}
