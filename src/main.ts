import * as Phaser from 'phaser';
import { h, render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game';
import { installErrorLog } from './platform/errors';
import { countVisit } from './platform/visits';
import { initMusic, setMusic } from './platform/music';
import { play, setMuted, unlockAudio, whenAudioReady } from './platform/sound';
import { App } from './ui/App';
import { FarmScene } from './world/FarmScene';
import './styles.css';

const debug = new URLSearchParams(location.search).has('debug');

// Stop Safari from zooming the page or swiping back when the player pinches or drags the farm.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

installErrorLog();

const TIPS = [
  'Watering is optional. Forever.',
  'Crops keep growing while you sleep.',
  'Harvest soon after ripening for a Fresh Pick bonus.',
  'Moss accepts belly rubs and carrots.',
  'Ziggy swears everything on his cart is genuine.',
  'Rufus is smiling on the inside. Probably.',
];

/** Fades out the loading screen once the farm has drawn its first frame. */
function hideSplash(): void {
  const el = document.getElementById('splash');
  if (!el) return;
  el.classList.add('gone');
  window.setTimeout(() => el.remove(), 400);
}

async function start() {
  const tip = document.querySelector('#splash .tip');
  if (tip) tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  await document.fonts.load('26px "Lilita One"').catch(() => undefined);
  const game = new Game();
  await game.init();
  countVisit();
  if (debug) (window as unknown as { cropsy: Game }).cropsy = game;

  // Sound: iOS only allows audio after a user gesture.
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  setMuted(game.state.settings.muted);
  setMusic(game.state.settings.music !== false);
  game.subscribe(() => {
    setMuted(game.state.settings.muted);
    setMusic(game.state.settings.music !== false);
  });
  whenAudioReady((ctx) => {
    // iOS resumes the context asynchronously after the first tap
    const go = () => initMusic(ctx);
    if (ctx.state === 'running') go();
    else void ctx.resume().then(go).catch(() => undefined);
  });
  game.onFx((e) => {
    if (e.kind === 'harvest') play('harvest');
    else if (e.kind === 'plant') play('plant');
    else if (e.kind === 'clear' || e.kind === 'dug') play('clear');
    else if (e.kind === 'critter') play(e.result.firstTime ? 'quest' : 'ui');
    else if (e.kind === 'coins') play('coin');
    else if (e.kind === 'levelup') play('levelup');
    else if (e.kind === 'quest' || e.kind === 'expand' || e.kind === 'chapter' || e.kind === 'star') play('quest');
    else if (e.kind === 'moss') play('coin');
    else if (e.kind === 'denied') play('denied');
    else if (e.kind === 'ui') play('ui');
  });

  // Render at device pixels (capped at 2×) so the farm is crisp on Retina screens; the scene's
  // camera zoom maps logical CSS pixels onto the larger canvas.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const parent = document.getElementById('farm')!;
  const size = () => ({ w: Math.round(parent.clientWidth * dpr), h: Math.round(parent.clientHeight * dpr) });
  const { w, h: hgt } = size();
  const phaser = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    // transparent so the CSS sky and meadow behind the island show through
    transparent: true,
    width: w,
    height: hgt,
    scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr },
    render: { antialias: true },
    fps: { target: 60 },
    input: { activePointers: 2 },
    scene: [],
    callbacks: {
      postBoot: (g) => {
        g.registry.set('dpr', dpr);
        g.registry.set('debug', debug);
        g.scene.add('farm', FarmScene, true, { game });
        requestAnimationFrame(() => requestAnimationFrame(hideSplash));
      },
    },
  });
  window.addEventListener('resize', () => {
    const s = size();
    phaser.scale.resize(s.w, s.h);
  });

  // Updates: iPhone home-screen apps rarely re-check for a new version on their own, so check
  // whenever the player comes back. If an update is waiting right after launch (before they've
  // started playing), apply it straight away; mid-session, offer it with a banner instead.
  const launchedAt = performance.now();
  let updateReady = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (performance.now() - launchedAt < 8000 && !game.away) {
        game.saveNow();
        window.setTimeout(() => void updateSW(true), 400);
        return;
      }
      updateReady = true;
      draw();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.setInterval(check, 30 * 60 * 1000);
    },
  });

  const uiRoot = document.getElementById('ui')!;
  const draw = () =>
    render(
      h(App, {
        game,
        debug,
        updateReady,
        onUpdate: () => {
          game.saveNow();
          void updateSW(true);
        },
      }),
      uiRoot,
    );
  draw();
}

start().catch((e: Error) => {
  // never leave the player staring at the loading screen
  hideSplash();
  document.getElementById('ui')!.innerHTML = `<div class="modal-back" style="pointer-events:auto"><div class="card"><h2>Cropsy couldn't start</h2><p class="muted">${String(e?.message ?? e).replace(/[<>&]/g, '')}</p><p class="muted">Try closing and reopening the app. Your farm is saved.</p></div></div>`;
});
