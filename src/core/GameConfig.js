export const GameConfig = Object.freeze({
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
    ENEMY_AI_SPEED:         0.25,

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
    BOSS_DASH_TRIGGER_DIST:   240,  // dash when player is closer than this
    BOSS_DASH_COOLDOWN:       3.0,
    BOSS_DASH_SPEED:          11,   // direct velocity-set magnitude (px/frame)
    BOSS_RAY_INTERVAL:        6.0,  // seconds between ray attacks
    BOSS_RAY_TELEGRAPH:       1.2,  // seconds the warning line is visible
    BOSS_RAY_DURATION:        0.35, // seconds the lethal ray is rendered/active
    BOSS_RAY_THICKNESS:       28,   // pixel width of the killing ray hitbox

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

    // Sprite auto-scale: all sprite sizes are authored for this reference resolution
    SPRITE_REFERENCE_WIDTH:  1280,
    SPRITE_REFERENCE_HEIGHT: 720,
});
