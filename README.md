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
    hazards:           {
        asteroids:  true,
        blackHoles: false,
        cakes:      false,
        bombs:      false,
    },
    hazardMessages: {                              // shown when a hazard is first introduced
        blackHoles: 'New hazard: black holes!',
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

| Source                              | Effect on player              |
| ----------------------------------- | ----------------------------- |
| Normal enemy (no abilities) contact | Push (physics)                |
| Spiked enemy contact                | Death + respawn               |
| Enemy bullet hit                    | Push only                     |
| Boss firing ray                     | Death + respawn               |
| Asteroid hit                        | Death + respawn               |
| Black hole — kill core              | Death + respawn               |
| Cake contact                        | Fat & slow status (4s)        |
| Bomb explosion                      | High-impulse push (no damage) |

Death funnels through `Game._killPlayer`, which parks the player with
`isInHole = true` for the standard 2-second respawn delay and grants a
short post-respawn invulnerability window
(`PLAYER_RESPAWN_INVULN`) so the player can't be re-killed by a boss
camping the spawn point.

Enemy bullets are distinguished from player bullets by `bullet.kind`
(see [`Bullet`](src/entities/objects/Bullet.js)). `Game._updateBullets`
branches on that field so each kind only collides with its intended
target.

## Environmental hazards

Hazards are owned by dedicated lifecycle managers under
[`src/logic/`](src/logic). All four follow the same shape: an internal
[`ShowerScheduler`](src/logic/ShowerScheduler.js) drives the periodic
mass-spawn ("shower") events, while `update(dt, W, H)` handles solo
replenishment between events. Game.js wires them up identically — pass
the `SpriteManager`, optionally a `getObstacles` closure for safe-spawn
checks, then call `setEnabled(...)` whenever the active level changes.

Activation is declarative: `LEVELS[i].hazards` toggles each manager on
or off. The convention is cumulative — once a hazard is introduced it
stays on for every subsequent level — but any level can opt out by
flipping the flag back to false.

| Hazard      | Introduced | Manager                                                | Sprite key   | Customise via                                          |
| ----------- | ---------- | ------------------------------------------------------ | ------------ | ------------------------------------------------------ |
| Asteroids   | LEVEL 1    | [`AsteroidManager`](src/logic/AsteroidManager.js)      | `asteroid`   | `sprites.swapSprite('asteroid', 'path/to/img.png')`    |
| Black holes | LEVEL 2    | [`BlackHoleManager`](src/logic/BlackHoleManager.js)    | `black_hole` | `sprites.swapSprite('black_hole', 'path/to/img.png')`  |
| Cakes       | LEVEL 3    | [`CakeManager`](src/logic/CakeManager.js)              | `cake`       | `sprites.swapSprite('cake', 'path/to/img.png')`        |
| Bombs       | LEVEL 4    | [`BombManager`](src/logic/BombManager.js)              | `bomb`       | `sprites.swapSprite('bomb', 'path/to/img.png')`        |

Every hazard has a procedural canvas fallback, so the game runs with
zero asset files. To swap art persistently, point the `src` field of
the relevant entry in [`assets/sprites/sprites.json`](assets/sprites/sprites.json)
at your replacement PNG and reload — the SpriteManager picks it up at
manifest-load time.

### Black holes

A black hole lives `BLACK_HOLE_LIFESPAN` seconds, applies a radial pull
plus a tangential swirl force to anything inside `BLACK_HOLE_PULL_RADIUS`
(producing a visible spiral inward), and destroys whatever crosses
`BLACK_HOLE_KILL_RADIUS`. The very centre is hard-painted opaque black
on top of any sprite, so the kill zone is unmistakable regardless of
artwork.

Cadence: one solo black hole every `BLACK_HOLE_SPAWN_INTERVAL`
seconds; a 3-at-once **storm** every `BLACK_HOLE_STORM_INTERVAL`
seconds, telegraphed by an on-screen warning that fires
`BLACK_HOLE_WARNING_TIME` seconds in advance.

### Cakes

Cakes are static, player-sized pickups. Touching one consumes the cake
and applies a "fat & slow" status to the player for
`CAKE_SLOW_DURATION` seconds: the player's radius grows by
`CAKE_FAT_RADIUS_MULTIPLIER` and movement (both thrust and max speed)
is scaled by `CAKE_SLOW_MULTIPLIER`. The status is visualised by a
pulsing pink frosting outline. Re-touching another cake while still
fat extends the timer to whichever value is later — it never shortens
an active debuff. AI enemies ignore cakes by design.

Cadence: solo replenishment with a `CAKE_RESPAWN_DELAY` cooldown after
each is eaten; a 4-at-once **buffet** every `CAKE_BUFFET_INTERVAL`
seconds, with a `CAKE_WARNING_TIME` lead-in.

### Bombs

Bombs are proximity mines. A bomb sits inert until any qualifying ball
(player or non-boss enemy) enters `BOMB_TRIGGER_RADIUS`, at which
point a `BOMB_FUSE_DURATION` fuse begins flashing. On detonation the
bomb applies an outward impulse of `BOMB_EXPLOSION_FORCE` (with linear
falloff to zero at `BOMB_EXPLOSION_RADIUS`) to every ball inside the
blast, then destroys itself in a brief flash. Bombs **push** — they
don't kill on impact, but a lucky blast into a hole or a black hole
will.

Cadence: solo replenishment with `BOMB_RESPAWN_DELAY` cooldown; a
4-at-once **minefield** every `BOMB_FIELD_INTERVAL` seconds with a
`BOMB_WARNING_TIME` lead-in.

### Adding a new hazard

1. Create the entity under `src/entities/objects/MyHazard.js`. Follow the
   sprite-or-procedural-fallback pattern used by `Star`, `Asteroid`, etc.
2. Create the manager under `src/logic/MyHazardManager.js`. Compose a
   `ShowerScheduler` for the cadence and warning event, expose
   `setEnabled`, `update(dt, W, H)`, and `reset()`.
3. Add a `MY_HAZARD_*` block of tunables to
   [`GameConfig`](src/core/GameConfig.js) and a `MY_HAZARD_WARNING`
   event name to [`GameEvents`](src/events/GameEvents.js).
4. Register the sprite key in
   [`assets/sprites/sprites.json`](assets/sprites/sprites.json) (add a
   procedural fallback in the entity so missing files are non-fatal).
5. Wire it into `Game.js`: instantiate in `_buildLevel`, call
   `_applyHazardFlags`, drive `update()` from `_update()`, render in
   `_render()`, and contribute a warning entry from
   `_collectHazardWarnings()`.
6. Flip the flag on whichever levels should run it inside
   [`LevelConfig.js`](src/core/LevelConfig.js).
