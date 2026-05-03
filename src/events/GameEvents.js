export const GameEvents = Object.freeze({
    // Game lifecycle
    GAME_START:   'game:start',
    GAME_PAUSE:   'game:pause',
    GAME_RESUME:  'game:resume',
    GAME_OVER:    'game:over',
    GAME_VICTORY: 'game:victory',
    STATE_CHANGE: 'game:stateChange',

    // Level lifecycle (visual cross-fade is owned by LevelManager;
    // listeners use this event to reset per-level state and surface a
    // single notification — there is no formal "level cleared" modal).
    // Payload: { from: LevelConfig, to: LevelConfig }
    LEVEL_COMPLETE: 'level:complete',

    // Fired by LevelManager at the MIDPOINT of a transition, the moment the
    // active-level index flips and sprite swaps begin. Game listens to this
    // to rebuild the enemy roster for the destination level so the swap
    // lands in lock-step with the gradient/sprite cross-fade.
    // Payload: { level: LevelConfig }
    LEVEL_TRANSITION_MID: 'level:transitionMid',

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

    // Black holes
    BLACK_HOLE_WARNING:   'blackHole:warning',   // 3-at-once storm incoming
    BLACK_HOLE_SWALLOWED: 'blackHole:swallowed', // entity reached the kill core

    // Cakes
    CAKE_WARNING:    'cake:warning',    // 4-at-once buffet incoming
    PLAYER_ATE_CAKE: 'player:ateCake',  // player just acquired the fat/slow status

    // Bombs
    BOMB_WARNING:  'bomb:warning',  // 4-at-once minefield incoming
    BOMB_PRIMED:   'bomb:primed',   // a bomb just had its fuse lit
    BOMB_EXPLODED: 'bomb:exploded', // a bomb just detonated

    // Menu (emitted by the Menu UI, consumed by Game / AudioManager)
    MENU_START_GAME:    'menu:startGame',
    // Fired when the cursor first enters a menu button (rising edge only —
    // not re-emitted while the cursor stays on it). Drives the hover SFX.
    // Payload: { id: string }
    MENU_BUTTON_HOVER:  'menu:buttonHover',
    // Fired when a menu button is clicked. Drives the click SFX.
    // Payload: { id: string }
    MENU_BUTTON_CLICK:  'menu:buttonClick',

    // Boss (final-level antagonist)
    // Fired the moment the killing-ray state machine flips IDLE → TELEGRAPH,
    // i.e. the visual/audio "charge-up" begins. AudioManager plays the
    // ray SFX here so the sound aligns with the on-screen warning line.
    // Payload: { boss: Boss }
    BOSS_RAY_TELEGRAPH: 'boss:rayTelegraph',

    // Notifications (emit to display a galaxy-style slide-in panel)
    // Payload: { message: string, duration?: number }
    SHOW_NOTIFICATION: 'ui:showNotification',

    // Spawn warning — fired the moment a yellow telegraph circle appears at
    // the future spawn point of a hazardous entity. AudioManager turns this
    // into a short "incoming" beep so the audio cue lands with the visual.
    // Payload: { x: number, y: number, radius: number, kind: string }
    SPAWN_WARNING: 'spawn:warning',
});