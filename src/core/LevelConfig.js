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
 *                       recolour smoothly along with the background. Doubles
 *                       as the sprite TINT colour when the planet has a
 *                       sprite assigned — black/white planet art automatically
 *                       picks up the level palette.
 *   - `planetSprites`   Six sprite keys (matching entries in
 *                       `assets/sprites/sprites.json`), one per planet slot.
 *                       Each Planet draws its sprite tinted with the matching
 *                       `planetPalette` colour, so a single black/white sprite
 *                       can be reused as multiple coloured planets. Defaults
 *                       to `DEFAULT_PLANET_SPRITES` when omitted.
 *   - `enemies`         Enemy roster for the level. See `EnemyLevelConfig`
 *                       below; controls count, abilities, sprite tint, and
 *                       the optional ability notification queued right after
 *                       `entryMessage`.
 *   - `hazards`         Environmental hazard activation. Each flag toggles
 *                       a hazard manager on for the level. Hazards are
 *                       declared cumulatively by convention — once a level
 *                       introduces a hazard, every subsequent level keeps
 *                       it on so difficulty escalates. See `HazardConfig`
 *                       below.
 *   - `hazardMessages`  Optional notification text used when a NEW hazard
 *                       is introduced on a level. Drives the slide-in
 *                       transmission panel right after `abilityMessage`.
 *   - `spriteOverrides` Map of sprite-key → asset src. When the level becomes
 *                       active, `LevelManager` calls `SpriteManager.swapSprite`
 *                       for each entry, cross-fading the old image into the new
 *                       one in lock-step with the gradient transition. Missing
 *                       files keep the previous level's sprite (or the
 *                       procedural fallback when no asset has ever loaded).
 *                       Every level — including L1 — declares its own paths so
 *                       replays restore the default look correctly. Planet
 *                       sprite keys (`planet_green`, `planet_orange`,
 *                       `planet_blue`, `planet_pink`) participate in the same
 *                       mechanism: drop a PNG at
 *                       `assets/sprites/levels/levelN/<key>.png` and add it
 *                       here to swap the artwork for that level.
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
 * whose `render()` consults `SpriteManager` (Star, Asteroid, Enemy, Planet).
 * Drop a matching PNG at `assets/sprites/levels/levelN/<key>.png` to
 * customise the look for that level.
 *
 * The four planet keys are listed alongside the gameplay-entity keys so the
 * conventional per-level directory pattern works for them too: drop e.g.
 * `assets/sprites/levels/level3/planet_green.png` and L3's green planets
 * will pick up the new artwork during the cross-fade.
 */
const LEVEL_SPRITE_KEYS = Object.freeze([
    'star_collectible',
    'asteroid',
    'enemy_ball',
    'planet_green',
    'planet_orange',
    'planet_blue',
    'planet_pink',
]);

/**
 * Default sprite key assignment for the six planet slots, in render order.
 * Levels that don't declare their own `planetSprites` use this layout.
 *
 * The naming is historical (the colour suffixes describe the *original*
 * untinted artwork) — every entry can be tinted with any palette colour
 * via `planetPalette`, so "planet_green" doesn't have to look green.
 */
const DEFAULT_PLANET_SPRITES = Object.freeze([
    'planet_green',
    'planet_green',
    'planet_orange',
    'planet_blue',
    'planet_pink',
    'planet_green',
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
    planet_green:     'assets/sprites/objects/planet_green.png',
    planet_orange:    'assets/sprites/objects/planet_orange.png',
    planet_blue:      'assets/sprites/objects/planet_blue.png',
    planet_pink:      'assets/sprites/objects/planet_pink.png',
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

/**
 * @typedef {object} HazardConfig
 * @property {boolean} [asteroids]        Asteroid manager runs on this level.
 * @property {boolean} [blackHoles]       Black-hole manager runs on this level.
 * @property {boolean} [cakes]            Cake manager runs on this level.
 * @property {boolean} [bombs]            Bomb manager runs on this level.
 * @property {boolean} [levelSingularity] Spawn the permanent map-wide
 *   {@link ArenaSingularity} at the canvas centre. Exclusive to Level 5 —
 *   the singularity is created on level entry and destroyed on exit. The boss
 *   is immune to its effects by the same rule that applies to transient black
 *   holes and asteroids.
 *
 * Game.js applies these flags via each manager's `setEnabled`, which
 * spawns instances when on and clears them when off.
 */

/**
 * @typedef {object} HazardMessages
 * @property {string} [blackHoles]  Shown when black holes are first introduced.
 * @property {string} [cakes]       Shown when cakes are first introduced.
 * @property {string} [bombs]       Shown when bombs are first introduced.
 */

/**
 * Default planet-slot sprite assignment used when a level omits
 * `planetSprites`. Re-exported so callers (and tests) can reference the
 * canonical mapping without copy-pasting strings.
 */
export const DEFAULT_PLANET_SPRITE_KEYS = DEFAULT_PLANET_SPRITES;

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
        // Each planet uses the manifest sprite that historically matched its
        // palette colour. Designers are free to swap these for any other key
        // declared in `assets/sprites/sprites.json` — the tint comes from
        // `planetPalette`, so the look reskins automatically.
        planetSprites:   ['planet_green', 'planet_green', 'planet_orange', 'planet_blue', 'planet_pink', 'planet_green'],
        enemies: {
            count:          2,
            abilities:      [],
            color:          '#ffe066',
            abilityMessage: null,
        },
        hazards: {
            asteroids:  true,
            blackHoles: false,
            cakes:      false,
            bombs:      false,
        },
        hazardMessages: {},
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
        planetSprites:   DEFAULT_PLANET_SPRITES,
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED],
            color:          '#4fb8ff',
            abilityMessage: 'Heads up! Enemies now have spikes — touching one is fatal.',
        },
        hazards: {
            asteroids:  true,
            blackHoles: true,
            cakes:      false,
            bombs:      false,
        },
        hazardMessages: {
            blackHoles: 'New hazard: black holes! Stay clear — the centre is fatal.',
        },
        spriteOverrides: _spritesForLevelDir('level2'),
    },
    {
        id:           3,
        name:         'LEVEL 3',
        starsToWin:   70,
        entryMessage: 'Good job! Now collect the 70 stars!',
        background: {
            bgInner:      '#005e06',
            bgOuter:      '#2eab4c',
            borderColor:  '#ff4477',
            borderShadow: '#ffcc66',
        },
        planetPalette:   ['#ff66aa', '#ffffff', '#ffe066', '#88ff88', '#ff8866', '#cc66ff'],
        planetSprites:   DEFAULT_PLANET_SPRITES,
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SHOOTER],
            color:          '#ff7a3f',
            abilityMessage: 'Watch out! Enemies can now shoot — bullets push you around.',
        },
        hazards: {
            asteroids:  true,
            blackHoles: true,
            cakes:      true,
            bombs:      false,
        },
        hazardMessages: {
            cakes: 'Cakes look tasty… but eating one slows you down for 4 seconds!',
        },
        spriteOverrides: _spritesForLevelDir('level3'),
    },
    {
        id:           4,
        name:         'LEVEL 4',
        starsToWin:   80,
        entryMessage: 'Good job! Now collect the 80 stars!',
        background: {
            bgInner:      '#a64023',
            bgOuter:      '#5c1a08',
            borderColor:  '#b03a18',
            borderShadow: '#ff6633',
        },
        planetPalette:   ['#a8442a', '#7a2818', '#d8884a', '#a8442a', '#c46838', '#7a2818'],
        planetSprites:   DEFAULT_PLANET_SPRITES,
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#ff5577',
            abilityMessage: 'Spiked AND shooting — keep your distance!',
        },
        hazards: {
            asteroids:  true,
            blackHoles: true,
            cakes:      true,
            bombs:      true,
        },
        hazardMessages: {
            bombs: 'Bombs! They detonate when anything gets too close — mind the blast!',
        },
        spriteOverrides: _spritesForLevelDir('level4'),
    },
    {
        id:           5,
        name:         'LEVEL 5',
        starsToWin:   50,
        entryMessage: 'Good job! Now collect the 50 stars!',
        background: {
            bgInner:      '#16215c',
            bgOuter:      '#070a26',
            borderColor:  '#3344aa',
            borderShadow: '#5566ee',
        },
        planetPalette:   ['#4a5cb0', '#222c66', '#7888d0', '#3344aa', '#5566ee', '#222c66'],
        planetSprites:   DEFAULT_PLANET_SPRITES,
        enemies: {
            count:          2,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#cc66ff',
            abilityMessage: 'They are even more aggressive — be quick!',
        },
        hazards: {
            asteroids:        true,
            blackHoles:       true,
            cakes:            true,
            bombs:            true,
            // Level 5 exclusive: a permanent map-wide gravity well at the
            // arena centre. Pulls every movable object inward continuously,
            // adding sustained positional pressure on top of all other hazards.
            levelSingularity: true,
        },
        hazardMessages: {
            levelSingularity: 'A singularity has formed at the centre — everything is being pulled in!',
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
        planetSprites:   DEFAULT_PLANET_SPRITES,
        enemies: {
            boss:           true,
            count:          1,
            abilities:      [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            color:          '#fbfbfb',
            abilityMessage: 'FINAL BOSS! Spikes, shots, dashes, and deadly rays.',
        },
        hazards: {
            asteroids:  true,
            blackHoles: true,
            cakes:      true,
            bombs:      true,
        },
        hazardMessages: {},
        spriteOverrides: {
            ..._spritesForLevelDir('level6'),
            // The boss key isn't in LEVEL_SPRITE_KEYS because it is only
            // meaningful on level 6 — declaring it here keeps the
            // SpriteManager from logging spurious 404s on every other level.
            boss: `${LEVEL_SPRITE_ROOT}/level6/boss.png`,
        },
    },
]);
