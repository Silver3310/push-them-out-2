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

const PLAYER_COLORS = ['#00ccff', '#ff44cc', '#44ff88', '#ffcc00'];
const ENEMY_COLORS  = ['#ff4444', '#ff8844', '#cc44ff', '#ff44aa'];

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
        this._setupEventListeners();
        this._buildLevel();

        this.state = GameState.PLAYING;
        eventBus.emit(GameEvents.PLAY_MUSIC, { key: 'music_main' });

        requestAnimationFrame(ts => this._loop(ts));
    }

    _setupEventListeners() {
        eventBus.on(GameEvents.BALL_FELL_IN_HOLE, ({ ball }) => {
            if (ball.hasTag('player')) {
                ball.die();
                this.score.recordPlayerDeath();
                setTimeout(() => { if (!ball.active) return; ball.respawn(); }, 2000);
            } else if (ball.hasTag('enemy')) {
                ball.die();
                this.score.recordEnemyKill();
                setTimeout(() => { if (!ball.active) return; ball.respawn(); }, 3000);
            }
        });

        eventBus.on(GameEvents.GAME_VICTORY, () => {
            this.state = GameState.VICTORY;
            eventBus.emit(GameEvents.STOP_MUSIC);
        });

        // ESC toggles pause
        window.addEventListener('keydown', e => {
            if (e.code !== 'Escape') return;
            if (this.state === GameState.PLAYING) {
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
        this._playerController = new PlayerController(player, this.input);

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
    }

    // -------------------------------------------------------------------------
    // Game loop – fixed-timestep physics, variable render
    // -------------------------------------------------------------------------

    _loop(timestamp) {
        const dt = Math.min((timestamp - this._lastTime) / 1000, 0.1);
        this._lastTime = timestamp;

        if (this.state === GameState.PLAYING) {
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

        const allBalls = [...this.players, ...this.enemies];
        allBalls.forEach(b => b.update(dt));
        this.physics.update(allBalls, this.planets, this.holes);

        // Keep audio listener at player position for spatial sound
        const p = this.players[0];
        if (p && !p.isInHole) this.audio.setListenerPosition(p.x, p.y);
    }

    // -------------------------------------------------------------------------
    // Rendering
    // -------------------------------------------------------------------------

    _render() {
        const ctx = this.renderer.ctx;
        this.renderer.clear();
        this.renderer.drawBackground();
        this.renderer.drawTableBorder({
            x: 20, y: 20,
            w: GameConfig.CANVAS_WIDTH  - 40,
            h: GameConfig.CANVAS_HEIGHT - 40,
        });

        this.holes.forEach(h => h.render(ctx));
        this.planets.forEach(p => p.render(ctx));
        [...this.enemies, ...this.players].forEach(b => b.render(ctx));

        this.renderer.drawHUD(this.score.getSnapshot(), this.players);
        this.renderer.drawControls();

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
        ctx.fillStyle    = '#00ccff';
        ctx.font         = `bold 72px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = '#00ccff';
        ctx.shadowBlur   = 30;
        ctx.fillText('VICTORY!', W / 2, H / 2 - 40);
        ctx.shadowBlur   = 0;
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `24px 'Courier New'`;
        const snap = this.score.getSnapshot();
        ctx.fillText(
            `${snap.stars} stars  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            W / 2, H / 2 + 30
        );
        ctx.restore();
    }
}

// Bootstrap
const game = new Game();
game.init().catch(err => console.error('Game failed to start:', err));
