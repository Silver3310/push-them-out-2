import { Bomb }            from '../entities/objects/Bomb.js';
import { GameConfig }      from '../core/GameConfig.js';
import { GameEvents }      from '../events/GameEvents.js';
import { ShowerScheduler } from './ShowerScheduler.js';

/**
 * Lifecycle owner for {@link Bomb} hazards.
 *
 * ### Spawning modes
 *
 * **Normal mode** – at most one bomb on the field at a time. After the
 * previous one detonates the manager waits `BOMB_RESPAWN_DELAY` seconds
 * and arms a fresh one at a safe random spot.
 *
 * **Minefield mode** – every `BOMB_FIELD_INTERVAL` seconds the manager
 * spawns `BOMB_FIELD_SIZE` (default: 4) bombs simultaneously. The
 * on-screen warning fires `BOMB_WARNING_TIME` seconds before the field
 * arms.
 *
 * Activation is driven by `enabled`; Game.js flips it from
 * `LEVELS[i].hazards.bombs`. Disabling clears all live bombs.
 *
 * Trigger / detonation logic (proximity check, applying impulse to
 * everything in the blast radius) is performed externally by Game.js so
 * the manager stays focused on cadence and spawn placement.
 */
export class BombManager {
    /**
     * @param {SpriteManager|null} sprites  Forwarded to Bomb instances.
     * @param {object} [opts]
     * @param {()=>{x:number,y:number,radius:number}[]} [opts.getObstacles]
     */
    constructor(sprites = null, { getObstacles = null } = {}) {
        this._sprites      = sprites;
        this._getObstacles = getObstacles;

        /** @type {Bomb[]} */
        this.bombs = [];

        /** @type {boolean} */
        this.enabled = false;

        this._scheduler = new ShowerScheduler({
            interval:    GameConfig.BOMB_FIELD_INTERVAL,
            warningTime: GameConfig.BOMB_WARNING_TIME,
            eventName:   GameEvents.BOMB_WARNING,
        });

        this._respawnTimer = GameConfig.BOMB_RESPAWN_DELAY * 0.5;
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

        // Tick fuses + flash timers, drop fully-dissipated bombs.
        for (const b of this.bombs) b.update(dt);
        this.bombs = this.bombs.filter(b => b.active);

        if (this._scheduler.update(dt)) {
            this._triggerField(W, H);
        }

        if (this.bombs.length === 0) {
            this._respawnTimer -= dt;
            if (this._respawnTimer <= 0) {
                this._respawnTimer = GameConfig.BOMB_RESPAWN_DELAY;
                this.bombs.push(this._spawnOne(W, H));
            }
        }
    }

    reset() {
        this._clearAll();
        this._scheduler.reset();
        this._respawnTimer = GameConfig.BOMB_RESPAWN_DELAY * 0.5;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _clearAll() {
        this.bombs.forEach(b => b.destroy());
        this.bombs = [];
    }

    _triggerField(W, H) {
        const count = GameConfig.BOMB_FIELD_SIZE;
        for (let i = 0; i < count; i++) {
            this.bombs.push(this._spawnOne(W, H));
        }
    }

    _spawnOne(W, H) {
        const r       = GameConfig.BOMB_TRIGGER_RADIUS;
        const inset   = r + 20;
        const obstacles = this._getObstacles?.() ?? [];

        let x, y;
        for (let tries = 0; tries < 30; tries++) {
            x = inset + Math.random() * (W - inset * 2);
            y = inset + Math.random() * (H - inset * 2);
            if (this._isFarEnough(x, y, obstacles, r)) break;
        }
        return new Bomb(x, y, this._sprites);
    }

    _isFarEnough(x, y, obstacles, r) {
        for (const o of obstacles) {
            const dx = x - o.x;
            const dy = y - o.y;
            const minDist = r + (o.radius ?? 0) + 20;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        for (const b of this.bombs) {
            const dx = x - b.x;
            const dy = y - b.y;
            // Spread bombs out so a single ball can't chain-detonate them all.
            const minDist = r * 2 + 20;
            if (dx * dx + dy * dy < minDist * minDist) return false;
        }
        return true;
    }
}
