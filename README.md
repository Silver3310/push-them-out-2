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
    entryMessage:      'Good job! Now collect the 60 stars!',
    background:        { bgInner, bgOuter, borderColor, borderShadow },
    planetPalette:     [/* six hex colours, one per planet */],
    enemies:           {
        count:          2,
        abilities:      ['spiked', 'shooter'],     // any subset of EnemyAbility
        color:          '#ffe066',                 // shared sprite tint
        abilityMessage: 'Heads up — they shoot!',  // optional 2nd notification
        boss:           false,                     // set true for a single Boss
    },
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
  `SpriteManager.swapSprite(key, src, fadeMs)`. The sprite manager keeps
  the outgoing image around for `fadeMs` and alpha-blends both during
  `draw()`, so the artwork dissolves into the new look in lock-step with
  the gradient.
- The only player-facing acknowledgement is one `SHOW_NOTIFICATION`
  carrying the destination level's `entryMessage` (e.g. *"Good job! Now
  collect the 60 stars!"*).

Adding a seventh level is purely additive — push a new entry onto `LEVELS`
and the rest of the engine picks it up automatically.

### Per-level art

Three entity sprite keys can be customised per level — they're listed in
`LEVEL_SPRITE_KEYS` inside [`src/core/LevelConfig.js`](src/core/LevelConfig.js):

| Key                | Drawn by                                            |
| ------------------ | --------------------------------------------------- |
| `star_collectible` | [`Star`](src/entities/objects/Star.js)              |
| `asteroid`         | [`Asteroid`](src/entities/objects/Asteroid.js)      |
| `enemy_ball`       | [`Enemy`](src/entities/enemies/Enemy.js)            |

A fourth key — `boss` — is only swapped on level 6 and is drawn by
[`Boss`](src/entities/enemies/Boss.js).

Each entity follows the same pattern: if `SpriteManager.has(key)` returns
true the PNG is rendered; otherwise a procedural canvas fallback is drawn.
This means the game runs with zero asset files and you can opt into custom
art per level a sprite at a time.

Drop your replacement PNGs at the conventional path —
`assets/sprites/levels/levelN/<key>.png` — or, for full control, edit
that level's `spriteOverrides` map in `LevelConfig.js`. Missing files
leave the previously cached image in place (the game never breaks for
missing assets).

## Enemies

Each level declares its enemy roster on `LEVELS[i].enemies`. The
[`AIController`](src/entities/enemies/AIController.js) drives standard
enemies (seek the player, flee nearby holes, fire bullets when the
SHOOTER ability is on cooldown). The final level uses
[`Boss`](src/entities/enemies/Boss.js) +
[`BossController`](src/entities/enemies/BossController.js), which add
two boss-only mechanics on top of the same base behaviour:

- **Dash** — when the player crosses `BOSS_DASH_TRIGGER_DIST`, the boss
  bursts toward them via direct velocity assignment (faster than the
  player-cap; capped on the boss-side by `BOSS_MAX_SPEED`). Cooldown
  controlled by `BOSS_DASH_COOLDOWN`.
- **Killing ray** — every `BOSS_RAY_INTERVAL` seconds the boss aims at
  the player's current position and runs an idle → telegraph → firing
  state machine. The telegraph is a thin warning line (visible for
  `BOSS_RAY_TELEGRAPH` seconds); the firing flash is a thick lethal
  beam (active for `BOSS_RAY_DURATION` seconds). Anything inside
  `BOSS_RAY_THICKNESS / 2` of the segment dies.

### Damage rules

| Source                              | Effect on player |
| ----------------------------------- | ---------------- |
| Normal enemy (no abilities) contact | Push (physics)   |
| Spiked enemy contact                | Death + respawn  |
| Enemy bullet hit                    | Push only        |
| Boss firing ray                     | Death + respawn  |
| Asteroid hit                        | Death + respawn  |

Death funnels through `Game._killPlayer`, which parks the player with
`isInHole = true` for the standard 2-second respawn delay and grants a
short post-respawn invulnerability window
(`PLAYER_RESPAWN_INVULN`) so the player can't be re-killed by a boss
camping the spawn point.

Enemy bullets are distinguished from player bullets by `bullet.kind`
(see [`Bullet`](src/entities/objects/Bullet.js)). `Game._updateBullets`
branches on that field so each kind only collides with its intended
target.
