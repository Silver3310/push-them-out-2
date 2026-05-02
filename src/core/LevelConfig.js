/**
 * Per-level configuration data.
 *
 * The game progresses through these entries in order. Each level controls:
 *
 *   - `name`            Display name shown in the HUD (e.g. "LEVEL 2").
 *   - `starsToWin`      Stars the player must collect before the level
 *                       completes and the next one begins. Increases by 10
 *                       each level by design.
 *   - `entryMessage`    Notification shown the moment the player TRANSITIONS
 *                       INTO this level. The first level has no entry message
 *                       (its onboarding is handled by `_startNewGame`); all
 *                       other levels announce their own goal.
 *   - `background`      Render spec consumed by `Renderer.drawBackground` and
 *                       `Renderer.drawTableBorder`. All hex strings are 6-digit
 *                       so they can be linearly interpolated when transitioning
 *                       between levels.
 *   - `planetPalette`   Six colours assigned in order to the six obstacle
 *                       planets. Lerped during transitions so the planets
 *                       recolour smoothly along with the background.
 *   - `enemies`         Enemy roster for the level. See `EnemyLevelConfig`
 *                       below; controls count, abilities, sprite tint, and
 *                       the optional ability notification queued right after
 *                       `entryMessage`.
 *   - `spriteOverrides` Map of sprite-key → asset src. When the level becomes
 *                       active, `LevelManager` calls `SpriteManager.swapSprite`
 *                       for each entry, cross-fading the old image into the new
 *                       one in lock-step with the gradient transition. Missing
 *                       files keep the previous level's sprite (or the
 *                       procedural fallback when no asset has ever loaded).
 *                       Every level — including L1 — declares its own paths so
 *                       replays restore the default look correctly.
 *
 * The player NEVER sees a level-up modal — transitions are purely visual.
 * The on-screen acknowledgement is up to two `SHOW_NOTIFICATION` events:
 *   1. the destination level's `entryMessage` (the new star goal), and
 *   2. (optional) `enemies.abilityMessage` warning about new enemy abilities.
 *
 * ### Adding a new level
 *
 *   1. Append an entry to `LEVELS` below.
 *   2. Drop optional level-specific PNGs under `assets/sprites/levels/levelN/`
 *      and reference them in `spriteOverrides`.
 *   3. No other code change is required — `LevelManager` walks the array.
 *
 * ### Customising enemy art
 *
 *   The `enemy_ball` sprite key is overridden per-level — drop a PNG at
 *   `assets/sprites/levels/levelN/enemy_ball.png` and it loads automatically
 *   when the level becomes active. The boss-only sprite key `boss` follows
 *   the same convention but is only swapped on level 6.
 */

const LEVEL_SPRITE_ROOT = 'assets/sprites/levels';

/**
 * Sprite keys that each level can override. These correspond to entities
 * whose `render()` consults `SpriteManager` (Star, Asteroid, Enemy). Drop a
 * matching PNG at `assets/sprites/levels/levelN/<key>.png` to customise the
 * look for that level.
 */
const LEVEL_SPRITE_KEYS = Object.freeze([
    'star_collectible',
    'asteroid',
    'enemy_ball',
]);

/**
 * Build a `spriteOverrides` map for the conventional per-level directory.
 */
function _spritesForLevelDir(levelDir) {
    const overrides = {};
    for (const key of LEVEL_SPRITE_KEYS) {
        overrides[key] = `${LEVEL_SPRITE_ROOT}/${levelDir}/${key}.png`;
    }
    return overrides;
}

/**
 * L1 keeps the original sprite-manifest paths so that replaying the campaign
 * after a previous run restores the default look (otherwise stale per-level
 * images would linger in the SpriteManager cache).
 */
const LEVEL_1_SPRITE_OVERRIDES = Object.freeze({
    star_collectible: 'assets/sprites/objects/star_collectible.png',
    asteroid:         'assets/sprites/objects/asteroid.png',
    enemy_ball:       'assets/sprites/enemies/enemy_ball.png',
});

/**
 * Enemy abilities a level can grant. These map onto `Enemy.abilities` and
 * drive both behaviour (`AIController._maybeFire`, spike-contact damage)
 * and visuals (spike rendering, shooter targeting ring).
 *
 * @readonly
 * @enum {string}
 */
export const EnemyAbility = Object.freeze({
    SPIKED:  'spiked',   // touching the enemy kills the player
    SHOOTER: 'shooter',  // periodically fires bullets that push the player
});

/**
 * @typedef {object} EnemyLevelConfig
 * @property {number}        count           - How many enemies to spawn.
 * @property {string[]}      abilities       - Subset of `EnemyAbility`.
 * @property {string}        color           - Tint colour shared by every enemy
 *                                             on this level (sprite glow + procedural body).
 * @property {string|null}   abilityMessage  - Notification queued right after
 *                                             `entryMessage` to warn the
 *                                             player about new threats. `null`
 *                                             skips the notification.
 * @property {boolean}       [boss]          - When true the level spawns a single
 *                                             `Boss` instead of `count` standard enemies.
 *                                             `count` is ignored.
 */

/** Frozen list of level configurations, in play order. */
export const LEVELS = Object.freeze([
    {
        id:           1,
        name:         'LEVEL 1',
        starsToWin:   50,
        // Onboarding is handled by Game._startNewGame; no transition-into message.
        entryMessage: null,
        background: {
            bgInner:      '#1a0030',
            bgOuter:      '#050008',
            borderColor:  '#4a0060',
            borderShadow: '#9900cc',
        },
        planetPalette:   ['#c8e06e', '#c8e06e', '#e0a06e', '#6ec8e0', '#e06ec8', '#c8e06e'],
        enemies: {
            count:          2,
            abilities:      [],
            color:          '#ffe066',
            abilityMessage: null,
        },
        spriteOverrides: LEVEL_1_SPRITE_OVERRIDES,
    },
    {
        id:           2,
        name:         'LEVEL 2',
        starsToWin:   60,
        entryMessage: 'Good job! Now collect the 60 stars!',
        background: {
            bgInner:      '#3a0e5c',
            bgOuter:      '#180638',
            borderColor:  '#cc44aa',
            borderShadow: '#ff66cc',
        },
        planetPalette:   ['#e066c8', '#a866ff', '#66c8ff', '#ff66e0', '#9966ff', '#e066c8'],
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED],
            color:          '#4fb8ff',
            abilityMessage: 'Heads up! Enemies now have spikes — touching one is fatal.',
        },
        spriteOverrides: _spritesForLevelDir('level2'),
    },
    {
        id:           3,
        name:         'LEVEL 3',
        starsToWin:   70,
        entryMessage: 'Good job! Now collect the 70 stars!',
        background: {
            bgInner:      '#ffb070',
            bgOuter:      '#d44070',
            borderColor:  '#ff4477',
            borderShadow: '#ffcc66',
        },
        planetPalette:   ['#ff66aa', '#ffffff', '#ffe066', '#88ff88', '#ff8866', '#cc66ff'],
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SHOOTER],
            color:          '#ff7a3f',
            abilityMessage: 'Watch out! Enemies can now shoot — bullets push you around.',
        },
        spriteOverrides: _spritesForLevelDir('level3'),
    },
    {
        id:           4,
        name:         'LEVEL 4',
        starsToWin:   80,
        entryMessage: 'Good job! Now collect the 80 stars!',
        background: {
            bgInner:      '#e34d22',
            bgOuter:      '#5c1a08',
            borderColor:  '#b03a18',
            borderShadow: '#ff6633',
        },
        planetPalette:   ['#a8442a', '#7a2818', '#d8884a', '#a8442a', '#c46838', '#7a2818'],
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#ff5577',
            abilityMessage: 'Spiked AND shooting — keep your distance!',
        },
        spriteOverrides: _spritesForLevelDir('level4'),
    },
    {
        id:           5,
        name:         'LEVEL 5',
        starsToWin:   90,
        entryMessage: 'Good job! Now collect the 90 stars!',
        background: {
            bgInner:      '#16215c',
            bgOuter:      '#070a26',
            borderColor:  '#3344aa',
            borderShadow: '#5566ee',
        },
        planetPalette:   ['#4a5cb0', '#222c66', '#7888d0', '#3344aa', '#5566ee', '#222c66'],
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#cc66ff',
            abilityMessage: 'They are even more aggressive — be quick!',
        },
        spriteOverrides: _spritesForLevelDir('level5'),
    },
    {
        id:           6,
        name:         'LEVEL 6',
        starsToWin:   100,
        entryMessage: 'Good job! Now collect the 100 stars!',
        background: {
            bgInner:      '#222222',
            bgOuter:      '#000000',
            borderColor:  '#666666',
            borderShadow: '#aaaaaa',
        },
        planetPalette:   ['#888888', '#aaaaaa', '#666666', '#777777', '#999999', '#555555'],
        enemies: {
            boss:           true,
            count:          1,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#ff2244',
            abilityMessage: 'FINAL BOSS! Spikes, shots, dashes, and deadly rays.',
        },
        spriteOverrides: {
            ..._spritesForLevelDir('level6'),
            // The boss key isn't in LEVEL_SPRITE_KEYS because it is only
            // meaningful on level 6 — declaring it here keeps the
            // SpriteManager from logging spurious 404s on every other level.
            boss: `${LEVEL_SPRITE_ROOT}/level6/boss.png`,
        },
    },
]);
