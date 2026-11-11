# Cropsy art

Generated sprites live here. Every farm sprite in the game is looked up by a key in `ArtRegistry`
(`src/world/art.ts`). A key with an entry in this manifest uses that art; anything else keeps its
code-drawn placeholder. So art can land one key at a time.

## Layout

```
art/
  manifest.json   every sprite: key, source file, pivot, provenance
  src/            source PNGs at masterScale (4×), transparent background
```

`npm run art:pack` turns them into `public/art/` (committed; the game loads it at boot):

```
public/art/
  index.json                 key → page and pivot
  <page>.<hash>.json         Phaser multiatlas
  <page>-<n>.<hash>.webp     pages of at most 2048², WebP q90
```

## manifest.json

```json
{
  "version": 1,
  "masterScale": 4,
  "shipScale": 2,
  "assets": [
    {
      "key": "crop/radish/ripe",
      "file": "src/crop/radish/ripe.png",
      "pivot": [0.5, 0.92],
      "model": "flux-dev",
      "lora": "cropsy-style-v1",
      "prompt": "…",
      "seed": 1234,
      "edits": ["rembg", "quantise", "restroke"],
      "checks": { "paletteDE": 3.1 }
    }
  ]
}
```

- **key**: the ArtRegistry key. The pack checks it against the game's content and fails on typos.
  - `crop/<id>/<seed|sprout|growing|ripe>`
  - `tile/soil/<0-3>`, `tile/grass`, `tile/overgrown`
  - `obstacle/<weeds|branch|rock|stump|boulder>[/b]`
  - `marker/bubble[-fresh]/<crop>`, `marker/fertilizer`, `marker/sparkle`
  - `building/mill/<0-3|wheel>`, `building/jam_maker`, `building/bakery`
  - `decor/<id>`, `decor/part/<glow|bee|blades|drop|twinkle>`
  - `critter/<id>`
  - `moss/<body|tail|bone>`
  - `portrait/<villager>/<mood>`
  - `fx/<name>`
  - Add `@<variant>` for seasons or night, e.g. `tile/grass@night`. A missing variant falls back to the base key.
- **file**: PNG path relative to `art/`, painted at `masterScale` pixels per logical pixel. The pack scales it to `shipScale` and trims transparent edges.
- **pivot**: the anchor point as fractions of the source image. This is the footprint base, which sits on the tile centre from `cellToScreen`.
- **model, lora, prompt, seed, edits, checks**: provenance only. The game never reads them.

## Pages and loading

Pages are grouped by what's needed together:

- `core`: tiles, obstacles, markers, Moss, fx
- `crops-1`, `crops-6`, `crops-11`: crops by unlock level
- `buildings`, `decor`, `critters`, `portraits`
- `<group>@<variant>`: seasons and night

The game loads every base page during the splash screen, which now shows real progress. Variant
pages aren't loaded yet; that comes with seasons. Offline, `index.json` and the `core` pages are
installed with the app. Other pages are cached the first time they load, and their hashed names
mean a new pack can never be served stale.

The pack refuses to write anything if any asset fails a check, and lists every problem it found.

Not packed yet: HUD and seed-tray icons (`icon/*`), which are drawn in the DOM rather than in Phaser.
