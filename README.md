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
- `src/audio/` — Web Audio engine, manifest-driven audio manager, music + SFX
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

Several entity sprite keys can be customised per level — they're listed in
`LEVEL_SPRITE_KEYS` inside [`src/core/LevelConfig.js`](src/core/LevelConfig.js):

| Key                | Drawn by                                            | Notes                              |
| ------------------ | --------------------------------------------------- | ---------------------------------- |
| `star_collectible` | [`Star`](src/entities/objects/Star.js)              |                                    |
| `asteroid`         | [`Asteroid`](src/entities/objects/Asteroid.js)      |                                    |
| `enemy_ball`       | [`Enemy`](src/entities/enemies/Enemy.js)            |                                    |
| `planet_green`     | [`Planet`](src/entities/objects/Planet.js)          | Tinted via `planetPalette`         |
| `planet_orange`    | [`Planet`](src/entities/objects/Planet.js)          | Tinted via `planetPalette`         |
| `planet_blue`      | [`Planet`](src/entities/objects/Planet.js)          | Tinted via `planetPalette`         |
| `planet_pink`      | [`Planet`](src/entities/objects/Planet.js)          | Tinted via `planetPalette`         |

A fifth gameplay key — `boss` — is only swapped on level 6 and is drawn by
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

### Planets — sprite + tint

Each level declares two related arrays for its six obstacle planets:

```js
planetSprites: ['planet_green', 'planet_green', 'planet_orange',
                'planet_blue',  'planet_pink',  'planet_green'],
planetPalette: ['#c8e06e', '#c8e06e', '#e0a06e',
                '#6ec8e0', '#e06ec8', '#c8e06e'],
```

`planetSprites[i]` picks which manifest sprite key planet *i* uses, and
`planetPalette[i]` is multiplied over that sprite as a tint via the
SpriteManager's blend pass. A single **black-and-white** PNG can therefore
back every planet on every level — the level palette is what gives each
its identity, and the cross-fade between levels recolours them
automatically along with the rest of the gradient.

If the sprite is missing, the planet falls back to a procedural radial
gradient (using the same palette colour) — so dropping or swapping the
artwork can never break the level.

## Enemies

Each level declares its enemy roster on `LEVELS[i].enemies`. The
[`AIController`](src/entities/enemies/AIController.js) drives standard
enemies (seek the player, flee nearby holes, fire bullets when the
SHOOTER ability is on cooldown). The final level uses
[`Boss`](src/entities/enemies/Boss.js) +
[`BossController`](src/entities/enemies/BossController.js), which add
two boss-only mechanics on top of the same base behaviour:

- **Dash** — the boss
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

## Spawn warnings

Hazardous entities never appear directly on top of the player. Whenever
the game is about to place a black hole, a bomb, or a fresh enemy/boss,
[`WarningManager`](src/logic/WarningManager.js) first paints a yellow
**telegraph circle** at the future spawn point — same size as the
incoming entity — for `GameConfig.SPAWN_WARNING_DURATION` seconds
(3 s by default). Only when that timer expires is the actual entity
constructed, giving the player a fixed grace window to vacate the area.

The mechanism is callback-based: spawning code calls
`warningManager.schedule({ x, y, radius, kind, onFire })` and `onFire` is
what eventually instantiates the hazard. This keeps the manager focused
on *timing and visualisation*; *what* gets spawned and *where it goes*
stays with the caller.

| Source                                       | Telegraphed | Notes                                                     |
| -------------------------------------------- | ----------- | --------------------------------------------------------- |
| Black hole (solo + storm)                    | Yes         | Telegraph radius = `BLACK_HOLE_PULL_RADIUS`               |
| Bomb (solo + minefield)                      | Yes         | Telegraph radius = `BOMB_TRIGGER_RADIUS`                  |
| Enemy / boss spawn at level transitions      | Yes         | Old enemies are cleared instantly; new ones materialise after the warning |
| Enemy respawn after death                    | No          | Player just got a kill — fixed slots, no surprise         |
| Cake, asteroid                               | No          | Asteroids fall from off-screen; cakes are beneficial bait |
| Boss killing-ray                             | (existing telegraph line) | Already gives a `BOSS_RAY_TELEGRAPH` window |

Warnings tick on the same physics step as the rest of the game, so they
freeze cleanly during pause. They emit `GameEvents.SPAWN_WARNING` when
shown — `AudioManager` turns this into a spatialised "incoming" beep at
the future spawn point.

To telegraph a NEW spawn source, instantiate or accept a `WarningManager`
in the relevant manager and route the spawn through `schedule(...)`
instead of constructing the entity directly. See
[`BlackHoleManager._queueSpawn`](src/logic/BlackHoleManager.js) for the
canonical pattern.

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
   `setEnabled`, `update(dt, W, H)`, and `reset()`. Accept an optional
   `warnings` reference and route every spawn through
   `warnings.schedule({ x, y, radius, kind, onFire })` so the player gets
   the standard yellow telegraph circle before the hazard appears.
3. Add a `MY_HAZARD_*` block of tunables to
   [`GameConfig`](src/core/GameConfig.js) and a `MY_HAZARD_WARNING`
   event name to [`GameEvents`](src/events/GameEvents.js).
4. Register the sprite key in
   [`assets/sprites/sprites.json`](assets/sprites/sprites.json) (add a
   procedural fallback in the entity so missing files are non-fatal).
5. Wire it into `Game.js`: instantiate in `_buildLevel` (passing
   `this._warningManager` as `warnings`), call `_applyHazardFlags`,
   drive `update()` from `_update()`, render in `_render()`, and
   contribute a warning entry from `_collectHazardWarnings()`.
6. Flip the flag on whichever levels should run it inside
   [`LevelConfig.js`](src/core/LevelConfig.js).

## Audio

Audio is fully manifest-driven via
[`assets/sounds/sounds.json`](assets/sounds/sounds.json) — no JS edits
required to repoint a sound or to add per-level music. The runtime is
split into:

- [`AudioEngine`](src/audio/AudioEngine.js) — Web Audio graph
  (BufferSource → spatial gain → SFX or music bus → master). Exposes
  `playBuffer()` returning a `PlaybackHandle` with `fadeIn` /
  `fadeOut` / `stop` for envelope control, plus `rampMusicVolume()`
  for the pause dip.
- [`AudioManager`](src/audio/AudioManager.js) — loads the manifest,
  binds `eventBus` listeners, and owns the music crossfade + pause
  behaviour. Lazy-loads any `preload: false` clip on first use so the
  initial menu paint isn't blocked by long music files.

### Manifest layout

```jsonc
{
  "menuMusic":          "music_menu",
  "musicByLevel":       { "1": "music_level_1", "2": "music_level_2", … },
  "musicCrossfadeSec":  2.5,    // crossfade duration when swapping tracks
  "musicPauseFadeSec":  0.25,   // dip duration on pause / resume
  "sounds": {
    "key": {
      "src":      "assets/sounds/sfx/file.ogg",
      "preload":  true,         // false = lazy-load on first use (default for music)
      "category": "sfx",        // 'sfx' (sfx bus) or 'music' (music bus)
      "volume":   1.0           // optional per-clip multiplier (0..1+)
    }
  }
}
```

Top-level keys starting with `_` are ignored — they're for human-readable
notes (`_comment`, `_schema`, `_groups`).

### Per-level music & smooth transitions

`musicByLevel` maps level ids to sound keys. When the player advances:

1. `LevelManager.advance()` starts the 2.5s gradient cross-fade.
2. At the cross-fade midpoint, `LEVEL_TRANSITION_MID` fires.
3. `AudioManager` reacts by crossfading the music: the outgoing track
   is ramped to silence and the incoming track is ramped up from
   silence, both over `musicCrossfadeSec`.

Adding a soundtrack for a new level is purely additive: add a `sounds`
entry, then a `musicByLevel["N"]` row.

### Pause / resume

Pressing ESC during play emits `GAME_PAUSE`; `AudioManager` ramps the
music bus to silence (`musicPauseFadeSec`) and plays the `pause_click`
SFX. `GAME_RESUME` ramps the bus back to `GameConfig.MUSIC_VOLUME`.
SFX is left audible so the pause click and resume click are heard.

### Browser autoplay unlock

The Web Audio context can't start until a user gesture. `AudioManager`
binds a one-shot listener on the first `click` / `keydown` that
initialises the context and starts preloading. Music requested before
the unlock (e.g. `playMenuMusic()` at boot) is queued and played the
moment the context comes up.

### SFX bindings

`AudioManager._bindSfxEvents` is the one place that maps game events to
sound keys. To add a new SFX hook:

1. Add an entry to `sounds.json`.
2. Add one `eventBus.on(GameEvents.X, … this.playSfx('key', x, y))` line.

The current bindings are:

| Event                                            | Sound key          |
| ------------------------------------------------ | ------------------ |
| `MENU_BUTTON_HOVER`                              | `menu_hover`       |
| `MENU_BUTTON_CLICK`                              | `menu_click`       |
| `GAME_PAUSE` / `GAME_RESUME`                     | `pause_click`      |
| `BALL_SHOOT` (player, non-special)               | `player_shoot`     |
| `BALL_SHOOT` (enemy)                             | `enemy_shoot`      |
| `BALL_SHOOT` (special burst)                     | `special`          |
| `PLAYER_DEATH`                                   | `player_death`     |
| `BLACK_HOLE_SWALLOWED` (target = player)         | `black_hole_death` |
| `STAR_COLLECTED`                                 | `star_collected`   |
| `PLAYER_ATE_CAKE`                                | `cake_eaten`       |
| `ASTEROID/BLACK_HOLE/CAKE/BOMB_WARNING`          | `warning`          |
| `SPAWN_WARNING` (per-spawn telegraph circle)     | `warning`          |
| `SHOW_NOTIFICATION`                              | `notification`     |
| `BOSS_RAY_TELEGRAPH`                             | `boss_ray`         |
| `BALL_HIT` (`strength > 0.5`)                    | `ball_hit`         |
| `BALL_FELL_IN_HOLE`                              | `ball_in_hole`     |
| `PLAYER_SPAWN`                                   | `respawn`          |
| `GAME_VICTORY`                                   | `victory`          |

### Customising at runtime

```js
audioManager.swapSound('player_shoot', 'assets/sounds/sfx/laser.ogg');
audioManager.playLevelMusic(3);          // forces level-3 music with crossfade
audioManager.stopMusic(1.0);             // 1s fade to silence
```

Spatial attenuation is automatic — every `playSfx(key, x, y)` call
attenuates by distance from the player using the inverse-distance model
configured in `GameConfig.AUDIO_*`.
