import { BlackHole }       from '../entities/objects/BlackHole.js';
import { GameConfig }      from '../core/GameConfig.js';
import { GameEvents }      from '../events/GameEvents.js';
import { ShowerScheduler } from './ShowerScheduler.js';

/**
 * Lifecycle owner for {@link BlackHole} instances.
 *
 * ### Spawning modes
 *
 * **Normal mode** – at most one black hole on screen at a time. After the
 * previous one dies (or before a new game has spawned any), a fresh one
 * appears every `BLACK_HOLE_SPAWN_INTERVAL` seconds.
 *
 * **Storm mode** – every `BLACK_HOLE_STORM_INTERVAL` seconds the manager
 * spawns `BLACK_HOLE_STORM_SIZE` (default: 3) black holes simultaneously
 * at safe random positions. The on-screen warning overlay starts
 * `BLACK_HOLE_WARNING_TIME` seconds before the storm.
 *
 * ### Activation
 *
 * The manager only spawns when `enabled` is true. Game.js sets this each
 * level transition based on `LEVELS[i].hazards.blackHoles`. When disabled,
 * `update()` flushes any live instances.
 *
 * Collision side-effects (player kill, enemy kill, star removal, asteroid
 * destruction) are NOT handled here — Game.js owns those rules so they
 * funnel through the same death paths used by holes and asteroids.
 */
export class BlackHoleManager {
    /**
     * @param {SpriteManager|null} sprites    Optional, forwarded to BlackHole.
     * @param {object} [opts]
     * @param {()=>{x:number,y:number,radius:number}[]} [opts.getObstacles]
     *                  Returns world obstacles (planets, holes) used for
     *                  safe-spawn rejection. Falsy => no rejection.
     */
    constructor(sprites = null, { getObstacles = null } = {}) {
        this._sprites      = sprites;
        this._getObstacles = getObstacles;

        /** @type {BlackHole[]} */
        this.blackHoles = [];

        /** @type {boolean} Whether the level wants this hazard active. */
        this.enabled = false;

        this._scheduler = new ShowerScheduler({
            interval:    GameConfig.BLACK_HOLE_STORM_INTERVAL,
            warningTime: GameConfig.BLACK_HOLE_WARNING_TIME,
            eventName:   GameEvents.BLACK_HOLE_WARNING,
        });

        // Counts down between solo spawns. Starts mid-cycle so the first
        // one appears reasonably soon after the level begins.
        this._spawnTimer = GameConfig.BLACK_HOLE_SPAWN_INTERVAL * 0.5;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Seconds remaining until the next storm, or 0 outside the warning window. */
    get warningCountdown() {
        return this.enabled ? this._scheduler.warningCountdown : 0;
    }

    /**
     * Toggle the hazard on/off. Disabling drops every live instance.
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        if (!enabled) this._clearAll();
    }

    /**
     * Advance the manager. Safe to call every fixed step regardless of
     * `enabled` state — the no-op fast path is cheap.
     *
     * @param {number} dt
     * @param {number} W  Canvas width.
     * @param {number} H  Canvas height.
     */
    update(dt, W, H) {
        if (!this.enabled) return;

        // Tick lifespans + cull expired instances.
        for (const bh of this.blackHoles) bh.update(dt);
        this.blackHoles = this.blackHoles.filter(bh => bh.active);

        if (this._scheduler.update(dt)) {
            this._triggerStorm(W, H);
        }

        // Solo replenishment between storms — only when the board is empty.
        if (this.blackHoles.length === 0) {
            this._spawnTimer -= dt;
            if (this._spawnTimer <= 0) {
                this._spawnTimer = GameConfig.BLACK_HOLE_SPAWN_INTERVAL;
                this.blackHoles.push(this._spawnOne(W, H));
            }
        }
    }

    /** Hard reset: discard all black holes and re-arm timers. */
    reset() {
        this._clearAll();
        this._scheduler.reset();
        this._spawnTimer = GameConfig.BLACK_HOLE_SPAWN_INTERVAL * 0.5;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _clearAll() {
        this.blackHoles.forEach(bh => bh.destroy());
        this.blackHoles = [];
    }

    _triggerStorm(W, H) {
        const count = GameConfig.BLACK_HOLE_STORM_SIZE;
        for (let i = 0; i < count; i++) {
            this.blackHoles.push(this._spawnOne(W, H));
        }
    }

    /**
     * Pick a safe random position (inside the play field, away from the
     * existing pocket holes and planets) and return a fresh BlackHole.
     */
    _spawnOne(W, H) {
        const r       = GameConfig.BLACK_HOLE_PULL_RADIUS;
        const inset   = r + 30;
        const obstacles = this._getObstacles?.() ?? [];

        let x, y;
        for (let tries = 0; tries < 30; tries++) {
            x = inset + Math.random() * (W - inset * 2);
            y = inset + Math.random() * (H - inset * 2);
            if (this._isFarEnough(x, y, obstacles, r)) break;
        }
        return new BlackHole(x, y, this._sprites);
    }

    _isFarEnough(x, y, obstacles, r) {
        for (const o of obstacles) {
            const dx = x - o.x;
            const dy = y - o.y;
            const minDist = r + (o.radius ?? 0) + 20;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        // Also avoid stacking new holes directly on top of live ones.
        for (const bh of this.blackHoles) {
            const dx = x - bh.x;
            const dy = y - bh.y;
            const minDist = r * 2 + 30;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        return true;
    }
}
