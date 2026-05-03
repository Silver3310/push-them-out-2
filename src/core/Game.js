import { GameConfig }  from './GameConfig.js';
import { GameState }   from './GameState.js';
import { LevelManager } from './LevelManager.js';
import { DEFAULT_PLANET_SPRITE_KEYS as DEFAULT_PLANET_SPRITES } from './LevelConfig.js';
import { eventBus }    from '../events/EventBus.js';
import { GameEvents }  from '../events/GameEvents.js';
import { InputHandler } from '../events/InputHandler.js';
import { Renderer }    from '../rendering/Renderer.js';
import { Camera }      from '../rendering/Camera.js';
import { SpriteManager } from '../rendering/SpriteManager.js';
import { AudioManager } from '../audio/AudioManager.js';
import { Physics }     from '../logic/Physics.js';
import { ScoreManager } from '../logic/ScoreManager.js';
import { Player }      from '../entities/players/Player.js';
import { PlayerController } from '../entities/players/PlayerController.js';
import { Enemy }       from '../entities/enemies/Enemy.js';
import { Boss }        from '../entities/enemies/Boss.js';
import { AIController } from '../entities/enemies/AIController.js';
import { BossController } from '../entities/enemies/BossController.js';
import { Hole }        from '../entities/objects/Hole.js';
import { Planet }      from '../entities/objects/Planet.js';
import { Star }            from '../entities/objects/Star.js';
import { ArenaSingularity }     from '../entities/objects/ArenaSingularity.js';
import { AsteroidManager }      from '../logic/AsteroidManager.js';
import { BlackHoleManager }     from '../logic/BlackHoleManager.js';
import { CakeManager }          from '../logic/CakeManager.js';
import { BombManager }          from '../logic/BombManager.js';
import { WarningManager }       from '../logic/WarningManager.js';
import { Menu }                 from '../ui/Menu.js';
import { IntroScreen }          from '../ui/IntroScreen.js';
import { OutroScreen }          from '../ui/OutroScreen.js';
import { NotificationManager }  from '../ui/NotificationManager.js';

const PLAYER_COLORS = ['#00ccff', '#ff44cc', '#44ff88', '#ffcc00'];

// Standard-enemy spawn slots used by `_createEnemies` for non-boss levels.
// Indexed by enemy index modulo array length, so 1-2 enemies always land in
// opposite corners and additional enemies cycle through the remaining slots.
const ENEMY_SPAWN_SLOTS = Object.freeze([
    { x: 160,  y: 160  },
    { x: -160, y: -160 }, // negative coords are interpreted as offsets from W/H
    { x: 160,  y: -160 },
    { x: -160, y: 160  },
]);

// Minimum squared distance from a hole centre when spawning a star
const STAR_SPAWN_HOLE_BUFFER_SQ   = 90 ** 2;
// Minimum squared distance from a planet centre when spawning a star
const STAR_SPAWN_PLANET_BUFFER_SQ = 72 ** 2;
// Wall inset so stars don't appear on the border
const STAR_SPAWN_WALL_INSET = 80;

class Game {
    constructor() {
        this.canvas   = document.getElementById('game-canvas');
        this.renderer = new Renderer(this.canvas);
        this.input    = new InputHandler(this.canvas);
        this.camera   = new Camera(GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
        this.sprites  = new SpriteManager();
        this.audio    = new AudioManager();
        this.physics  = new Physics(GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT);
        // LevelManager is created after sprites load (init()) so it can drive
        // sprite swaps; ScoreManager depends on it for the per-level goal.
        this.levels   = null;
        this.score    = null;

        this.state   = GameState.LOADING;
        this.players = [];
        this.enemies = [];
        this.holes   = [];
        this.planets = [];
        this.bullets = [];
        this.stars   = [];

        // Convenience reference to the active boss (if any). Re-set every
        // time the enemy roster is rebuilt; null on non-boss levels.
        this._boss = null;

        // Hazard managers – initialised after sprites are loaded so each manager
        // can forward the SpriteManager reference to its entity instances.
        // Per-level activation is driven by `LEVELS[i].hazards` (see LevelConfig).
        this._asteroidManager  = null;
        this._blackHoleManager = null;
        this._cakeManager      = null;
        this._bombManager      = null;

        // Centralised "spawn telegraph" service. Hazardous spawns flow through
        // this manager so the player always sees a yellow warning circle
        // before a black hole / bomb / boss / spiked enemy materialises in
        // their face. See WarningManager for the contract.
        this._warningManager   = new WarningManager();

        // Level 5 permanent gravity well. Created/destroyed alongside the level.
        this._arenaSingularity = null;

        // Per-game countdown timer (seconds). Expires → GAME_OVER.
        // Counts down only while state === PLAYING (pausing freezes it).
        this._gameTimer = GameConfig.GAME_TIMER_DURATION;

        this.menu           = null;
        this._intro         = null;
        this._outro         = null;
        this._notifications = null;
        this._playerController = null;
        this._aiControllers    = [];
        this._lastTime    = 0;
        this._accumulator = 0;
    }

    async init() {
        // Load assets in parallel; both are graceful on missing files
        await Promise.all([
            this.sprites.loadManifest('assets/sprites/sprites.json'),
            this.audio.loadManifest('assets/sounds/sounds.json'),
        ]);

        this.audio.bindEvents();
        this.levels         = new LevelManager(this.sprites);
        this.score          = new ScoreManager(this.levels);
        this.menu           = new Menu(this.canvas, this.input);
        this._intro         = new IntroScreen(this.canvas, this.input, this.sprites);
        this._outro         = new OutroScreen(this.canvas, this.input, this.sprites);
        this._notifications = new NotificationManager(document.getElementById('ui-overlay'));
        this._setupEventListeners();

        // Queue the menu soundtrack — AudioManager defers playback until the
        // browser's first-gesture audio unlock, so this is safe pre-click.
        this.audio.playMenuMusic();

        this.state = GameState.MENU;
        requestAnimationFrame(ts => this._loop(ts));
    }

    _startNewGame() {
        this.menu.deactivate();
        // Show the intro splash before the first level. Audio transitions to
        // intro music; level 1 music starts when INTRO_DISMISSED fires.
        this._intro.activate();
        this.audio.playIntroMusic();
        this.state = GameState.INTRO;
    }

    /**
     * Transition from the intro screen (or a restart) into active gameplay.
     * Builds the level, seeds initial state, and emits tutorial notifications.
     */
    _startPlaying() {
        this._intro.deactivate();
        this.levels.reset();
        this.score.reset();
        this._buildLevel();
        // Seed the player controller with the current button state so the
        // click that dismissed the intro doesn't trigger an immediate shot.
        this._playerController.syncInputState();
        this.state = GameState.PLAYING;

        // Level-start tutorial notifications shown sequentially
        this._notifications.reset();
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Welcome to the game! We hope you enjoy it 😎' });
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: `You control the pink ball, your goal is to collect ${this.levels.current.starsToWin} stars` });
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Beware other balls, asteroids, everything! O_O' });
    }

    _setupEventListeners() {
        eventBus.on(GameEvents.MENU_START_GAME, () => this._startNewGame());

        // Intro dismissed → begin actual gameplay (builds level, starts music)
        eventBus.on(GameEvents.INTRO_DISMISSED, () => this._startPlaying());

        // Outro dismissed → return to main menu
        eventBus.on(GameEvents.OUTRO_DISMISSED, () => {
            this._outro.deactivate();
            this.audio.playMenuMusic();
            this.state = GameState.MENU;
        });

        eventBus.on(GameEvents.BALL_FELL_IN_HOLE, ({ ball }) => {
            if (ball.hasTag('player')) {
                ball.die();
                this.score.recordPlayerDeath();
                setTimeout(() => { if (!ball.active) return; ball.respawn(); }, 2000);
            } else if (ball.hasTag('enemy')) {
                // Bosses don't fall into holes — they're too massive to be
                // captured by the existing pull radius — but if a future
                // level config ever made one tag-as-enemy + boss, we still
                // wouldn't want to count it as a kill / respawn it.
                if (ball.hasTag('boss')) return;
                ball.die();
                this.score.recordEnemyKill();
                setTimeout(() => { if (!ball.active) return; ball.respawn(); }, 3000);
            } else if (ball.hasTag('star')) {
                // Star is permanently removed; _maintainStarCount will spawn a replacement
                ball.destroy();
                this.score.recordStarLost();
            }
        });

        eventBus.on(GameEvents.GAME_VICTORY, () => {
            // Show the outro screen with the final session stats. AudioManager
            // no longer handles this event for music; we crossfade here.
            this._outro.show(this.score.getSnapshot());
            this.audio.playOutroMusic();
            this.state = GameState.OUTRO;
        });

        // Per-level transition. The visual cross-fade is handled by
        // LevelManager (started here via advance()); the player sees up to
        // a small queue of notifications: the goal announcement, the
        // optional enemy-ability warning, and one notification per
        // newly-introduced hazard.
        eventBus.on(GameEvents.LEVEL_COMPLETE, ({ from, to }) => {
            this.levels.advance();
            this.score.startNewLevel();
            if (to?.entryMessage) {
                eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: to.entryMessage });
            }
            if (to?.enemies?.abilityMessage) {
                eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: to.enemies.abilityMessage });
            }
            this._announceNewHazards(from, to);
        });

        // Enemy roster swap and hazard re-arming are timed to the visual
        // midpoint of the cross-fade so the new threats appear in lock-step
        // with the new gradient and sprite set.
        eventBus.on(GameEvents.LEVEL_TRANSITION_MID, ({ level }) => {
            this._rebuildEnemies(level);
            this._applyHazardFlags(level);
            // Hole accent rings update in sync with the background cross-fade
            // so the correct highlight colour is always showing.
            this._updateHoleStyles(level);
            // Note: new-hazard notifications (including the singularity) are
            // announced by _announceNewHazards() on LEVEL_COMPLETE — no need
            // to repeat them here.
        });

        // ESC: in menu sub-screens go back; otherwise toggle pause / restart
        window.addEventListener('keydown', e => {
            if (e.code === 'Escape') {
                if (this.state === GameState.MENU) {
                    this.menu.handleEscape();
                } else if (this.state === GameState.PLAYING) {
                    this.state = GameState.PAUSED;
                    eventBus.emit(GameEvents.GAME_PAUSE);
                } else if (this.state === GameState.PAUSED) {
                    this.state = GameState.PLAYING;
                    eventBus.emit(GameEvents.GAME_RESUME);
                } else if (this.state === GameState.GAME_OVER) {
                    // ESC from game over restarts the game (skips the intro).
                    this._startPlaying();
                } else if (this.state === GameState.OUTRO) {
                    // ESC from the outro returns to the main menu.
                    eventBus.emit(GameEvents.OUTRO_DISMISSED);
                }
            } else if (e.code === 'Enter' && this.state === GameState.GAME_OVER) {
                this._startPlaying();
            }
        });
    }

    _buildLevel() {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        // Fresh 10-minute countdown for every new game run.
        this._gameTimer = GameConfig.GAME_TIMER_DURATION;

        // Six-pocket pool table layout
        this.holes = [
            new Hole(55,     55    ),
            new Hole(W / 2,  35    ),
            new Hole(W - 55, 55    ),
            new Hole(55,     H - 55),
            new Hole(W / 2,  H - 35),
            new Hole(W - 55, H - 55),
        ];
        // Apply accent rings immediately so level 1 holes look correct from frame 1.
        this._updateHoleStyles(this.levels.current);

        // Planet obstacles as bumpers. Colours come from the active level's
        // palette and are recoloured each frame during level transitions
        // (see _applyLevelPalette). The sprite-key array picks which entry
        // from `assets/sprites/sprites.json` each planet should render —
        // the colour from the palette is then used as the multiply tint, so
        // a single black/white sprite reskins per palette automatically.
        const level    = this.levels.current;
        const palette  = level.planetPalette;
        const skins    = level.planetSprites ?? DEFAULT_PLANET_SPRITES;
        const PLANET_DEFS = [
            { x: 320,     y: 240,     r: 55 },
            { x: 960,     y: 480,     r: 55 },
            { x: W / 2,   y: 190,     r: 40 },
            { x: W / 2,   y: H - 190, r: 40 },
            { x: 190,     y: H / 2,   r: 45 },
            { x: W - 190, y: H / 2,   r: 45 },
        ];
        this.planets = PLANET_DEFS.map((d, i) =>
            new Planet(d.x, d.y, d.r, palette[i], skins[i] ?? skins[0], this.sprites),
        );

        // Human player (centre)
        const player = new Player(W / 2, H / 2, PLAYER_COLORS[1], 'Sweet Bulldog');
        this.players = [player];
        this._playerController = new PlayerController(player, this.input, this);

        // Build the enemy roster declared by the active level.
        this._rebuildEnemies(this.levels.current, { skipWarnings: true });

        // Seed the board with the initial star population
        this.stars = [];
        for (let i = 0; i < GameConfig.STAR_COUNT; i++) {
            this._spawnStar();
        }

        // Hazard managers – reset (or create) so a fresh cycle begins each game.
        // BlackHole/Cake/Bomb managers receive a `getObstacles` closure so their
        // safe-spawn checks can avoid the existing planets and pocket holes
        // without each manager needing a hard reference to Game state.
        const obstacleProvider = () => [...this.holes, ...this.planets];
        const warnings         = this._warningManager;

        // Drop any warnings carried over from a prior run before any manager
        // queues new ones during this build.
        warnings.reset();

        if (this._asteroidManager)  this._asteroidManager.reset();
        else this._asteroidManager  = new AsteroidManager(this.sprites);

        if (this._blackHoleManager) this._blackHoleManager.reset();
        else this._blackHoleManager = new BlackHoleManager(this.sprites, { getObstacles: obstacleProvider, warnings });

        if (this._cakeManager)      this._cakeManager.reset();
        else this._cakeManager      = new CakeManager(this.sprites, { getObstacles: obstacleProvider });

        if (this._bombManager)      this._bombManager.reset();
        else this._bombManager      = new BombManager(this.sprites, { getObstacles: obstacleProvider, warnings });

        // Apply the starting level's hazard flags so managers are correctly
        // armed/silent before the first frame.
        this._applyHazardFlags(this.levels.current);
    }

    /**
     * Toggle each hazard manager on/off according to `level.hazards`.
     * Called on initial build and from the LEVEL_TRANSITION_MID listener
     * so the new hazard set arms in lock-step with the visual cross-fade.
     */
    _applyHazardFlags(level) {
        const h = level?.hazards ?? {};
        // Asteroids ran on every level historically; respect the explicit
        // flag if set, otherwise default to true to preserve that behaviour.
        const asteroidsOn = h.asteroids !== false;
        if (this._asteroidManager) {
            // AsteroidManager pre-dates the enable/disable API. It always
            // runs today, so we just leave it alone when on; if a future
            // level wants to silence it, calling reset() is the cleanest
            // way to clear the field.
            if (!asteroidsOn) this._asteroidManager.reset();
        }
        this._blackHoleManager?.setEnabled(!!h.blackHoles);
        this._cakeManager?.setEnabled(!!h.cakes);
        this._bombManager?.setEnabled(!!h.bombs);
        this._applyArenaSingularityFlag(!!h.levelSingularity);
    }

    /**
     * Set or clear the accent ring on every pool-pocket hole based on the
     * active level. Levels 1, 5, and 6 use dark backgrounds where black holes
     * are nearly invisible without a coloured highlight ring.
     *
     * Called from `_buildLevel` (initial game start) and from the
     * `LEVEL_TRANSITION_MID` listener (level changes) so the ring colour
     * always matches the current level — even mid-run.
     */
    _updateHoleStyles(level) {
        // Maps level id → accent colour chosen to contrast against that
        // level's background without clashing with the border palette.
        const ACCENT = {
            1: '#cc55ff', // bright violet on the dark-purple L1 background
            5: '#6699ff', // bright blue  on the deep-blue   L5 background
            6: '#dddddd', // light silver on the black/grey   L6 background
        };
        const accent = ACCENT[level?.id] ?? null;
        for (const hole of this.holes) {
            hole.accentColor = accent;
        }
    }

    /**
     * Create or destroy the {@link ArenaSingularity} to match the `enabled`
     * flag coming from the active level's `hazards.levelSingularity` entry.
     * A new instance is only created when none exists — re-entering level 5
     * after a restart goes through `_buildLevel` which already calls
     * `_applyHazardFlags`, so double-creation is not possible in practice.
     */
    _applyArenaSingularityFlag(enabled) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        if (enabled && !this._arenaSingularity) {
            this._arenaSingularity = new ArenaSingularity(W / 2, H / 2);
        } else if (!enabled && this._arenaSingularity) {
            this._arenaSingularity = null;
        }
    }

    /**
     * Replace `this.enemies` and `this._aiControllers` with fresh instances
     * appropriate for `level`. Called on initial build and at the midpoint
     * of every level transition so the visual cross-fade lands in sync with
     * the new gameplay difficulty.
     *
     * Each prospective spawn is gated by a {@link WarningManager} telegraph:
     * the old enemies are destroyed immediately (so they don't keep shooting
     * during the level handover) and the new ones materialise only when
     * their yellow warning circle expires. While the warnings are in flight,
     * `this.enemies` is empty and the playfield is briefly enemy-free —
     * intentional, it gives the player a clean breath between levels and
     * eliminates the "boss spawns on top of you" failure mode.
     *
     * Bullets are cleared at the same time so a shot fired by an enemy from
     * the previous level doesn't hit a player on the new one.
     */
    _rebuildEnemies(level, options = {}) {
        for (const e of this.enemies) e.destroy();
        this.bullets        = [];
        this.enemies        = [];
        this._boss          = null;
        this._aiControllers = [];

        for (const factory of this._enemySpawnPlan(level)) {
            if (options.skipWarnings) {
                // Skip warnings and spawn immediately
                this._spawnPlannedEnemy(factory);
            } else {
                this._warningManager.schedule({
                    x:      factory.x,
                    y:      factory.y,
                    radius: factory.radius,
                    kind:   factory.kind,
                    onFire: () => this._spawnPlannedEnemy(factory),
                });
            }
        }
    }

    /**
     * Compute every enemy that needs to materialise for `level`, returning a
     * list of "spawn factories". Each entry carries the spawn position, the
     * radius the warning ring should match, a `kind` tag for telemetry, and
     * a closure that constructs the actual entity. {@link _spawnPlannedEnemy}
     * is what eventually invokes those closures once the warning fires.
     *
     * @returns {{
     *   x: number, y: number, radius: number, kind: string,
     *   build: () => import('../entities/enemies/Enemy.js').Enemy,
     * }[]}
     */
    _enemySpawnPlan(level) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        const cfg = level.enemies;

        if (cfg.boss) {
            const radius = GameConfig.PLAYER_RADIUS * GameConfig.BOSS_RADIUS_MULT;
            return [{
                x: W * 0.78, y: H / 2, radius, kind: 'boss',
                build: () => new Boss(W * 0.78, H / 2, cfg.color, 'BOSS', this.sprites),
            }];
        }

        const plan = [];
        for (let i = 0; i < cfg.count; i++) {
            const slot = ENEMY_SPAWN_SLOTS[i % ENEMY_SPAWN_SLOTS.length];
            const x    = slot.x < 0 ? W + slot.x : slot.x;
            const y    = slot.y < 0 ? H + slot.y : slot.y;
            // Spiked enemies get the more attention-grabbing 'spikedEnemy'
            // kind so listeners (audio cues, telemetry) can branch on it.
            const kind = cfg.abilities?.includes('spiked') ? 'spikedEnemy' : 'enemy';
            plan.push({
                x, y, radius: GameConfig.ENEMY_RADIUS, kind,
                build: () => new Enemy(x, y, cfg.color, 'AI', this.sprites, {
                    abilities: cfg.abilities,
                }),
            });
        }
        return plan;
    }

    /**
     * Materialise a single planned enemy and wire its AI controller. Called
     * exactly once per enemy when its warning circle expires. Skipped silently
     * if the level has already advanced past the one this enemy was planned
     * for (e.g. the player blitzed through a level while warnings were still
     * in flight) — we detect that by stamping each factory with the level
     * index and comparing here.
     */
    _spawnPlannedEnemy(factory) {
        const enemy = factory.build();
        this.enemies.push(enemy);
        if (enemy.hasTag('boss')) this._boss = enemy;

        const worldRef = { holes: this.holes, players: this.players };
        const ai = enemy.hasTag('boss')
            ? new BossController(enemy, worldRef, this)
            : new AIController(enemy, worldRef, this);
        this._aiControllers.push(ai);
    }

    addBullet(bullet) {
        this.bullets.push(bullet);
    }

    /**
     * Queue a SHOW_NOTIFICATION for every hazard newly enabled on `to`
     * (i.e. flipped from off in `from`). Uses `to.hazardMessages[key]`
     * for the message text; missing entries skip silently.
     */
    _announceNewHazards(from, to) {
        const fromH = from?.hazards ?? {};
        const toH   = to?.hazards   ?? {};
        const messages = to?.hazardMessages ?? {};
        for (const key of Object.keys(toH)) {
            if (toH[key] && !fromH[key] && messages[key]) {
                eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: messages[key] });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Star lifecycle helpers
    // -------------------------------------------------------------------------

    /**
     * Spawn a single new star at a safe random position (away from holes,
     * planets, and walls) and add it to the stars array.
     */
    _spawnStar() {
        const W      = GameConfig.CANVAS_WIDTH;
        const H      = GameConfig.CANVAS_HEIGHT;
        const inset  = STAR_SPAWN_WALL_INSET;
        const maxTry = 60;
        let x, y, safe;
        let attempts = 0;

        do {
            safe = true;
            x    = inset + Math.random() * (W - inset * 2);
            y    = inset + Math.random() * (H - inset * 2);

            for (const hole of this.holes) {
                const dx = x - hole.x;
                const dy = y - hole.y;
                if (dx * dx + dy * dy < STAR_SPAWN_HOLE_BUFFER_SQ) { safe = false; break; }
            }

            if (safe) {
                for (const planet of this.planets) {
                    const dx  = x - planet.x;
                    const dy  = y - planet.y;
                    const lim = STAR_SPAWN_PLANET_BUFFER_SQ + planet.radius * planet.radius;
                    if (dx * dx + dy * dy < lim) { safe = false; break; }
                }
            }

            attempts++;
        } while (!safe && attempts < maxTry);

        // Pass the SpriteManager so the star can render a custom PNG if
        // "star_collectible" is present in assets/sprites/sprites.json.
        const star = new Star(x, y, this.sprites);
        this.stars.push(star);
        return star;
    }

    /**
     * Remove inactive / in-hole stars from the array and replenish up to
     * STAR_COUNT so there are always stars on the board to chase.
     * Called every physics step — it is O(n) and very cheap.
     */
    _maintainStarCount() {
        this.stars = this.stars.filter(s => s.active && !s.isInHole);

        const needed = GameConfig.STAR_COUNT - this.stars.length;
        for (let i = 0; i < needed; i++) {
            this._spawnStar();
        }
    }

    /**
     * Check whether the player overlaps any star and collect those stars.
     * Called after balls have moved but before physics resolves separations,
     * so positions naturally reflect real contact.
     */
    _collectStars() {
        const player = this.players[0];
        if (!player || !player.active || player.isInHole) return;

        const collectDist = player.radius + GameConfig.STAR_RADIUS;

        for (const star of this.stars) {
            if (!star.active || star.isInHole) continue;
            const dx = player.x - star.x;
            const dy = player.y - star.y;
            if (dx * dx + dy * dy < collectDist * collectDist) {
                star.destroy();
                this.score.recordStarCollected();
            }
        }
    }

    // -------------------------------------------------------------------------
    // Game loop – fixed-timestep physics, variable render
    // -------------------------------------------------------------------------

    _loop(timestamp) {
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.1);
        this._lastTime = timestamp;

        if (this.state === GameState.MENU) {
            this.menu.update(dt);
        } else if (this.state === GameState.INTRO) {
            this._intro.update(dt);
        } else if (this.state === GameState.OUTRO) {
            this._outro.update(dt);
        } else if (this.state === GameState.PLAYING) {
            this._accumulator += dt;
            const step  = GameConfig.FIXED_TIMESTEP;
            let   steps = 0;
            while (this._accumulator >= step && steps < GameConfig.MAX_FRAME_SKIP) {
                this._update(step);
                this._accumulator -= step;
                steps++;
            }
        }

        this._render();
        requestAnimationFrame(ts => this._loop(ts));
    }

    _update(dt) {
        // Countdown the per-game timer. Only runs while PLAYING; pausing
        // freezes it because _update is not called in the PAUSED state.
        this._gameTimer -= dt;
        if (this._gameTimer <= 0) {
            this._gameTimer = 0;
            this.state = GameState.GAME_OVER;
            eventBus.emit(GameEvents.GAME_OVER);
            return; // Skip the rest of the update — game is over.
        }

        // Advance the level cross-fade timer and apply the interpolated
        // planet palette to the live obstacle entities. This runs every
        // physics step but is a cheap colour assignment when not transitioning.
        this.levels.update(dt);
        this._applyLevelPalette();

        this._playerController.update(dt);
        this._aiControllers.forEach(ai => ai.update(dt));

        // Replenish any stars that were collected or fell into holes
        this._maintainStarCount();

        // Stars are full physics participants: pushed by enemies, pulled by holes
        const allBalls = [...this.players, ...this.enemies, ...this.stars];
        allBalls.forEach(b => b.update(dt));

        // Collect stars before physics separates the player from them
        this._collectStars();

        // Spike contact must be checked BEFORE physics separates the player
        // from the spiked enemy — otherwise we'd never see the overlap.
        this._handleSpikedEnemyContacts();

        this.physics.update(allBalls, this.planets, this.holes);

        // Update bullets and handle collisions
        this._updateBullets(dt);

        // Boss-specific damage: anything in the firing ray dies.
        this._handleBossRayKills();

        // Advance environmental hazards and resolve their interactions.
        // Order matters: black holes apply force BEFORE asteroids/bombs so
        // a captured ball that's on its way to the kill core also still
        // takes any other hazard contact this frame; bombs run after pulls
        // so a "pulled then blasted" combination resolves naturally.
        this._updateBlackHoles(dt);
        this._updateArenaSingularity(dt);
        this._updateAsteroids(dt);
        this._updateCakes(dt);
        this._updateBombs(dt);

        // Tick the spawn-warning telegraphs AFTER the hazard managers above —
        // a warning whose timer just expired needs to invoke its onFire to
        // create the actual hazard, and we want that fresh hazard to also
        // be live for the rest of this update loop's downstream listeners.
        this._warningManager.update(dt);

        // Keep audio listener at player position for spatial sound
        const p = this.players[0];
        if (p && !p.isInHole) this.audio.setListenerPosition(p.x, p.y);
    }

    /**
     * Kill the player on direct contact with any spiked enemy. Runs once
     * per physics step before `Physics.update` separates overlapping balls,
     * so a fresh frame-zero overlap is always caught.
     */
    _handleSpikedEnemyContacts() {
        const player = this.players[0];
        if (!player || !player.active || player.isInHole || player.isInvulnerable) return;

        for (const enemy of this.enemies) {
            if (!enemy.active || enemy.isInHole) continue;
            if (!enemy.hasTag('spiked')) continue;

            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const minDist = player.radius + enemy.radius;
            if (dx * dx + dy * dy >= minDist * minDist) continue;

            this._killPlayer(player);
            return;
        }
    }

    /**
     * Drive damage from the boss's lethal ray. No-op when there is no boss
     * or the ray isn't currently in its firing phase.
     */
    _handleBossRayKills() {
        if (!this._boss) return;
        if (!this._boss.isRayLethal) return;
        const player = this.players[0];
        if (!player || !player.active || player.isInHole || player.isInvulnerable) return;
        if (!this._boss.rayHits(player)) return;
        this._killPlayer(player);
    }

    /**
     * Common kill path for non-hole player deaths (spikes, rays, asteroids).
     * Mirrors the in-hole flow by parking the entity with `isInHole = true`,
     * which gates rendering, physics, and ability checks so the player
     * cannot be re-killed during the 2-second respawn timer.
     */
    _killPlayer(player) {
        if (player.isInHole) return; // Already mid-death — don't double-count
        player.isInHole = true;
        player.vx = 0;
        player.vy = 0;
        player.die();
        this.score.recordPlayerDeath();
        setTimeout(() => { if (!player.active) return; player.respawn(); }, 2000);
    }

    _updateBullets(dt) {
        // Update all bullets
        this.bullets.forEach(b => b.update(dt));

        // Remove out-of-bounds or inactive bullets
        this.bullets = this.bullets.filter(b => {
            if (!b.active) return false;
            if (b.isOutOfBounds(GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT)) {
                b.destroy();
                return false;
            }
            return true;
        });

        const activeBullets = this.bullets.filter(b => b.active);
        const activeEnemies = this.enemies.filter(e => e.active && !e.isInHole);
        const player = this.players[0];
        const playerActive = player?.active && !player.isInHole;

        for (const bullet of activeBullets) {
            if (bullet.kind === 'enemy') {
                // Enemy bullets push the player but do NOT kill them
                if (!playerActive) continue;
                this._checkBulletPlayerCollision(bullet, player);
            } else {
                // Player bullets push enemies (existing behaviour)
                for (const enemy of activeEnemies) {
                    if (this._checkBulletEnemyCollision(bullet, enemy)) break;
                }
            }
        }
    }

    /**
     * Advance asteroid positions, cull out-of-bounds ones, and resolve impacts
     * against players, enemies, and stars.
     *
     * Asteroids are NOT physics participants (they skip Physics.update()) so
     * their collision behaviour is handled entirely here:
     *   - Player hit  → player dies and respawns (same as falling into a hole)
     *   - Enemy hit   → enemy dies and respawns, score credited
     *   - Star hit    → star permanently removed, star-lost score recorded
     * In all cases the asteroid itself is destroyed on first contact.
     */
    _updateAsteroids(dt) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        this._asteroidManager.update(dt, W, H);

        for (const asteroid of this._asteroidManager.asteroids) {
            if (!asteroid.active) continue;

            asteroid.update(dt);

            // Check player impacts
            for (const player of this.players) {
                if (!player.active || player.isInHole) continue;
                if (player.isInvulnerable) continue;
                if (!_circlesOverlap(asteroid, player)) continue;

                asteroid.destroy();
                this._killPlayer(player);
                eventBus.emit(GameEvents.ASTEROID_HIT, { asteroid, target: player });
                break;
            }

            if (!asteroid.active) continue;

            // Check enemy impacts
            for (const enemy of this.enemies) {
                if (!enemy.active || enemy.isInHole) continue;
                // Bosses shrug off asteroids — they're an environmental
                // hazard, not a viable strategy for soloing the boss.
                if (enemy.hasTag('boss')) continue;
                if (!_circlesOverlap(asteroid, enemy)) continue;

                asteroid.destroy();
                enemy.die();
                this.score.recordEnemyKill();
                setTimeout(() => { if (!enemy.active) return; enemy.respawn(); }, 3000);
                eventBus.emit(GameEvents.ASTEROID_HIT, { asteroid, target: enemy });
                break;
            }

            if (!asteroid.active) continue;

            // Check star impacts
            for (const star of this.stars) {
                if (!star.active || star.isInHole) continue;
                if (!_circlesOverlap(asteroid, star)) continue;

                asteroid.destroy();
                star.destroy();
                this.score.recordStarLost();
                eventBus.emit(GameEvents.ASTEROID_HIT, { asteroid, target: star });
                break;
            }
        }
    }

    /**
     * Drive {@link BlackHoleManager}: tick lifespans, then for each live
     * black hole apply spiral pull to nearby balls. Crossing the kill core
     * destroys the entity along the same paths used by holes:
     *
     *   - Player → `_killPlayer` (death + 2s respawn + invulnerability)
     *   - Enemy  → `enemy.die()` + 3s respawn (skip bosses, who shrug it off)
     *   - Star   → permanently removed and counted as lost
     *   - Asteroid → simply destroyed (silently absorbed)
     */
    _updateBlackHoles(dt) {
        if (!this._blackHoleManager) return;
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        this._blackHoleManager.update(dt, W, H);

        const blackHoles = this._blackHoleManager.blackHoles;
        if (blackHoles.length === 0) return;

        // Build the impact-target lists once per tick so each black hole
        // doesn't re-walk the entity arrays for itself.
        const players  = this.players;
        const enemies  = this.enemies;
        const stars    = this.stars;
        const asteroids = this._asteroidManager?.asteroids ?? [];

        for (const bh of blackHoles) {
            for (const player of players) {
                if (!player.active || player.isInHole) continue;
                const result = bh.affect(player);
                if (result === 'kill' && !player.isInvulnerable) {
                    this._killPlayer(player);
                    eventBus.emit(GameEvents.BLACK_HOLE_SWALLOWED, { blackHole: bh, target: player });
                }
            }

            for (const enemy of enemies) {
                if (!enemy.active || enemy.isInHole) continue;
                // Bosses are too massive — same rule as for asteroids.
                if (enemy.hasTag('boss')) continue;
                const result = bh.affect(enemy);
                if (result === 'kill') {
                    enemy.die();
                    this.score.recordEnemyKill();
                    setTimeout(() => { if (!enemy.active) return; enemy.respawn(); }, 3000);
                    eventBus.emit(GameEvents.BLACK_HOLE_SWALLOWED, { blackHole: bh, target: enemy });
                }
            }

            for (const star of stars) {
                if (!star.active || star.isInHole) continue;
                const result = bh.affect(star);
                if (result === 'kill') {
                    star.destroy();
                    this.score.recordStarLost();
                    eventBus.emit(GameEvents.BLACK_HOLE_SWALLOWED, { blackHole: bh, target: star });
                }
            }

            for (const asteroid of asteroids) {
                if (!asteroid.active) continue;
                const result = bh.affect(asteroid);
                if (result === 'kill') {
                    asteroid.destroy();
                    eventBus.emit(GameEvents.BLACK_HOLE_SWALLOWED, { blackHole: bh, target: asteroid });
                }
            }
        }
    }

    /**
     * Tick the {@link ArenaSingularity} (Level 5 permanent gravity well) and
     * resolve its interactions with every movable entity.
     *
     * Impact rules mirror those of the transient black holes:
     *   - Player   → `_killPlayer` (2s respawn + invulnerability grace)
     *   - Enemy    → `die()` + 3s respawn (boss immune — tagged check below)
     *   - Star     → permanently removed, counted as lost
     *   - Asteroid → silently destroyed (absorbed by the void)
     *
     * The boss is explicitly excluded by the `hasTag('boss')` guard — the
     * same immunity it enjoys against all other environmental kill sources.
     */
    _updateArenaSingularity(dt) {
        const sing = this._arenaSingularity;
        if (!sing || !sing.active) return;

        sing.update(dt);

        for (const player of this.players) {
            if (!player.active || player.isInHole) continue;
            const result = sing.affect(player);
            if (result === 'kill' && !player.isInvulnerable) {
                this._killPlayer(player);
            }
        }

        for (const enemy of this.enemies) {
            if (!enemy.active || enemy.isInHole) continue;
            // Boss is unkillable by any environmental hazard.
            if (enemy.hasTag('boss')) continue;
            const result = sing.affect(enemy);
            if (result === 'kill') {
                enemy.die();
                this.score.recordEnemyKill();
                setTimeout(() => { if (!enemy.active) return; enemy.respawn(); }, 3000);
            }
        }

        for (const star of this.stars) {
            if (!star.active || star.isInHole) continue;
            const result = sing.affect(star);
            if (result === 'kill') {
                star.destroy();
                this.score.recordStarLost();
            }
        }

        for (const asteroid of this._asteroidManager?.asteroids ?? []) {
            if (!asteroid.active) continue;
            const result = sing.affect(asteroid);
            if (result === 'kill') asteroid.destroy();
        }
    }

    /**
     * Drive {@link CakeManager}: detect player overlap with each cake and
     * apply the "fat & slow" status. Cakes have no effect on enemies — by
     * design only the player can be tempted into eating one.
     */
    _updateCakes(dt) {
        if (!this._cakeManager) return;
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        this._cakeManager.update(dt, W, H);

        const player = this.players[0];
        if (!player || !player.active || player.isInHole) return;

        for (const cake of this._cakeManager.cakes) {
            if (!cake.active) continue;
            const dx = player.x - cake.x;
            const dy = player.y - cake.y;
            const minDist = player.radius + cake.radius;
            if (dx * dx + dy * dy >= minDist * minDist) continue;

            cake.destroy();
            player.applyFatSlow(GameConfig.CAKE_SLOW_DURATION);
            // PLAYER_ATE_CAKE is emitted by Player.applyFatSlow; no need to
            // duplicate it here.
        }
    }

    /**
     * Drive {@link BombManager}: tick fuses, prime any bomb whose trigger
     * radius contains a live ball, and apply explosion impulse to nearby
     * balls the moment a bomb transitions to the `exploded` state.
     */
    _updateBombs(dt) {
        if (!this._bombManager) return;
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        this._bombManager.update(dt, W, H);

        // Eligible "trigger" balls: anyone the bomb should react to.
        // Stars and asteroids are intentionally NOT triggers — only
        // active players and non-boss enemies.
        const triggers = [
            ...this.players.filter(p => p.active && !p.isInHole),
            ...this.enemies.filter(e => e.active && !e.isInHole && !e.hasTag('boss')),
        ];

        // Blast targets: also include stars so a bomb can blow them away
        // (no score change, just chaos), but skip bosses for the same
        // reason asteroids skip them.
        const blastTargets = [
            ...this.players.filter(p => p.active && !p.isInHole),
            ...this.enemies.filter(e => e.active && !e.isInHole && !e.hasTag('boss')),
            ...this.stars  .filter(s => s.active && !s.isInHole),
        ];

        for (const bomb of this._bombManager.bombs) {
            if (!bomb.active) continue;

            if (bomb.state === 'idle') {
                // Trigger check — any ball inside the trigger radius lights the fuse.
                const triggerSq = bomb.triggerRadius * bomb.triggerRadius;
                for (const ball of triggers) {
                    const dx = ball.x - bomb.x;
                    const dy = ball.y - bomb.y;
                    if (dx * dx + dy * dy < triggerSq) {
                        bomb.prime();
                        eventBus.emit(GameEvents.BOMB_PRIMED, { bomb, trigger: ball });
                        break;
                    }
                }
            } else if (bomb.state === 'exploded' && !bomb._dispatched) {
                // First frame of detonation — apply the impulse exactly once.
                bomb._dispatched = true;
                const hit = bomb.consume(blastTargets);
                eventBus.emit(GameEvents.BOMB_EXPLODED, { bomb, hit });
            }
        }
    }

    _checkBulletEnemyCollision(bullet, enemy) {
        const dx = enemy.x - bullet.x;
        const dy = enemy.y - bullet.y;
        const distSq = dx * dx + dy * dy;
        const minDistSq = (bullet.radius + enemy.radius) ** 2;

        if (distSq >= minDistSq) return false; // No collision

        // Calculate normalized push direction
        const dist = Math.sqrt(distSq) || 0.001; // Avoid division by zero
        const nx = dx / dist;
        const ny = dy / dist;

        // Push enemy away from bullet
        const pushStrength = GameConfig.BULLET_PUSH_FORCE;
        enemy.applyImpulse(nx * pushStrength, ny * pushStrength);

        // Destroy bullet on impact
        bullet.destroy();

        // Emit collision event
        eventBus.emit(GameEvents.BALL_HIT, {
            a: bullet,
            b: enemy,
            x: bullet.x,
            y: bullet.y,
            strength: pushStrength,
        });

        return true; // Collision occurred, bullet was destroyed
    }

    /**
     * Push the player away from an enemy bullet without applying death — the
     * bullet itself is destroyed on contact. Returns true on hit so callers
     * can short-circuit further checks for that bullet.
     */
    _checkBulletPlayerCollision(bullet, player) {
        const dx = player.x - bullet.x;
        const dy = player.y - bullet.y;
        const distSq = dx * dx + dy * dy;
        const minDistSq = (bullet.radius + player.radius) ** 2;

        if (distSq >= minDistSq) return false;

        const dist = Math.sqrt(distSq) || 0.001;
        const nx = dx / dist;
        const ny = dy / dist;

        const push = GameConfig.ENEMY_BULLET_PUSH_FORCE;
        player.applyImpulse(nx * push, ny * push);

        bullet.destroy();

        eventBus.emit(GameEvents.BALL_HIT, {
            a: bullet,
            b: player,
            x: bullet.x,
            y: bullet.y,
            strength: push,
        });

        return true;
    }

    /**
     * Push the active (possibly interpolated) planet palette onto the live
     * Planet entities so their colour follows the level cross-fade.
     */
    _applyLevelPalette() {
        const palette = this.levels.getRenderSpec().planetPalette;
        for (let i = 0; i < this.planets.length; i++) {
            this.planets[i].color = palette[i] ?? this.planets[i].color;
        }
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _render() {
        const ctx = this.renderer.ctx;
        this.renderer.clear();

        if (this.state === GameState.MENU) {
            this.menu.render(ctx);
            return;
        }

        if (this.state === GameState.INTRO) {
            this._intro.render(ctx);
            return;
        }

        if (this.state === GameState.OUTRO) {
            this._outro.render(ctx);
            return;
        }

        const spec = this.levels.getRenderSpec();
        this.renderer.drawBackground(spec);
        this.renderer.drawTableBorder({
            x: 20, y: 20,
            w: GameConfig.CANVAS_WIDTH  - 40,
            h: GameConfig.CANVAS_HEIGHT - 40,
        }, spec);

        // Arena singularity renders BEFORE holes/planets so those landmarks
        // appear on top of (and are therefore readable against) the gravity tint.
        this._arenaSingularity?.render(ctx);

        this.holes.forEach(h => h.render(ctx));
        this.planets.forEach(p => p.render(ctx));

        // Stars render under entities so they appear as ground-level pickups
        this.stars.forEach(s => s.render(ctx));

        // Cakes and bombs render under enemies/player so the player ball
        // visibly sits ON TOP of the pickup it's about to hit.
        this._cakeManager?.cakes.forEach(c => c.render(ctx));
        this._bombManager?.bombs.forEach(b => b.render(ctx));

        // Black holes render under entities so the player ball appears to
        // be visibly drawn into the void rather than hidden behind it.
        this._blackHoleManager?.blackHoles.forEach(bh => bh.render(ctx));

        // Spawn-warning telegraphs sit ABOVE planets/cakes/bombs but BELOW
        // entities, so the player ball is visibly inside the danger zone
        // and can clearly see "I need to leave this circle".
        this._warningManager.render(ctx);

        [...this.enemies, ...this.players].forEach(b => b.render(ctx));
        this.bullets.forEach(b => b.render(ctx));

        // Boss ray sits above entities so the killing flash is impossible to miss
        this._boss?.renderRayOverlay(ctx);

        // Asteroids render above other entities so they read as incoming threats
        this._asteroidManager?.asteroids.forEach(a => a.render(ctx));

        const lvl = this.levels.current;
        this.renderer.drawHUD(
            this.score.getSnapshot(),
            { name: lvl.name, starsToWin: lvl.starsToWin },
            this.players,
            this._gameTimer,
        );
        this.renderer.drawControls();

        // Warning overlays stack vertically above the HUD. Each manager
        // contributes one entry when its shower is imminent.
        this.renderer.drawHazardWarnings(this._collectHazardWarnings());

        if (this.state === GameState.PAUSED)    this._renderPauseScreen(ctx);
        if (this.state === GameState.GAME_OVER) this._renderGameOverScreen(ctx);
    }

    /**
     * Snapshot every hazard manager's `warningCountdown` as the renderer
     * input list. Empty list → no overlay drawn.
     * @returns {{label: string, countdown: number}[]}
     */
    _collectHazardWarnings() {
        const warnings = [];
        const ast = this._asteroidManager?.warningCountdown  ?? 0;
        if (ast > 0) warnings.push({ label: 'ASTEROID SHOWER INCOMING', countdown: ast });
        const bh  = this._blackHoleManager?.warningCountdown ?? 0;
        if (bh  > 0) warnings.push({ label: 'BLACK HOLE STORM INCOMING', countdown: bh });
        const cake = this._cakeManager?.warningCountdown    ?? 0;
        if (cake > 0) warnings.push({ label: 'CAKE BUFFET INCOMING',     countdown: cake });
        const bomb = this._bombManager?.warningCountdown    ?? 0;
        if (bomb > 0) warnings.push({ label: 'MINEFIELD INCOMING',       countdown: bomb });
        return warnings;
    }

    _renderPauseScreen(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold 52px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', W / 2, H / 2 - 20);
        ctx.font      = `18px 'Courier New'`;
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('Press ESC to resume', W / 2, H / 2 + 30);
        ctx.restore();
    }

    _renderGameOverScreen(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();

        // Darkened arena
        ctx.fillStyle = 'rgba(20,0,0,0.80)';
        ctx.fillRect(0, 0, W, H);

        // "TIME'S UP!" heading — red glow
        ctx.font         = `bold 72px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle    = '#ff3333';
        ctx.shadowColor  = '#ff0000';
        ctx.shadowBlur   = 36;
        ctx.fillText("TIME'S UP!", W / 2, H / 2 - 60);

        // Final stats
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#ffffff';
        ctx.font       = `24px 'Courier New'`;
        const snap = this.score.getSnapshot();
        ctx.fillText(
            `★ ${snap.starsCollected} collected  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            W / 2, H / 2 + 10,
        );

        ctx.fillStyle = '#aaaaaa';
        ctx.font      = `16px 'Courier New'`;
        ctx.fillText(`${snap.starsLost} star${snap.starsLost !== 1 ? 's' : ''} lost to holes`, W / 2, H / 2 + 46);

        // Restart prompt
        ctx.fillStyle = '#888888';
        ctx.font      = `14px 'Courier New'`;
        ctx.fillText('Press ESC or ENTER to play again', W / 2, H / 2 + 90);

        ctx.restore();
    }

}


// ---------------------------------------------------------------------------
// Module-level helpers
// ---------------------------------------------------------------------------

/** Returns true when two circular entities overlap. */
function _circlesOverlap(a, b) {
    const dx   = a.x - b.x;
    const dy   = a.y - b.y;
    const minD = a.radius + b.radius;
    return dx * dx + dy * dy < minD * minD;
}

// Bootstrap
const game = new Game();
game.init().catch(err => console.error('Game failed to start:', err));
