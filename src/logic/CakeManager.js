import { Cake }            from '../entities/objects/Cake.js';
import { GameConfig }      from '../core/GameConfig.js';
import { GameEvents }      from '../events/GameEvents.js';
import { ShowerScheduler } from './ShowerScheduler.js';

/**
 * Lifecycle owner for {@link Cake} pickups.
 *
 * ### Spawning modes
 *
 * **Normal mode** – exactly one cake on the field at any time. When the
 * player eats it the manager waits `CAKE_RESPAWN_DELAY` seconds and spawns
 * the next one at a fresh random spot.
 *
 * **Buffet mode** – every `CAKE_BUFFET_INTERVAL` seconds the manager
 * spawns `CAKE_BUFFET_SIZE` (default: 4) cakes simultaneously. The on-screen
 * warning fires `CAKE_WARNING_TIME` seconds before the buffet drops.
 *
 * Activation is driven by `enabled`; Game.js flips it from
 * `LEVELS[i].hazards.cakes`. Disabling clears all live cakes.
 *
 * Eating logic (status-effect application, cake destruction, score) is
 * NOT handled here — Game.js owns the player-collision check so that the
 * "fat & slow" status sits alongside the other player-impact paths.
 */
export class CakeManager {
    /**
     * @param {SpriteManager|null} sprites  Forwarded to Cake instances.
     * @param {object} [opts]
     * @param {()=>{x:number,y:number,radius:number}[]} [opts.getObstacles]
     *                  Returns world obstacles to avoid when picking spawn
     *                  positions (planets, holes).
     */
    constructor(sprites = null, { getObstacles = null } = {}) {
        this._sprites      = sprites;
        this._getObstacles = getObstacles;

        /** @type {Cake[]} */
        this.cakes = [];

        /** @type {boolean} */
        this.enabled = false;

        this._scheduler = new ShowerScheduler({
            interval:    GameConfig.CAKE_BUFFET_INTERVAL,
            warningTime: GameConfig.CAKE_WARNING_TIME,
            eventName:   GameEvents.CAKE_WARNING,
        });

        this._respawnTimer = GameConfig.CAKE_RESPAWN_DELAY * 0.5;
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    get warningCountdown() {
        return this.enabled ? this._scheduler.warningCountdown : 0;
    }

    setEnabled(enabled) {
        if (this.enabled === enabled) return;
        this.enabled = enabled;
        if (!enabled) this._clearAll();
    }

    update(dt, W, H) {
        if (!this.enabled) return;

        // Drop any cakes that were eaten this frame.
        this.cakes = this.cakes.filter(c => c.active);
        for (const c of this.cakes) c.update(dt);

        if (this._scheduler.update(dt)) {
            this._triggerBuffet(W, H);
        }

        // Normal mode: keep exactly one cake on the field between buffets.
        if (this.cakes.length === 0) {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this._respawnTimer = GameConfig.CAKE_RESPAWN_DELAY;
                this.cakes.push(this._spawnOne(W, H));
            }
        }
    }

    reset() {
        this._clearAll();
        this._scheduler.reset();
        this._respawnTimer = GameConfig.CAKE_RESPAWN_DELAY * 0.5;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _clearAll() {
        this.cakes.forEach(c => c.destroy());
        this.cakes = [];
    }

    _triggerBuffet(W, H) {
        const count = GameConfig.CAKE_BUFFET_SIZE;
        for (let i = 0; i < count; i++) {
            this.cakes.push(this._spawnOne(W, H));
        }
    }

    _spawnOne(W, H) {
        const r       = GameConfig.PLAYER_RADIUS;
        const inset   = r + 40;
        const obstacles = this._getObstacles?.() ?? [];

        let x, y;
        for (let tries = 0; tries < 30; tries++) {
            x = inset + Math.random() * (W - inset * 2);
            y = inset + Math.random() * (H - inset * 2);
            if (this._isFarEnough(x, y, obstacles, r)) break;
        }
        return new Cake(x, y, this._sprites);
    }

    _isFarEnough(x, y, obstacles, r) {
        for (const o of obstacles) {
            const dx = x - o.x;
            const dy = y - o.y;
            const minDist = r + (o.radius ?? 0) + 20;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        for (const c of this.cakes) {
            const dx = x - c.x;
            const dy = y - c.y;
            const minDist = r * 4;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        return true;
    }
}
