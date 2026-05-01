/**
 * Per-level configuration data.
 *
 * The game progresses through these entries in order. Each level controls:
 *
 *   - `name`             Display name shown in the HUD (e.g. "LEVEL 2").
 *   - `starsToWin`       Stars the player must collect before the level
 *                        completes and the next one begins. Increases by 10
 *                        each level by design.
 *   - `completionMessage`Notification shown after the player clears the level
 *                        (omitted on the final level — that emits GAME_VICTORY
 *                        instead).
 *   - `background`       Render spec consumed by `Renderer.drawBackground` and
 *                        `Renderer.drawTableBorder`. All hex strings are 6-digit
 *                        so they can be linearly interpolated when transitioning
 *                        between levels.
 *   - `planetPalette`    Six colours assigned in order to the six obstacle
 *                        planets. Lerped during transitions so the planets
 *                        recolour smoothly along with the background.
 *   - `spriteOverrides`  Optional map of sprite-key → asset src. When the level
 *                        becomes active, `LevelManager` calls
 *                        `SpriteManager.swapSprite` for each entry, allowing
 *                        the game to swap stars / asteroids / planet artwork
 *                        per level. Missing files fall back to the previous
 *                        level's sprite (or the procedural drawing) silently.
 *
 * The player NEVER sees a level-up modal — transitions are purely visual.
 * The only on-screen acknowledgement is a `SHOW_NOTIFICATION` event with the
 * `completionMessage` text.
 *
 * ### Adding a new level
 *
 *   1. Append an entry to `LEVELS` below.
 *   2. Drop optional level-specific PNGs under `assets/sprites/levels/levelN/`
 *      and reference them in `spriteOverrides`.
 *   3. No other code change is required — `LevelManager` walks the array.
 */

const LEVEL_SPRITE_ROOT = 'assets/sprites/levels';

/**
 * Build a `spriteOverrides` map for a level. Paths are conventional — drop a
 * matching PNG at `assets/sprites/levels/levelN/<key>.png` and it will load.
 * Keys that are omitted in the returned object inherit the previously active
 * sprite (or the procedural fallback when no asset has ever loaded).
 */
function _spritesFor(levelDir, keys) {
    const overrides = {};
    for (const key of keys) {
        overrides[key] = `${LEVEL_SPRITE_ROOT}/${levelDir}/${key}.png`;
    }
    return overrides;
}

const LEVEL_SPRITE_KEYS = [
    'star_collectible',
    'asteroid',
    'planet_green',
    'planet_orange',
    'planet_blue',
    'planet_pink',
];

/** Frozen list of level configurations, in play order. */
export const LEVELS = Object.freeze([
    {
        id:         1,
        name:       'LEVEL 1',
        starsToWin: 50,
        completionMessage: 'Good job! Now collect the 60 stars!',
        background: {
            bgInner:      '#1a0030',
            bgOuter:      '#050008',
            borderColor:  '#4a0060',
            borderShadow: '#9900cc',
        },
        planetPalette: ['#c8e06e', '#c8e06e', '#e0a06e', '#6ec8e0', '#e06ec8', '#c8e06e'],
        // Level 1 keeps the default sprite manifest — no overrides.
        spriteOverrides: {},
    },
    {
        id:         2,
        name:       'LEVEL 2',
        starsToWin: 60,
        completionMessage: 'Good job! Now collect the 70 stars!',
        background: {
            bgInner:      '#3a0e5c',
            bgOuter:      '#180638',
            borderColor:  '#cc44aa',
            borderShadow: '#ff66cc',
        },
        planetPalette: ['#e066c8', '#a866ff', '#66c8ff', '#ff66e0', '#9966ff', '#e066c8'],
        spriteOverrides: _spritesFor('level2', LEVEL_SPRITE_KEYS),
    },
    {
        id:         3,
        name:       'LEVEL 3',
        starsToWin: 70,
        completionMessage: 'Good job! Now collect the 80 stars!',
        background: {
            bgInner:      '#ffb070',
            bgOuter:      '#d44070',
            borderColor:  '#ff4477',
            borderShadow: '#ffcc66',
        },
        planetPalette: ['#ff66aa', '#ffffff', '#ffe066', '#88ff88', '#ff8866', '#cc66ff'],
        spriteOverrides: _spritesFor('level3', LEVEL_SPRITE_KEYS),
    },
    {
        id:         4,
        name:       'LEVEL 4',
        starsToWin: 80,
        completionMessage: 'Good job! Now collect the 90 stars!',
        background: {
            bgInner:      '#e34d22',
            bgOuter:      '#5c1a08',
            borderColor:  '#b03a18',
            borderShadow: '#ff6633',
        },
        planetPalette: ['#a8442a', '#7a2818', '#d8884a', '#a8442a', '#c46838', '#7a2818'],
        spriteOverrides: _spritesFor('level4', LEVEL_SPRITE_KEYS),
    },
    {
        id:         5,
        name:       'LEVEL 5',
        starsToWin: 90,
        completionMessage: 'Good job! Now collect the 100 stars!',
        background: {
            bgInner:      '#16215c',
            bgOuter:      '#070a26',
            borderColor:  '#3344aa',
            borderShadow: '#5566ee',
        },
        planetPalette: ['#4a5cb0', '#222c66', '#7888d0', '#3344aa', '#5566ee', '#222c66'],
        spriteOverrides: _spritesFor('level5', LEVEL_SPRITE_KEYS),
    },
    {
        id:         6,
        name:       'LEVEL 6',
        starsToWin: 100,
        // Final level — no completionMessage; clearing it emits GAME_VICTORY.
        completionMessage: null,
        background: {
            bgInner:      '#222222',
            bgOuter:      '#000000',
            borderColor:  '#666666',
            borderShadow: '#aaaaaa',
        },
        planetPalette: ['#888888', '#aaaaaa', '#666666', '#777777', '#999999', '#555555'],
        spriteOverrides: _spritesFor('level6', LEVEL_SPRITE_KEYS),
    },
]);
