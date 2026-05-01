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

    // Level 1 win condition
    LEVEL_NAME:   'LEVEL 1',
    STARS_TO_WIN: 50,

    // Audio distance model (Web Audio API inverse-distance rolloff)
    AUDIO_REFERENCE_DISTANCE: 200,
    AUDIO_MAX_DISTANCE:       800,
    AUDIO_ROLLOFF_FACTOR:     1.0,
    MUSIC_VOLUME: 0.4,
    SFX_VOLUME:   0.8,

    // Sprite auto-scale: all sprite sizes are authored for this reference resolution
    SPRITE_REFERENCE_WIDTH:  1280,
    SPRITE_REFERENCE_HEIGHT: 720,
});
