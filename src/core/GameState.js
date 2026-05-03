export const GameState = Object.freeze({
    LOADING:   'LOADING',
    // Pre-menu company splash — gates the first user gesture so the browser's
    // audio context can unlock the moment the player presses any button.
    SPLASH:    'SPLASH',
    MENU:      'MENU',
    INTRO:     'INTRO',
    PLAYING:   'PLAYING',
    PAUSED:    'PAUSED',
    GAME_OVER: 'GAME_OVER',
    VICTORY:   'VICTORY',
    OUTRO:     'OUTRO',
});