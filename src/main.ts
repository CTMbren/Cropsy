import * as Phaser from 'phaser';
import { h, render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { Game } from './game';
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

  let updateReady = false;
  const updateSW = registerSW({
    onNeedRefresh() {
      updateReady = true;
      draw();
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
