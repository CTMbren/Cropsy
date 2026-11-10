# Cropsy

A cozy isometric farming game for the web and iPhone. Plant crops that grow in real time, harvest,
sell, and slowly bring the village of Bramblewick back to life. No avatar, no watering, no purchases.

**Play:** https://ctmbren.github.io/Cropsy/ (on iPhone: open in Safari, tap Share → Add to Home Screen)

## Status

Phase 0 scaffold: a 4×4 isometric farm with five crops growing on real timestamps, tap or drag to
plant and harvest, Fresh Pick bonus, levels, a "while you were away" summary, IndexedDB saves with
backup codes, and an installable offline web app. Art is placeholder vector drawing until the art
pipeline lands.

## Stack

TypeScript · [Phaser 4](https://phaser.io) for the farm · [Preact](https://preactjs.com) for the HUD ·
Vite · vite-plugin-pwa · Vitest · GitHub Actions → GitHub Pages.

## Develop

```sh
npm install
npm run dev        # http://localhost:5173 (also on your LAN, so you can open it on your iPhone)
npm test           # unit tests for the game logic
npm run build      # type-check + production build into dist/
```

Add `?debug=1` to the URL to get +1 min / +1 h / +1 day time-skip buttons in the settings menu.

## Layout

```
content/          game data (crops.json) — balance changes need no code
src/core/         pure game logic: no Phaser or DOM, fully unit-tested
src/platform/     browser services: IndexedDB saves
src/world/        Phaser farm scene and isometric math
src/ui/           Preact HUD, seed tray, dialogs
tests/unit/       Vitest tests
public/           icons, font licences
```

## How saving works

Saves go to IndexedDB in two alternating slots with a checksum, written a couple of seconds after
each action and whenever the app is hidden. Safari can clear data for sites that aren't on the home
screen after 7 days without a visit, so the game nudges iPhone players to add it to the home screen
and offers a copyable backup code under Settings.

## Deploy

Every push to `main` runs the tests, builds, and publishes to GitHub Pages
(`.github/workflows/pages.yml`). One-time setup: repo **Settings → Pages → Source: GitHub Actions**.

## Licences

Fonts: Lilita One and Fredoka, SIL Open Font License 1.1 (see `public/fonts/`).
