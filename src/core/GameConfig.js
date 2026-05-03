export const GameConfig = Object.freeze({
    // Ten-minute per-run countdown. When this reaches zero the player sees
    // the game-over screen. Resets each time a new game begins.
    GAME_TIMER_DURATION: 600,
    CANVAS_WIDTH:  1280,
    CANVAS_HEIGHT: 720,
    TARGET_FPS:    60,
    FIXED_TIMESTEP: 1 / 60,
    MAX_FRAME_SKIP: 5,

    // Physics
    FRICTION:           0.985,
    BALL_RESTITUTION:   0.85,
    WALL_RESTITUTION:   0.70,
    HOLE_PULL_RADIUS:   40,
    HOLE_CAPTURE_RADIUS: 18,
    HOLE_PULL_FORCE:    0.15,

    // Player
    PLAYER_RADIUS:    18,
    PLAYER_MASS:      1.0,
    PLAYER_THRUST:    0.35,
    PLAYER_MAX_SPEED: 12,
    PLAYER_SHOOT_POWER: 8,

    // Enemy
    ENEMY_RADIUS:           18,
    ENEMY_MASS:             1.0,
    ENEMY_AI_THINK_INTERVAL: 0.5,
    ENEMY_AI_SPEED:         0.1,

    // Per-level abilities are declared on each LEVELS[i].enemies entry in
    // src/core/LevelConfig.js and consumed by Enemy + AIController. The
    // tunables below shape the abilities themselves (cooldowns, projectile
    // speed, etc.); see Enemy.js / Boss.js for how they are applied.
    ENEMY_SHOOT_INTERVAL:     3.0,  // seconds between shots for shooter ability
    ENEMY_BULLET_SPEED:       10,
    ENEMY_BULLET_PUSH_FORCE:  30,   // impulse applied to player when hit by enemy bullet

    // Boss (final-level antagonist; see Boss.js)
    BOSS_RADIUS_MULT:         5,    // multiplier of PLAYER_RADIUS — boss radius
    BOSS_MASS:                8.0,
    BOSS_MAX_SPEED:           14,   // boss can exceed PLAYER_MAX_SPEED while dashing
    BOSS_SHOOT_INTERVAL:      2.5,
    // BOSS_DASH_TRIGGER_DIST removed — the boss now dashes regardless of
    // distance; the only gate is the cooldown timer below.
    BOSS_DASH_COOLDOWN:       3.0,
    BOSS_DASH_SPEED:          11,   // direct velocity-set magnitude (px/frame)
    BOSS_RAY_INTERVAL:        6.0,  // seconds between ray attacks
    BOSS_RAY_TELEGRAPH:       1.2,  // seconds the warning line is visible
    BOSS_RAY_DURATION:        0.35, // seconds the lethal ray is rendered/active
    BOSS_RAY_THICKNESS:       28,   // pixel width of the killing ray hitbox
    // Probability (0–1) that a given ray attack fires as a three-ray spread
    // instead of a single beam. Each outer ray is offset by BOSS_RAY_SPREAD
    // radians from the primary direction.
    BOSS_TRIPLE_RAY_CHANCE:   0.30,
    BOSS_RAY_SPREAD:          0.55, // ~31° offset per outer ray

    // Player invulnerability after respawn — short grace window so a boss
    // sitting on the spawn point or a lingering bullet doesn't produce a
    // chain death loop.
    PLAYER_RESPAWN_INVULN:    1.5,

    // Bullet
    BULLET_RADIUS:   7,
    BULLET_SPEED:    14,
    BULLET_LIFETIME: 3.0,
    BULLET_PUSH_FORCE: 45,

    // Obstacles
    PLANET_BOUNCE_RESTITUTION: 0.6,

    // Stars (collectible entities)
    STAR_RADIUS: 10,
    STAR_MASS:   0.3,   // light – easy for enemies to knock around
    STAR_COUNT:  20,    // stars kept alive on the board at all times

    // Per-level data lives in src/core/LevelConfig.js (level name, star
    // goal, gradient palette, sprite overrides). LevelManager interpolates
    // between consecutive entries during the smooth cross-fade transition.

    // Audio distance model (Web Audio API inverse-distance rolloff)
    AUDIO_REFERENCE_DISTANCE: 200,
    AUDIO_MAX_DISTANCE:       800,
    AUDIO_ROLLOFF_FACTOR:     1.0,
    MUSIC_VOLUME: 0.4,
    SFX_VOLUME:   0.8,

    // Asteroids
    ASTEROID_RADIUS:           24,    // authored-resolution pixels
    ASTEROID_MASS:              5.0,  // heavy – not deflected by normal ball collisions
    ASTEROID_SPEED:             2.5,  // pixels per frame; slow enough for the player to react
    ASTEROID_SHOWER_INTERVAL:  60,   // seconds between shower events
    ASTEROID_SHOWER_SIZE_MIN:   5,   // minimum asteroids in a shower burst
    ASTEROID_SHOWER_SIZE_MAX:   7,   // maximum asteroids in a shower burst
    ASTEROID_WARNING_TIME:     10,   // seconds before a shower that the warning fires

    // Black holes (introduced level 2)
    // A black hole lives BLACK_HOLE_LIFESPAN seconds and pulls everything
    // inside PULL_RADIUS toward its centre with a spiral force. Crossing
    // KILL_RADIUS is fatal regardless of the entity type.
    BLACK_HOLE_PULL_RADIUS:        140,
    BLACK_HOLE_KILL_RADIUS:         18,
    BLACK_HOLE_PULL_FORCE:        0.55,  // radial impulse per tick (scaled by falloff)
    BLACK_HOLE_SWIRL_FORCE:       0.85,  // tangential impulse — drives the spiral
    BLACK_HOLE_LIFESPAN:           3.0,  // seconds on screen before vanishing
    BLACK_HOLE_SPAWN_INTERVAL:    12.0,  // seconds between solo (non-storm) spawns
    BLACK_HOLE_STORM_INTERVAL:    60.0,  // seconds between 3-at-once storm events
    BLACK_HOLE_STORM_SIZE:           3,
    BLACK_HOLE_WARNING_TIME:       8.0,  // lead-in seconds for the on-screen warning

    // Arena Singularity (level 5 exclusive)
    // A permanent, map-wide gravity well centred in the arena. Its pull
    // radius intentionally exceeds the canvas diagonal so every object on
    // the board is always being nudged inward — a constant, escalating
    // challenge. Forces are gentle compared with the transient BlackHole
    // hazard; the kill radius is small and requires deliberate inattention
    // to reach. The boss is immune (same rule as for transient black holes).
    ARENA_SINGULARITY_PULL_RADIUS: 850,  // > canvas diagonal → covers full map
    ARENA_SINGULARITY_KILL_RADIUS:  28,  // lethal core (small — requires effort to reach)
    ARENA_SINGULARITY_PULL_FORCE:  0.07, // radial impulse per tick (scaled by falloff)
    ARENA_SINGULARITY_SWIRL_FORCE: 0.10, // tangential impulse per tick

    // Cakes (introduced level 3)
    // Cakes are static, player-sized pickups. Touching one applies a
    // "fat & slow" debuff for CAKE_SLOW_DURATION seconds — the player
    // grows by CAKE_FAT_RADIUS_MULTIPLIER and moves at
    // CAKE_SLOW_MULTIPLIER × normal thrust/max speed.
    CAKE_SLOW_DURATION:           4.0,
    CAKE_SLOW_MULTIPLIER:        0.4,
    CAKE_FAT_RADIUS_MULTIPLIER:  1.6,
    CAKE_RESPAWN_DELAY:           5.0,  // seconds between solo spawns
    CAKE_BUFFET_INTERVAL:        70.0,  // seconds between 4-at-once events
    CAKE_BUFFET_SIZE:                4,
    CAKE_WARNING_TIME:            7.0,

    // Bombs (introduced level 4)
    // Bombs sit inert until any ball enters BOMB_TRIGGER_RADIUS, then they
    // burn a fuse and explode, applying BOMB_EXPLOSION_FORCE outward to
    // every ball inside BOMB_EXPLOSION_RADIUS.
    BOMB_BODY_RADIUS:                14,  // visual sphere radius
    BOMB_TRIGGER_RADIUS:             58,  // proximity trigger
    BOMB_EXPLOSION_RADIUS:          150,  // outward impulse blast radius
    BOMB_FUSE_DURATION:            0.55,  // seconds between trigger and detonation
    BOMB_EXPLOSION_FORCE:           120,  // peak impulse magnitude (falls off to 0 at edge)
    BOMB_EXPLOSION_FLASH_DURATION: 0.45,  // seconds the flash sprite remains
    BOMB_RESPAWN_DELAY:            6.0,  // seconds between solo spawns
    BOMB_FIELD_INTERVAL:          80.0,  // seconds between 4-at-once minefield events
    BOMB_FIELD_SIZE:                  4,
    BOMB_WARNING_TIME:             7.0,

    // Spawn warnings (yellow telegraph circle painted at the future spawn
    // point of any hazardous entity — black hole, bomb, enemy, boss). Gives
    // the player a fixed grace window to vacate the area before the threat
    // materialises. Used by `WarningManager`; see also `BlackHoleManager`,
    // `BombManager`, and `Game._rebuildEnemies`.
    SPAWN_WARNING_DURATION: 3.0,
    // Visual padding (authored-resolution px) added to a warning's radius so
    // the yellow ring fully encloses the inbound entity, instead of sitting
    // flush with its edge — easier to read at small radii.
    SPAWN_WARNING_RADIUS_PADDING: 6,

    // Sprite auto-scale: all sprite sizes are authored for this reference resolution
    SPRITE_REFERENCE_WIDTH:  1280,
    SPRITE_REFERENCE_HEIGHT: 720,
});
