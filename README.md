# Cropsy

A cozy isometric farming game for the web and iPhone. Plant crops that grow in real time, harvest,
sell, and slowly bring the village of Bramblewick back to life. No avatar, no watering, no purchases.

**Play:** https://ctmbren.github.io/Cropsy/ (on iPhone: open in Safari, tap Share → Add to Home Screen)

## Status

**Phase 2 complete: mechanics.** Chapters 1 and 2 of the story are playable:

- **Chapter 1:** Tobias's letter, Goldie's visits, six quests ending with Bruno rebuilding the gate overnight
- **Chapter 2 (from level 6):** grumpy Rufus, a saw for the old stumps, a 3-stage project to restore the
  mill (it turns overnight), then your first flour
- 15 crops from 30 seconds to 48 hours, levels to 30 with a level-up card showing what unlocked
- Processing buildings with queues that keep working while the game is closed: the Mill (flour),
  Jam Maker and Bakery; extra queue slots cost Ribbons
- Goldie's store (saw, pickaxe, fertilizer, buildings), Bruno's land expansions up to 9×9, his lumber
  yard and barn upgrades, and a market stall with daily prices and a featured crop
- Friends: 0–10 hearts with Goldie, Bruno and Rufus from daily gifts, orders and quests; chatter that
  warms up as you get closer; a perk from each at 5 hearts
- Soil upgrades (faster growth, bonus crops) and fertilizer (doubles a harvest)
- A barn that never blocks a harvest: when it's full, extra crops ship automatically
- Ribbons from level-ups, first harvests, some orders and the story; never sold for money
- Gentle synthesized background music and sound effects, each with its own toggle

Art is placeholder vector drawing until the art pipeline lands.

## Pacing

`npm run sim` plays a simulated casual player (one 30-minute first session, then four check-ins a day)
through the real game logic and prints how long each level takes. Current tuning: level 5 in the first
session, level 10 around day 5, level 20 around day 16, level 30 around day 41. `tests/unit/pacing.test.ts`
keeps those targets and checks the story never dead-ends.

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
tests/unit/       Vitest tests (incl. pacing guards)
tools/sim.ts      economy simulator (npm run sim)
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
