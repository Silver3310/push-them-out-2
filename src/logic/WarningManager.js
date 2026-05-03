import { SpawnWarning } from '../entities/objects/SpawnWarning.js';
import { GameConfig }   from '../core/GameConfig.js';
import { eventBus }     from '../events/EventBus.js';
import { GameEvents }   from '../events/GameEvents.js';

/**
 * Centralised "telegraph the spawn" service.
 *
 * Anything in the game that places a hazardous entity at an arbitrary
 * position calls {@link WarningManager#schedule} instead of constructing
 * the entity directly. The manager renders a yellow {@link SpawnWarning}
 * circle at that location for `SPAWN_WARNING_DURATION` seconds and then
 * fires the supplied `onFire` callback — that callback is what actually
 * creates the hazard. The result: the player always sees a 3-second
 * "danger here" telegraph before the threat materialises, eliminating
 * the unfair "spawn-on-player" deaths that the system used to produce.
 *
 * ### Design notes
 *
 *   - Warnings are pure visuals; they never collide or apply force.
 *   - The actual entity creation happens inside `onFire`, so the caller
 *     stays in charge of *what* gets spawned and *where it goes*. The
 *     manager only owns the timing + the on-screen telegraph.
 *   - `update(dt)` is gated by `Game.state === PLAYING` (i.e. only ticks
 *     while the player isn't paused), which means the warning naturally
 *     freezes during pause without any extra plumbing.
 *   - `reset()` cancels every pending warning. The associated `onFire`
 *     callbacks are NOT invoked — pending warnings are abandoned along
 *     with the level/run that created them.
 *
 * ### Usage
 *
 * ```js
 * warningManager.schedule({
 *     x:        320,
 *     y:        240,
 *     radius:   GameConfig.BLACK_HOLE_PULL_RADIUS,
 *     kind:     'blackHole',
 *     duration: GameConfig.SPAWN_WARNING_DURATION,   // optional, defaults to global
 *     onFire:   () => this.blackHoles.push(this._spawnOne(W, H, x, y)),
 * });
 * ```
 *
 * The `kind` string is forwarded on the `SPAWN_WARNING` event payload so
 * audio/UI listeners can branch on hazard type if they ever want to.
 */
export class WarningManager {
    constructor() {
        /** @type {SpawnWarning[]} Live warnings. */
        this.warnings = [];
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Queue a yellow telegraph at `(x, y)` that fires `onFire()` once `duration`
     * seconds have elapsed.
     *
     * @param {object}   spec
     * @param {number}   spec.x        World-x of the future spawn centre.
     * @param {number}   spec.y        World-y of the future spawn centre.
     * @param {number}   spec.radius   Visual radius (pre-padding). The actual
     *                                 ring is drawn with a small visual padding
     *                                 (`SPAWN_WARNING_RADIUS_PADDING`) so it
     *                                 fully encloses the inbound entity.
     * @param {Function} spec.onFire   Invoked exactly once at the end of the
     *                                 warning. Should perform the actual spawn.
     * @param {number}   [spec.duration=GameConfig.SPAWN_WARNING_DURATION]
     *                                 Seconds to display before firing.
     * @param {string}   [spec.kind]   Free-form tag forwarded on the
     *                                 `SPAWN_WARNING` event for listeners.
     * @returns {SpawnWarning} The queued warning (mostly useful for tests).
     */
    schedule({ x, y, radius, onFire, duration, kind = 'generic' }) {
        const dur = duration ?? GameConfig.SPAWN_WARNING_DURATION;
        const r   = radius + GameConfig.SPAWN_WARNING_RADIUS_PADDING;
        const w   = new SpawnWarning(x, y, r, dur, onFire);
        this.warnings.push(w);
        eventBus.emit(GameEvents.SPAWN_WARNING, { x, y, radius: r, kind });
        return w;
    }

    /**
     * Drive every live warning. Inactive warnings (those whose timer just
     * fired) are dropped from the list at the end of the tick.
     * @param {number} dt
     */
    update(dt) {
        for (const w of this.warnings) w.update(dt);
        this.warnings = this.warnings.filter(w => w.active);
    }

    /** Render every live warning. Call from the main render pass. */
    render(ctx) {
        for (const w of this.warnings) w.render(ctx);
    }

    /**
     * Cancel every pending warning without firing their callbacks. Used by
     * `Game._buildLevel` so a fresh game doesn't carry warnings from the
     * previous run. Hazard managers also call this indirectly via their own
     * `reset()` paths because the warnings they queued shouldn't survive
     * a level rebuild.
     */
    reset() {
        for (const w of this.warnings) w.destroy();
        this.warnings = [];
    }
}
