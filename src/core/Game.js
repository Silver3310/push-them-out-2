import { GameConfig }  from './GameConfig.js';
import { GameState }   from './GameState.js';
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
import { AIController } from '../entities/enemies/AIController.js';
import { Hole }        from '../entities/objects/Hole.js';
import { Planet }      from '../entities/objects/Planet.js';
import { Bullet }      from '../entities/objects/Bullet.js';
import { Star }            from '../entities/objects/Star.js';
import { AsteroidManager }      from '../logic/AsteroidManager.js';
import { Menu }                 from '../ui/Menu.js';
import { NotificationManager }  from '../ui/NotificationManager.js';

const PLAYER_COLORS = ['#00ccff', '#ff44cc', '#44ff88', '#ffcc00'];
const ENEMY_COLORS  = ['#ff4444', '#ff8844', '#cc44ff', '#ff44aa'];

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
        this.score    = new ScoreManager();

        this.state   = GameState.LOADING;
        this.players = [];
        this.enemies = [];
        this.holes   = [];
        this.planets = [];
        this.bullets = [];
        this.stars   = [];

        // Asteroid system – initialised after sprites are loaded so the manager
        // can pass the SpriteManager reference through to each Asteroid instance.
        this._asteroidManager = null;

        this.menu           = null;
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
        this.menu           = new Menu(this.canvas, this.input);
        this._notifications = new NotificationManager(document.getElementById('ui-overlay'));
        this._setupEventListeners();

        this.state = GameState.MENU;
        requestAnimationFrame(ts => this._loop(ts));
    }

    _startNewGame() {
        this.menu.deactivate();
        this.score.reset();
        this._buildLevel();
        // Seed the player controller with the current button state so the
        // click that dismissed the menu doesn't trigger an immediate shot.
        this._playerController.syncInputState();
        this.state = GameState.PLAYING;
        eventBus.emit(GameEvents.PLAY_MUSIC, { key: 'music_main' });

        // Level-start tutorial notifications shown sequentially
        this._notifications.reset();
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Welcome to the game! We hope you enjoy it 😎' });
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: `You control the pink ball, your goal is to collect ${GameConfig.STARS_TO_WIN} stars` });
        eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Beware other balls, asteroids, everything! O_O' });
    }

    _setupEventListeners() {
        eventBus.on(GameEvents.MENU_START_GAME, () => this._startNewGame());

        eventBus.on(GameEvents.BALL_FELL_IN_HOLE, ({ ball }) => {
            if (ball.hasTag('player')) {
                ball.die();
                this.score.recordPlayerDeath();
                setTimeout(() => { if (!ball.active) return; ball.respawn(); }, 2000);
            } else if (ball.hasTag('enemy')) {
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
            this.state = GameState.VICTORY;
            eventBus.emit(GameEvents.STOP_MUSIC);
        });

        // ESC: in menu sub-screens go back; otherwise toggle pause
        window.addEventListener('keydown', e => {
            if (e.code !== 'Escape') return;
            if (this.state === GameState.MENU) {
                this.menu.handleEscape();
            } else if (this.state === GameState.PLAYING) {
                this.state = GameState.PAUSED;
                eventBus.emit(GameEvents.GAME_PAUSE);
            } else if (this.state === GameState.PAUSED) {
                this.state = GameState.PLAYING;
                eventBus.emit(GameEvents.GAME_RESUME);
            }
        });
    }

    _buildLevel() {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        // Six-pocket pool table layout
        this.holes = [
            new Hole(55,     55    ),
            new Hole(W / 2,  35    ),
            new Hole(W - 55, 55    ),
            new Hole(55,     H - 55),
            new Hole(W / 2,  H - 35),
            new Hole(W - 55, H - 55),
        ];

        // Planet obstacles as bumpers
        this.planets = [
            new Planet(320,       240,      55, '#c8e06e'),
            new Planet(960,       480,      55, '#c8e06e'),
            new Planet(W / 2,     190,      40, '#e0a06e'),
            new Planet(W / 2,     H - 190,  40, '#6ec8e0'),
            new Planet(190,       H / 2,    45, '#e06ec8'),
            new Planet(W - 190,   H / 2,    45, '#c8e06e'),
        ];

        // Human player (centre)
        const player = new Player(W / 2, H / 2, PLAYER_COLORS[1], 'Sweet Bulldog');
        this.players = [player];
        this._playerController = new PlayerController(player, this.input, this);

        // AI enemies (corners)
        const enemyDefs = [
            { x: 160,     y: 160,     color: ENEMY_COLORS[0], name: 'AI' },
            { x: W - 160, y: 160,     color: ENEMY_COLORS[1], name: 'AI' },
            { x: W - 160, y: H - 160, color: ENEMY_COLORS[2], name: 'AI' },
        ];
        this.enemies = enemyDefs.map(d => new Enemy(d.x, d.y, d.color, d.name));

        // Give AI controllers a live reference to holes and players
        const worldRef = { holes: this.holes, players: this.players };
        this._aiControllers = this.enemies.map(e => new AIController(e, worldRef));

        // Seed the board with the initial star population
        this.stars = [];
        for (let i = 0; i < GameConfig.STAR_COUNT; i++) {
            this._spawnStar();
        }

        // Asteroid system – reset (or create) so a fresh cycle begins each game
        if (this._asteroidManager) {
            this._asteroidManager.reset();
        } else {
            this._asteroidManager = new AsteroidManager(this.sprites);
        }
    }

    addBullet(bullet) {
        this.bullets.push(bullet);
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
        this._playerController.update(dt);
        this._aiControllers.forEach(ai => ai.update(dt));

        // Replenish any stars that were collected or fell into holes
        this._maintainStarCount();

        // Stars are full physics participants: pushed by enemies, pulled by holes
        const allBalls = [...this.players, ...this.enemies, ...this.stars];
        allBalls.forEach(b => b.update(dt));

        // Collect stars before physics separates the player from them
        this._collectStars();

        this.physics.update(allBalls, this.planets, this.holes);

        // Update bullets and handle collisions
        this._updateBullets(dt);

        // Advance asteroids and resolve their impacts against game entities
        this._updateAsteroids(dt);

        // Keep audio listener at player position for spatial sound
        const p = this.players[0];
        if (p && !p.isInHole) this.audio.setListenerPosition(p.x, p.y);
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

        // Check bullet-enemy collisions
        const activeBullets = this.bullets.filter(b => b.active);
        const activeEnemies = this.enemies.filter(e => e.active && !e.isInHole);

        for (let i = 0; i < activeBullets.length; i++) {
            const bullet = activeBullets[i];
            for (let j = 0; j < activeEnemies.length; j++) {
                const enemy = activeEnemies[j];
                if (this._checkBulletEnemyCollision(bullet, enemy)) {
                    break; // Bullet was destroyed, check next bullet
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
                if (!_circlesOverlap(asteroid, player)) continue;

                asteroid.destroy();
                player.die();
                this.score.recordPlayerDeath();
                setTimeout(() => { if (!player.active) return; player.respawn(); }, 2000);
                eventBus.emit(GameEvents.ASTEROID_HIT, { asteroid, target: player });
                break;
            }

            if (!asteroid.active) continue;

            // Check enemy impacts
            for (const enemy of this.enemies) {
                if (!enemy.active || enemy.isInHole) continue;
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

        this.renderer.drawBackground();
        this.renderer.drawTableBorder({
            x: 20, y: 20,
            w: GameConfig.CANVAS_WIDTH  - 40,
            h: GameConfig.CANVAS_HEIGHT - 40,
        });

        this.holes.forEach(h => h.render(ctx));
        this.planets.forEach(p => p.render(ctx));

        // Stars render under entities so they appear as ground-level pickups
        this.stars.forEach(s => s.render(ctx));

        [...this.enemies, ...this.players].forEach(b => b.render(ctx));
        this.bullets.forEach(b => b.render(ctx));

        // Asteroids render above other entities so they read as incoming threats
        this._asteroidManager?.asteroids.forEach(a => a.render(ctx));

        this.renderer.drawHUD(this.score.getSnapshot(), this.players);
        this.renderer.drawControls();

        // Warning overlay sits above HUD elements to be impossible to miss
        const countdown = this._asteroidManager?.warningCountdown ?? 0;
        if (countdown > 0) this.renderer.drawAsteroidWarning(countdown);

        if (this.state === GameState.PAUSED)  this._renderPauseScreen(ctx);
        if (this.state === GameState.VICTORY) this._renderVictoryScreen(ctx);
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

    _renderVictoryScreen(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();
        ctx.fillStyle = 'rgba(0,15,35,0.82)';
        ctx.fillRect(0, 0, W, H);

        ctx.fillStyle    = '#ffd700';
        ctx.font         = `bold 72px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = '#ffd700';
        ctx.shadowBlur   = 30;
        ctx.fillText('LEVEL 1 CLEAR!', W / 2, H / 2 - 50);

        ctx.shadowBlur   = 0;
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `24px 'Courier New'`;
        const snap = this.score.getSnapshot();
        ctx.fillText(
            `★ ${snap.starsCollected} collected  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            W / 2, H / 2 + 20
        );

        ctx.fillStyle = '#aaaaaa';
        ctx.font      = `16px 'Courier New'`;
        ctx.fillText(`${snap.starsLost} star${snap.starsLost !== 1 ? 's' : ''} lost to holes`, W / 2, H / 2 + 56);

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
