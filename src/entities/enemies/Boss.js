import { Enemy, EnemyAbility } from './Enemy.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

/** Sprite key declared in assets/sprites/sprites.json for the boss image. */
export const BOSS_SPRITE_KEY = 'boss';

/**
 * Lifecycle of the boss's killing-ray attack.
 *   - `IDLE`      : counting down to the next attack.
 *   - `TELEGRAPH` : a thin warning line is visible so the player can dodge.
 *   - `FIRING`    : a thick lethal beam — anything intersecting the segment
 *                   (the player) dies.
 *
 * The ray angle is chosen at the moment the state flips IDLE → TELEGRAPH
 * (aimed at the player's current position) and stays fixed for the rest of
 * the attack — telegraphing means the player has to commit to dodging.
 *
 * @readonly
 * @enum {string}
 */
const RayState = Object.freeze({
    IDLE:      'idle',
    TELEGRAPH: 'telegraph',
    FIRING:    'firing',
});

/**
 * The final-level boss.
 *
 * Inherits the standard enemy abilities (spikes + shooter) and adds two
 * boss-only mechanics that are NOT exposed via `EnemyAbility` because they
 * are bespoke to this class:
 *
 *   - **Dash**      : the
 *                     boss bursts toward them via `dash()`. Driven by
 *                     `BossController`, capped on the boss-side by
 *                     `BOSS_MAX_SPEED` (higher than the player's clamp).
 *   - **Killing ray**: every `BOSS_RAY_INTERVAL` seconds, telegraphs a line
 *                      then flashes a deadly beam along it. Game ticks
 *                      `updateRay()` and consults `rayHits()` per frame to
 *                      kill the player on intersection.
 *
 * Sprite customisation: drop a PNG at `assets/sprites/levels/level6/boss.png`
 * — `LevelConfig.LEVELS[5].spriteOverrides.boss` points there. Missing files
 * fall back to a procedural spiked body, like every other entity.
 */
export class Boss extends Enemy {
    constructor(x, y, color, name, sprites = null) {
        super(x, y, color, name, sprites, {
            abilities:    [EnemyAbility.SPIKED, EnemyAbility.SHOOTER],
            radius:       GameConfig.PLAYER_RADIUS * GameConfig.BOSS_RADIUS_MULT,
            mass:         GameConfig.BOSS_MASS,
            shootInterval: GameConfig.BOSS_SHOOT_INTERVAL,
            spriteKey:    BOSS_SPRITE_KEY,
        });
        this.maxSpeed = GameConfig.BOSS_MAX_SPEED;
        this.addTag('boss');

        // Ray attack timers + state
        this._rayTimer      = GameConfig.BOSS_RAY_INTERVAL;
        this._rayStateTimer = 0;
        this._rayState      = RayState.IDLE;
        // An array of angles rather than a single scalar so the triple-ray
        // variant can store all three beams in the same state machine cycle.
        // Populated from RayState.IDLE → TELEGRAPH and held fixed for the
        // rest of the attack so dodging remains possible.
        this._rayAngles     = [0];
        // Longer than the canvas diagonal → always reaches the far edge.
        this._rayLength     = Math.hypot(
            GameConfig.CANVAS_WIDTH,
            GameConfig.CANVAS_HEIGHT,
        ) * 1.2;
    }

    /**
     * Direct velocity assignment toward a point — bypasses applyImpulse so
     * the dash isn't capped by the regular speed clamp. Friction in
     * `Ball.update` decays the burst naturally over the next few frames.
     */
    dash(toX, toY) {
        const dx = toX - this.x;
        const dy = toY - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.vx = (dx / len) * GameConfig.BOSS_DASH_SPEED;
        this.vy = (dy / len) * GameConfig.BOSS_DASH_SPEED;
        eventBus.emit(GameEvents.BALL_SHOOT, { ball: this, special: true });
    }

    /**
     * Drive the ray attack state machine. Called once per fixed timestep
     * by `BossController`. `target` is the player; the ray angle(s) are
     * locked the moment the state flips IDLE → TELEGRAPH so the player can
     * commit to dodging. With probability `BOSS_TRIPLE_RAY_CHANCE` the boss
     * fires three beams spread `BOSS_RAY_SPREAD` radians apart instead of one.
     */
    updateRay(dt, target) {
        if (this.isInHole || !this.active) return;

        if (this._rayState === RayState.IDLE) {
            this._rayTimer -= dt;
            if (this._rayTimer <= 0 && target) {
                const base = Math.atan2(target.y - this.y, target.x - this.x);
                if (Math.random() < GameConfig.BOSS_TRIPLE_RAY_CHANCE) {
                    const s = GameConfig.BOSS_RAY_SPREAD;
                    this._rayAngles = [base - s, base, base + s];
                } else {
                    this._rayAngles = [base];
                }
                this._rayState = RayState.TELEGRAPH;
                this._rayStateTimer = GameConfig.BOSS_RAY_TELEGRAPH;
                // Emit the moment the warning line lights up — AudioManager
                // turns this into the "charging" SFX so the audio cue lands
                // in lock-step with the visual telegraph.
                eventBus.emit(GameEvents.BOSS_RAY_TELEGRAPH, { boss: this });
            }
        } else if (this._rayState === RayState.TELEGRAPH) {
            this._rayStateTimer -= dt;
            if (this._rayStateTimer <= 0) {
                this._rayState = RayState.FIRING;
                this._rayStateTimer = GameConfig.BOSS_RAY_DURATION;
            }
        } else { // FIRING
            this._rayStateTimer -= dt;
            if (this._rayStateTimer <= 0) {
                this._rayState = RayState.IDLE;
                this._rayTimer = GameConfig.BOSS_RAY_INTERVAL;
            }
        }
    }

    /** True only while the ray is in its lethal "firing" phase. */
    get isRayLethal() {
        return this._rayState === RayState.FIRING;
    }

    /**
     * Test whether `target` intersects ANY of the currently active ray
     * segments. Returns true on the first hit so callers can short-circuit.
     */
    rayHits(target) {
        if (!this.isRayLethal || !target?.active || target.isInHole) return false;
        const ax    = this.x;
        const ay    = this.y;
        const reach = GameConfig.BOSS_RAY_THICKNESS / 2 + (target.radius ?? 0);
        const reachSq = reach * reach;
        for (const angle of this._rayAngles) {
            const bx = ax + Math.cos(angle) * this._rayLength;
            const by = ay + Math.sin(angle) * this._rayLength;
            if (_distanceSqPointToSegment(target.x, target.y, ax, ay, bx, by) <= reachSq) {
                return true;
            }
        }
        return false;
    }

    /**
     * Render the telegraph / firing overlay for all active ray angles.
     * Drawn from `Game._render` AFTER other entities so the deadly flash
     * sits visually above the playfield. No-op while the ray is idle.
     *
     * Both the single-ray and triple-ray variants share the same per-beam
     * drawing code — only the number of iterations differs.
     */
    renderRayOverlay(ctx) {
        if (this._rayState === RayState.IDLE) return;

        ctx.save();
        ctx.lineCap = 'round';

        if (this._rayState === RayState.TELEGRAPH) {
            const elapsed = 1 - this._rayStateTimer / GameConfig.BOSS_RAY_TELEGRAPH;
            // Flicker so it reads as a charging weapon rather than a static line
            ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(elapsed * Math.PI * 8));
            ctx.strokeStyle = '#ff66dd';
            ctx.lineWidth   = 2;
            ctx.shadowColor = '#ff66dd';
            ctx.shadowBlur  = 12;
            for (const angle of this._rayAngles) {
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(
                    this.x + Math.cos(angle) * this._rayLength,
                    this.y + Math.sin(angle) * this._rayLength,
                );
                ctx.stroke();
            }
        } else { // FIRING
            const t = this._rayStateTimer / GameConfig.BOSS_RAY_DURATION;
            for (const angle of this._rayAngles) {
                const bx = this.x + Math.cos(angle) * this._rayLength;
                const by = this.y + Math.sin(angle) * this._rayLength;
                // Outer glow pass
                ctx.globalAlpha = 0.7 + 0.3 * t;
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth   = GameConfig.BOSS_RAY_THICKNESS;
                ctx.shadowColor = '#ff66dd';
                ctx.shadowBlur  = 36;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(bx, by);
                ctx.stroke();
                // Bright inner core pass
                ctx.globalAlpha = 1;
                ctx.strokeStyle = '#ffd0ff';
                ctx.lineWidth   = GameConfig.BOSS_RAY_THICKNESS * 0.4;
                ctx.shadowBlur  = 12;
                ctx.beginPath();
                ctx.moveTo(this.x, this.y);
                ctx.lineTo(bx, by);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}

/**
 * Squared distance from a point to a finite line segment.
 * Squared on purpose — collision tests compare against `reach * reach`.
 */
function _distanceSqPointToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        const ex = px - ax;
        const ey = py - ay;
        return ex * ex + ey * ey;
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = ax + t * dx;
    const projY = ay + t * dy;
    const ex = px - projX;
    const ey = py - projY;
    return ex * ex + ey * ey;
}
