# Cropsy

A cozy isometric farming game for the web and iPhone. Plant crops that grow in real time, harvest,
sell, and slowly bring the village of Bramblewick back to life. No avatar, no watering, no purchases.

**Play:** https://ctmbren.github.io/Cropsy/ (on iPhone: open in Safari, tap Share → Add to Home Screen)

## Status

**Phase 1, vertical slice.** Chapter 1 of the story is playable:

- Tobias's letter, Goldie's visits, and six quests ending with Bruno rebuilding the gate overnight
- Weeds, branches and rocks to clear (branches give wood, rocks give stone)
- Harvests go to the barn; sell at the shipping crate (70%) or fill request-board orders (1.8×)
- Request board with a pinned story order plus three new orders every local midnight
- Mailbox with next-day letters, a "while you were away" summary, Replant All, drag to plant
- Coin flyers, harvest bursts and synthesized sound effects (respects the silent switch)

Art is placeholder vector drawing until the art pipeline lands.

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

Add `?debug=1` to the URL to get +1 min / +1 h / +1 day time-skip buttons, quest state and an
event log in the settings menu.

## Layout

```
content/          game data: crops, quests, letters, villagers — story and balance changes need no code
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
