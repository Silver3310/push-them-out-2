import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/** Sprite key used in assets/sprites/sprites.json for the bomb. */
export const BOMB_SPRITE_KEY = 'bomb';

/**
 * Bomb hazard – proximity mine.
 *
 * Sits inert until any ball-class entity (player or enemy) enters its
 * `triggerRadius`. The bomb then enters a brief "primed" state, plays a
 * fast tick-tick-tick visual, and then explodes – throwing every ball
 * inside `explosionRadius` outward with a high impulse.
 *
 * The bomb itself does not kill on impact; the impulse is meant to feel
 * chaotic but not necessarily lethal. (Players or enemies can still die
 * if they get blasted into a hole, an asteroid, or a black hole.)
 *
 * ### Lifecycle states
 *
 *   IDLE     → contact with any qualifying ball flips to PRIMED.
 *   PRIMED   → countdown of `BOMB_FUSE_DURATION` seconds with a flashing
 *              telegraph, then EXPLODE.
 *   EXPLODE  → applies impulse to nearby balls (one shot via `consume()`),
 *              shows a brief flash, then the entity is destroyed.
 *
 * The actual impulse application lives in {@link Bomb#consume}, called by
 * `BombManager` once per detonation so the manager can also play SFX,
 * emit events, etc. without the entity reaching into the global game.
 *
 * ### Rendering precedence
 *
 *   1. Sprite "bomb" if loaded; rotated slightly while primed for cue.
 *   2. Procedural canvas bomb fallback otherwise.
 */
export class Bomb extends Entity {
    /**
     * @param {number}             x
     * @param {number}             y
     * @param {SpriteManager|null} sprites
     */
    constructor(x, y, sprites = null) {
        super(x, y);
        this._sprites        = sprites;
        this.triggerRadius   = GameConfig.BOMB_TRIGGER_RADIUS;
        this.explosionRadius = GameConfig.BOMB_EXPLOSION_RADIUS;
        this.fuseDuration    = GameConfig.BOMB_FUSE_DURATION;
        this.radius          = GameConfig.BOMB_BODY_RADIUS;

        /** 'idle' | 'primed' | 'exploded' */
        this.state           = 'idle';

        /** Seconds remaining on the fuse once primed. */
        this._fuse           = 0;
        /** Seconds since detonation — controls fade-out of the flash. */
        this._explodeAge     = 0;
        this.addTag('bomb');
    }

    /** True while the bomb's fuse is burning down. */
    get isPrimed() { return this.state === 'primed'; }
    /** True for the brief flash window after detonation. */
    get isExploded() { return this.state === 'exploded'; }

    /**
     * Trigger the fuse if the bomb is still idle. Idempotent — repeated
     * calls during the fuse window have no effect, so multiple balls can
     * camp the trigger zone without resetting the timer.
     */
    prime() {
        if (this.state !== 'idle') return;
        this.state = 'primed';
        this._fuse = this.fuseDuration;
    }

    update(dt) {
        if (!this.active) return;

        if (this.state === 'primed') {
            this._fuse -= dt;
            if (this._fuse <= 0) {
                this.state = 'exploded';
            }
        } else if (this.state === 'exploded') {
            this._explodeAge += dt;
            if (this._explodeAge >= GameConfig.BOMB_EXPLOSION_FLASH_DURATION) {
                this.destroy();
            }
        }
    }

    /**
     * Apply the explosion impulse to every supplied ball that lies inside
     * `explosionRadius`. Returns the list of impacted balls so the caller
     * can react (score, SFX, particles).
     *
     * Should be called exactly once per bomb, the moment it transitions to
     * the `exploded` state. Subsequent calls are safe but apply no force.
     *
     * @param {{x:number,y:number,vx:number,vy:number,active:boolean,
     *          isInHole?:boolean,applyImpulse?:Function}[]} balls
     * @returns {object[]} The balls that received an impulse.
     */
    consume(balls) {
        if (this._consumed) return [];
        this._consumed = true;

        const force   = GameConfig.BOMB_EXPLOSION_FORCE;
        const radius  = this.explosionRadius;
        const radiusSq = radius * radius;
        const hit = [];
        for (const ball of balls) {
            if (!ball.active || ball.isInHole) continue;
            const dx = ball.x - this.x;
            const dy = ball.y - this.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= radiusSq) continue;
            const dist = Math.sqrt(distSq) || 0.0001;
            // Force falloff: full at ground zero, zero at the edge.
            const falloff = 1 - dist / radius;
            const impulse = force * falloff;
            const nx = dx / dist;
            const ny = dy / dist;
            ball.applyImpulse?.(nx * impulse, ny * impulse);
            hit.push(ball);
        }
        return hit;
    }

    render(ctx) {
        if (!this.active) return;

        if (this.state === 'exploded') {
            _drawExplosionFlash(ctx, this.x, this.y, this.explosionRadius, this._explodeAge);
            return;
        }

        // Trigger zone outline — faint, helps the player read the danger field.
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.triggerRadius, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 80, 60, 0.18)';
        ctx.lineWidth   = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.restore();

        // Body
        if (this._sprites?.has(BOMB_SPRITE_KEY)) {
            const d = this.radius * 2;
            this._sprites.draw(ctx, BOMB_SPRITE_KEY, this.x, this.y, d, d);
        } else {
            _drawProceduralBomb(ctx, this.x, this.y, this.radius);
        }

        // Flashing primed indicator
        if (this.state === 'primed') {
            const t = 0.5 + 0.5 * Math.sin(performance.now() * 0.04);
            ctx.save();
            ctx.globalAlpha = 0.4 + 0.6 * t;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 6 + t * 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#ff3322';
            ctx.lineWidth   = 2;
            ctx.stroke();
            ctx.restore();
        }
    }
}

// ---------------------------------------------------------------------------
// Procedural drawing helpers (private)
// ---------------------------------------------------------------------------

function _drawProceduralBomb(ctx, x, y, radius) {
    ctx.save();
    ctx.translate(x, y);

    // Spherical body
    const grad = ctx.createRadialGradient(-radius * 0.35, -radius * 0.35, radius * 0.1, 0, 0, radius);
    grad.addColorStop(0, '#888888');
    grad.addColorStop(1, '#1a1a1a');
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fillStyle   = grad;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Specular dot
    ctx.beginPath();
    ctx.arc(-radius * 0.35, -radius * 0.4, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();

    // Fuse base
    ctx.beginPath();
    ctx.arc(0, -radius * 0.95, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle = '#3a2210';
    ctx.fill();

    // Wick
    ctx.beginPath();
    ctx.moveTo(0, -radius * 0.95);
    ctx.quadraticCurveTo(radius * 0.4, -radius * 1.4, radius * 0.55, -radius * 1.1);
    ctx.strokeStyle = '#ddaa44';
    ctx.lineWidth   = 2;
    ctx.stroke();

    // Spark
    ctx.beginPath();
    ctx.arc(radius * 0.55, -radius * 1.1, radius * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#ffaa22';
    ctx.shadowColor = '#ff6600';
    ctx.shadowBlur  = 8;
    ctx.fill();

    ctx.restore();
}

function _drawExplosionFlash(ctx, x, y, radius, age) {
    const lifetime = GameConfig.BOMB_EXPLOSION_FLASH_DURATION;
    const t = Math.min(1, age / lifetime);
    const r = radius * (0.4 + 0.6 * t);

    ctx.save();
    ctx.globalAlpha = 1 - t;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0,    'rgba(255, 240, 180, 0.95)');
    grad.addColorStop(0.45, 'rgba(255, 140,  40, 0.8)');
    grad.addColorStop(1,    'rgba(255,  40,  20, 0)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
}
