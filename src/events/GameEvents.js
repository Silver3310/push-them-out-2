export const GameEvents = Object.freeze({
    // Game lifecycle
    GAME_START:   'game:start',
    GAME_PAUSE:   'game:pause',
    GAME_RESUME:  'game:resume',
    GAME_OVER:    'game:over',
    GAME_VICTORY: 'game:victory',
    STATE_CHANGE: 'game:stateChange',

    // Ball events
    BALL_HIT:          'ball:hit',
    BALL_FELL_IN_HOLE: 'ball:fellInHole',
    BALL_RESPAWN:      'ball:respawn',
    BALL_SHOOT:        'ball:shoot',

    // Score
    SCORE_CHANGE:    'score:change',
    STAR_COLLECTED:  'score:starCollected', // player touched a collectible star
    STAR_LOST:       'score:starLost',      // star fell into a hole

    // Player
    PLAYER_DEATH: 'player:death',
    PLAYER_SPAWN: 'player:spawn',

    // Enemy
    ENEMY_DEATH: 'enemy:death',
    ENEMY_SPAWN: 'enemy:spawn',

    // Audio commands (emitted by game logic, consumed by AudioManager)
    PLAY_SFX:   'audio:playSfx',
    PLAY_MUSIC: 'audio:playMusic',
    STOP_MUSIC: 'audio:stopMusic',

    // Asteroids
    ASTEROID_WARNING: 'asteroid:warning', // emitted ASTEROID_WARNING_TIME seconds before a shower
    ASTEROID_HIT:     'asteroid:hit',     // emitted when an asteroid destroys an entity on impact

    // Menu (emitted by the Menu UI, consumed by Game)
    MENU_START_GAME: 'menu:startGame',

    // Notifications (emit to display a galaxy-style slide-in panel)
    // Payload: { message: string, duration?: number }
    SHOW_NOTIFICATION: 'ui:showNotification',
});