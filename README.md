# Cropsy

A cozy isometric farming game for the web and iPhone. Plant crops that grow in real time, harvest,
sell, and slowly bring the village of Bramblewick back to life. No avatar, no watering, no purchases.

**Play:** https://ctmbren.github.io/Cropsy/ (on iPhone: open in Safari, tap Share → Add to Home Screen)

## Status

**Phase 4 complete: polish and release prep.** All five chapters are playable, from Tobias's letter to
his homecoming:

- **Chapter 1:** Tobias's letter, Goldie's visits, six quests ending with Bruno rebuilding the gate overnight
- **Chapter 2 (from level 6):** grumpy Rufus, a saw for the old stumps, a 3-stage project to restore the
  mill (it turns overnight), then your first flour
- **Chapter 3 · Market Day (from level 9):** Pip the baker, rebuilding the market square, opening-day
  pastries, and Ziggy's traveling cart (every third day: early seeds, cheap materials, gold, fertilizer)
- **Chapter 4 · The Almanac (from level 12):** Dr. Hazel Quill and her Almanac, Juniper & Moss, a first
  mastery star and Tobias's heirloom
- **Chapter 5 · The Golden Harvest (from level 17):** the harvest festival, a golden melon and Tobias's
  homecoming
- Chapter title cards, and a Story tab in Mail to re-read every quest and letter
- Crop Mastery: stars at 50 / 200 / 600 harvests of a crop (cheaper seeds, bonus XP, an extra crop)
- Heart events: two short scenes with each villager at 3 and 6 hearts; portraits react to what they say
- Meadow Visitors: critters drop by growing crops every 5–10 minutes (up to 5 at once); tap for
  pollen and honey, and fill Hazel's Field Sketchbook
- Moss naps by the fence and digs up a find every day
- Decorations beside the field (Farm Beauty raises Fresh Pick tips) and a 7-day gift calendar that never
  resets when you miss a day
- 15 crops from 30 seconds to 48 hours, levels to 30 with a level-up card showing what unlocked
- Processing buildings with queues that keep working while the game is closed: the Mill (flour),
  Jam Maker and Bakery; extra queue slots cost Ribbons
- Goldie's store (saw, pickaxe, fertilizer, buildings), land cleared one plot at a time (stumps and boulders around the field, coins plus 30 min or more each, up to 9×9), his lumber
  yard and barn upgrades, and a market stall with daily prices and a featured crop
- Friends: 0–10 hearts with seven villagers from daily gifts, orders and quests; chatter that
  warms up as you get closer; a perk from each at 5 hearts
- Soil upgrades (faster growth, bonus crops) and fertilizer (doubles a harvest)
- A barn that never blocks a harvest: when it's full, extra crops ship automatically
- A request board: every villager you've met posts a request every 2 hours (up to 5, time away
  counts, nothing expires, pass any for free), in Easy and Medium, plus one gold Daily Special from
  level 6, handed in a line at a time; written Specials give keepsakes
- Ribbons from level-ups, first harvests, Daily Specials and the story; never sold for money
- Gentle synthesized background music and sound effects, each with its own toggle

- First impressions: a loading screen, a hint bubble that guides the first few minutes, a backup-code
  reminder at level 5 and weekly after, and a local error log with "Copy problem report" in Settings
- Comfort: three text sizes, ✓/✗ marks beside green/red, a star on Fresh Pick crops
- Juice: crops pop in, drag-harvest combos, a rolling coin counter, level-up confetti
- Late game: Bramblewick improvements (stone bridge, greenhouse, town clock, golden scarecrow), a weekly
  town project for Ribbons and trophies, and an open-ended town level that raises sell prices

Art is placeholder vector drawing until the art pipeline lands.

## Pacing

`npm run sim` plays a simulated casual player (one 30-minute first session, then four check-ins a day)
through the real game logic and prints how long each level takes. Current tuning: level 5 in the first
session, level 10 around day 3, level 20 around day 17, level 30 around day 40. `tests/unit/pacing.test.ts`
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

### Optional visit counter

The game can count launches with [GoatCounter](https://www.goatcounter.com) (free, no cookies, no
personal data). It's off by default. To turn it on, create a GoatCounter site, then add a repository
variable **Settings → Secrets and variables → Actions → Variables → `GOATCOUNTER_CODE`** set to the site
code (the `mycode` in `mycode.goatcounter.com`) and push. Settings in the game then mentions the counting.

### Custom domain

Add the domain under **Settings → Pages → Custom domain** and point a `CNAME` DNS record at
`ctmbren.github.io`. The build uses relative paths, so nothing in the code needs to change except the
`og:url` and `og:image` addresses in `index.html` and the share link in Settings.

## Privacy

Saves stay on the device (IndexedDB, plus any backup code the player copies). The error log stays in the
browser and only leaves it if the player copies a problem report and sends it. Nothing else is sent,
unless the optional visit counter above is turned on.

## Licences

Fonts: Lilita One and Fredoka, SIL Open Font License 1.1 (see `public/fonts/`).
