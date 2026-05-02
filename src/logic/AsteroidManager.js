import { Asteroid }        from '../entities/objects/Asteroid.js';
import { GameConfig }      from '../core/GameConfig.js';
import { GameEvents }      from '../events/GameEvents.js';
import { ShowerScheduler } from './ShowerScheduler.js';

/**
 * Manages the full asteroid lifecycle on every level.
 *
 * ### Spawning modes
 *
 * **Normal mode** – exactly one asteroid is kept falling at any time.
 * As soon as the active asteroid exits the canvas or is destroyed a new one
 * spawns immediately.
 *
 * **Shower mode** – every ASTEROID_SHOWER_INTERVAL seconds a burst of
 * ASTEROID_SHOWER_SIZE_MIN – ASTEROID_SHOWER_SIZE_MAX asteroids is spawned
 * simultaneously. All of them use the same random-diagonal trajectory rules
 * as normal-mode asteroids.
 *
 * ### Warning system
 *
 * Cadence and the on-screen warning overlay are driven by a shared
 * {@link ShowerScheduler}. Every other hazard manager (BlackHoleManager,
 * CakeManager, BombManager) follows the same pattern.
 *
 * ### Ownership
 *
 * `this.asteroids` is the single authoritative list of live Asteroid objects.
 * Game.js reads it each frame for rendering and collision checks.
 * Call `reset()` when starting a new game to clear all state.
 */
export class AsteroidManager {
    /**
     * @param {SpriteManager|null} sprites - Passed through to each Asteroid instance.
     */
    constructor(sprites = null) {
        this._sprites = sprites;

        /** @type {Asteroid[]} Live asteroid instances owned by this manager. */
        this.asteroids = [];

        this._scheduler = new ShowerScheduler({
            interval:    GameConfig.ASTEROID_SHOWER_INTERVAL,
            warningTime: GameConfig.ASTEROID_WARNING_TIME,
            eventName:   GameEvents.ASTEROID_WARNING,
        });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /** Seconds until the next shower, or 0 outside the warning window. */
    get warningCountdown() { return this._scheduler.warningCountdown; }

    /**
     * Advance the manager by one fixed timestep.
     * Must be called once per physics step from Game._update().
     *
     * @param {number} dt - Fixed timestep in seconds (typically 1/60).
     * @param {number} W  - Canvas width  (used for out-of-bounds culling and spawn x).
     * @param {number} H  - Canvas height (used for out-of-bounds culling).
     */
    update(dt, W, H) {
        // Prune asteroids that have left the visible area or been destroyed
        this.asteroids = this.asteroids.filter(
            a => a.active && !a.isOutOfBounds(W, H)
        );

        if (this._scheduler.update(dt)) {
            this._triggerShower(W, H);
        }

        // Normal mode: replenish to exactly one asteroid when the board is clear
        if (this.asteroids.length === 0) {
            this.asteroids.push(this._spawnOne(W, H));
        }
    }

    /** Deactivate and discard all asteroids; reset the timer cycle. */
    reset() {
        this.asteroids.forEach(a => a.destroy());
        this.asteroids = [];
        this._scheduler.reset();
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Spawn a burst of asteroids for the shower event. */
    _triggerShower(W, H) {
        const min   = GameConfig.ASTEROID_SHOWER_SIZE_MIN;
        const max   = GameConfig.ASTEROID_SHOWER_SIZE_MAX;
        const count = min + Math.floor(Math.random() * (max - min + 1));

        for (let i = 0; i < count; i++) {
            this.asteroids.push(this._spawnOne(W, H));
        }
    }

    /**
     * Create one Asteroid at a random position on the top edge with a random
     * diagonal-downward velocity.
     *
     * Angle range: ±45° from vertical, ensuring the asteroid always travels
     * steeply downward (vy > 0) while still having a visible horizontal component.
     *
     * @param {number} W - Canvas width.
     * @param {number} H - Canvas height (unused; here for API symmetry).
     * @returns {Asteroid}
     */
    _spawnOne(W, _H) {
        const r = GameConfig.ASTEROID_RADIUS;
        const x = r + Math.random() * (W - r * 2);
        const y = -r * 1.5; // start just above the top edge

        // Angle from vertical in ±π/4 (±45°) – always steeply downward
        const angle = (Math.random() * 2 - 1) * (Math.PI / 4);
        const speed = GameConfig.ASTEROID_SPEED;
        const vx    = Math.sin(angle) * speed;
        const vy    = Math.cos(angle) * speed; // cos(≤45°) > 0 → always downward

        return new Asteroid(x, y, vx, vy, this._sprites);
    }
}
