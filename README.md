# push-them-out-2

PushThemOut 2 — a revision of the original PushThemOut online co-op game, now
standalone (no server required) and rebuilt with HTML5 Canvas + ES modules.

## Running

The project is a static site. Open `index.html` via any local HTTP server, e.g.:

```sh
python3 -m http.server 8765
# then visit http://localhost:8765/
```

## Project layout

- `index.html` / `css/style.css` — page shell hosting the canvas
- `src/core/` — `Game` orchestrator, `GameConfig`, top-level `GameState` enum
- `src/entities/` — players, enemies, and physics objects (balls, holes, planets, bullets)
- `src/events/` — shared `eventBus`, event names, raw input handler
- `src/logic/` — physics, collision detection, score manager, math utils
- `src/rendering/` — canvas renderer, camera, sprite manager
- `src/audio/` — Web Audio engine and event-driven audio manager
- `src/ui/` — UI screens (e.g. the main `Menu`)

## Game flow

The top-level state machine lives in `GameState`:

```
LOADING → MENU → PLAYING ⇄ PAUSED
                    ↓
                 VICTORY
```

`Menu` (in `src/ui/Menu.js`) drives the title screen with three options
— **Start the game**, **Rules**, and **About** — over an animated background
(twinkling stars, drifting pixel-stars, a slowly falling asteroid, and a
distant planet horizon). Selecting *Start the game* emits
`GameEvents.MENU_START_GAME`, which `Game` consumes to build the level and
switch to `PLAYING`.

## Levels

The game is structured as a six-level campaign. Each level is just a row of
data declared in [`src/core/LevelConfig.js`](src/core/LevelConfig.js):

```js
{
    id:                1,
    name:              'LEVEL 1',
    starsToWin:        50,
    completionMessage: 'Good job! Now collect the 60 stars!',
    background:        { bgInner, bgOuter, borderColor, borderShadow },
    planetPalette:     [/* six hex colours, one per planet */],
    spriteOverrides:   { /* sprite-key → PNG path */ },
}
```

Progression is intentionally seamless. The player **never** sees a
*"Level X cleared, press start"* prompt:

- `ScoreManager` watches `starsCollectedThisLevel`. When it hits the goal it
  emits `GameEvents.LEVEL_COMPLETE` (or `GAME_VICTORY` on the final level).
- `LevelManager` runs a 2.5-second cross-fade between the outgoing and
  incoming levels: background gradient, table border, and the six obstacle
  planets all interpolate their colours each frame.
- At the midpoint of the fade the level index flips, the HUD label
  switches, and any per-level sprite overrides are applied via
  `SpriteManager.swapSprite`.
- The only player-facing acknowledgement is one `SHOW_NOTIFICATION`
  carrying the new goal (e.g. *"Good job! Now collect the 60 stars!"*).

Adding a seventh level is purely additive — push a new entry onto `LEVELS`
and the rest of the engine picks it up automatically.

### Per-level art

Per-level sprites live under `assets/sprites/levels/levelN/<key>.png` (the
keys mirror those in [`assets/sprites/sprites.json`](assets/sprites/sprites.json)
— `star_collectible`, `asteroid`, `planet_green`, etc.). Drop a PNG at the
expected path and `LevelManager` loads it during the next transition. If a
file is missing the previous sprite or the procedural fallback is used —
the game never breaks for missing assets.
