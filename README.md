# Cropsy

A cozy isometric farming game for the web and iPhone. Plant crops that grow in real time, harvest,
sell, and slowly bring the village of Bramblewick back to life. No avatar, no watering, no purchases.

**Play:** https://ctmbren.github.io/Cropsy/ (on iPhone: open in Safari, tap Share → Add to Home Screen)

## Status

**Phase 2 (part 1), mechanics.** Chapters 1 and 2 of the story are playable:

- **Chapter 1:** Tobias's letter, Goldie's visits, six quests ending with Bruno rebuilding the gate overnight
- **Chapter 2 (from level 6):** grumpy Rufus, a saw for the old stumps, a 3-stage project to restore the
  mill (it turns overnight), then your first flour
- 15 crops from 30 seconds to 48 hours, levels to 30 with a level-up card showing what unlocked
- Processing buildings with queues that keep working while the game is closed: the Mill (flour),
  Jam Maker and Bakery; extra queue slots cost Ribbons
- Goldie's store (saw, pickaxe, buildings), Bruno's land expansions up to 9×9 with stumps,
  boulders and the odd gold nugget, and a market stall with daily prices and a featured crop
- Ribbons: earned from level-ups, first harvests, some orders and the story; never sold for money
- Request board orders for crops and, once you can make them, goods

Coming in part 2: villager hearts and gifts, soil tiers and fertilizer, barn capacity, an economy
simulator to tune pacing, and music. Art is placeholder vector drawing until the art pipeline lands.

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
content/          game data: crops, economy (goods, buildings, tools, land), quests, letters, projects
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
