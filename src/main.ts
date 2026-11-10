import * as Phaser from 'phaser';
import { h, render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game';
import { play, setMuted, unlockAudio } from './platform/sound';
import { App } from './ui/App';
import { FarmScene } from './world/FarmScene';
import './styles.css';

const debug = new URLSearchParams(location.search).has('debug');

// Stop Safari from zooming the page or swiping back when the player pinches or drags the farm.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

async function start() {
  await document.fonts.load('26px "Lilita One"').catch(() => undefined);
  const game = new Game();
  await game.init();
  if (debug) (window as unknown as { cropsy: Game }).cropsy = game;

  // Sound: iOS only allows audio after a user gesture.
  window.addEventListener('pointerdown', unlockAudio, { capture: true });
  setMuted(game.state.settings.muted);
  game.subscribe(() => setMuted(game.state.settings.muted));
  game.onFx((e) => {
    if (e.kind === 'harvest') play('harvest');
    else if (e.kind === 'plant') play('plant');
    else if (e.kind === 'clear') play('clear');
    else if (e.kind === 'coins') play('coin');
    else if (e.kind === 'levelup') play('levelup');
    else if (e.kind === 'quest' || e.kind === 'expand') play('quest');
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
    backgroundColor: '#8fd16a',
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
        g.scene.add('farm', FarmScene, true, { game });
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

void start();
