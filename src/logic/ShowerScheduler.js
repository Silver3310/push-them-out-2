import { eventBus } from '../events/EventBus.js';

/**
 * Shared scheduling helper that drives the periodic "shower" / mass-spawn
 * events used by every hazard manager (asteroids, black holes, cakes, bombs).
 *
 * ## What it owns
 *
 *   - A wall-clock timer advanced by `update(dt)`.
 *   - A one-shot warning event emitted when the timer crosses into the
 *     warning window (the seconds immediately preceding the next event).
 *   - A `warningCountdown` field the renderer can read each frame to draw
 *     the pulsing on-screen warning overlay.
 *
 * The scheduler is purposefully decoupled from spawning — `update(dt)`
 * returns `true` exactly once per cycle, the moment the next shower is
 * due. Each manager turns that signal into its own concrete spawn burst
 * (asteroid count, black-hole trio, cake quad, bomb quad, etc.).
 *
 * ### Lifecycle
 *
 *   const scheduler = new ShowerScheduler({
 *       interval:    60,
 *       warningTime: 10,
 *       eventName:   GameEvents.ASTEROID_WARNING,
 *   });
 *
 *   // each update tick:
 *   if (scheduler.update(dt)) this._triggerShower();
 *
 *   // each render tick:
 *   if (scheduler.warningCountdown > 0) renderer.drawWarning(...);
 *
 *   // when starting a new game / changing levels:
 *   scheduler.reset();
 */
export class ShowerScheduler {
    /**
     * @param {object} cfg
     * @param {number} cfg.interval     Seconds between shower events.
     * @param {number} cfg.warningTime  Lead-in seconds during which the
     *                                  warning event fires and the
     *                                  `warningCountdown` is non-zero.
     * @param {string} cfg.eventName    GameEvent string emitted once per
     *                                  cycle when the warning window opens.
     * @param {number} [cfg.startOffset=interval/2]  Initial timer value so
     *                                  the very first event isn't immediate.
     */
    constructor({ interval, warningTime, eventName, startOffset = null }) {
        this._interval     = interval;
        this._warningTime  = warningTime;
        this._eventName    = eventName;
        this._startOffset  = startOffset ?? interval * 0.5;

        this._timer  = this._startOffset;
        this._warned = false;

        /**
         * Seconds remaining until the next shower, or 0 outside the
         * warning window. Renderer reads this each frame.
         * @type {number}
         */
        this.warningCountdown = 0;
    }

    /**
     * Advance the timer. Returns `true` exactly once per cycle, on the
     * tick that crosses the interval boundary; the caller should then
     * trigger its concrete spawn burst.
     *
     * @param {number} dt
     * @returns {boolean} true when this tick crossed the interval.
     */
    update(dt) {
        this._timer += dt;

        const timeToShower = this._interval - this._timer;
        const inWindow     = timeToShower > 0 && timeToShower <= this._warningTime;
        this.warningCountdown = inWindow ? timeToShower : 0;

        if (inWindow && !this._warned) {
            this._warned = true;
            eventBus.emit(this._eventName, { timeLeft: Math.ceil(timeToShower) });
        }

        if (this._timer >= this._interval) {
            this._timer  = 0;
            this._warned = false;
            return true;
        }
        return false;
    }

    /** Restore initial cadence state (game restart / hazard re-arm). */
    reset() {
        this._timer  = this._startOffset;
        this._warned = false;
        this.warningCountdown = 0;
    }
}
