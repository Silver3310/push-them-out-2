import { Asteroid }   from '../entities/objects/Asteroid.js';
import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Manages the full asteroid lifecycle for Level 1.
 *
 * ### Spawning modes
 *
 * **Normal mode** – exactly one asteroid is kept falling at any time.
 * As soon as the active asteroid exits the canvas or is destroyed a new one
 * spawns immediately.
 *
 * **Shower mode** – every ASTEROID_SHOWER_INTERVAL seconds a burst of
 * ASTEROID_SHOWER_SIZE_MIN – ASTEROID_SHOWER_SIZE_MAX asteroids is spawned
 * simultaneously.  All of them use the same random-diagonal trajectory rules
 * as normal-mode asteroids.
 *
 * ### Warning system
 * ASTEROID_WARNING_TIME seconds before each shower the manager:
 *   1. Sets `warningCountdown` to a non-zero value so the Renderer can
 *      display the countdown in the HUD.
 *   2. Emits a single `GameEvents.ASTEROID_WARNING` event (once per cycle)
 *      so other systems (e.g. AudioManager) can react.
 *
 * ### Ownership
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

        // Start mid-cycle (30 s in) so the first shower isn't immediate
        this._showerTimer = GameConfig.ASTEROID_SHOWER_INTERVAL * 0.5;

        /** Whether the warning event has already fired in the current cycle. */
        this._warnFired = false;

        /**
         * Seconds remaining until the next shower, or 0 when not in the
         * warning window.  The Renderer reads this to show the countdown.
         * @type {number}
         */
        this.warningCountdown = 0;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

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

        this._showerTimer += dt;
        this._updateWarning();

        if (this._showerTimer >= GameConfig.ASTEROID_SHOWER_INTERVAL) {
            this._triggerShower(W, H);
            this._showerTimer = 0;
            this._warnFired   = false;
        }

        // Normal mode: replenish to exactly one asteroid when the board is clear
        if (this.asteroids.length === 0) {
            this.asteroids.push(this._spawnOne(W, H));
        }
    }

    /** Deactivate and discard all asteroids; reset the timer cycle. */
    reset() {
        this.asteroids.forEach(a => a.destroy());
        this.asteroids        = [];
        this._showerTimer     = GameConfig.ASTEROID_SHOWER_INTERVAL * 0.5;
        this._warnFired       = false;
        this.warningCountdown = 0;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Maintain `warningCountdown` and fire the one-shot warning event.
     * Called every update tick so the countdown stays accurate.
     */
    _updateWarning() {
        const timeToShower = GameConfig.ASTEROID_SHOWER_INTERVAL - this._showerTimer;
        const inWindow     = timeToShower > 0 && timeToShower <= GameConfig.ASTEROID_WARNING_TIME;

        this.warningCountdown = inWindow ? timeToShower : 0;

        if (inWindow && !this._warnFired) {
            this._warnFired = true;
            eventBus.emit(GameEvents.ASTEROID_WARNING, {
                timeLeft: Math.ceil(timeToShower),
            });
        }
    }

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
