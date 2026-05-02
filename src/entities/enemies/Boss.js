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
 *   - **Dash**      : when the player crosses `BOSS_DASH_TRIGGER_DIST`, the
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
        this._rayAngle      = 0;
        // A ray longer than the canvas diagonal guarantees we always reach
        // the far edge regardless of where the boss happens to be.
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
     * by `BossController`. `target` is the player; the ray is aimed at
     * its position the moment the telegraph begins and does NOT track
     * afterwards (so dodging works).
     */
    updateRay(dt, target) {
        if (this.isInHole || !this.active) return;

        if (this._rayState === RayState.IDLE) {
            this._rayTimer -= dt;
            if (this._rayTimer <= 0 && target) {
                this._rayAngle = Math.atan2(target.y - this.y, target.x - this.x);
                this._rayState = RayState.TELEGRAPH;
                this._rayStateTimer = GameConfig.BOSS_RAY_TELEGRAPH;
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
     * Test whether `target` (any entity with x/y/radius) intersects the
     * lethal ray segment. Cheap point-to-segment distance vs. half the
     * configured ray thickness plus the target radius.
     */
    rayHits(target) {
        if (!this.isRayLethal || !target?.active || target.isInHole) return false;
        const ax = this.x;
        const ay = this.y;
        const bx = ax + Math.cos(this._rayAngle) * this._rayLength;
        const by = ay + Math.sin(this._rayAngle) * this._rayLength;
        const reach = GameConfig.BOSS_RAY_THICKNESS / 2 + (target.radius ?? 0);
        return _distanceSqPointToSegment(target.x, target.y, ax, ay, bx, by) <= reach * reach;
    }

    /**
     * Render the telegraph / firing overlay. Drawn from `Game._render` AFTER
     * other entities so the deadly flash sits visually above the playfield.
     * No-op while the ray is idle.
     */
    renderRayOverlay(ctx) {
        if (this._rayState === RayState.IDLE) return;

        const ax = this.x;
        const ay = this.y;
        const bx = ax + Math.cos(this._rayAngle) * this._rayLength;
        const by = ay + Math.sin(this._rayAngle) * this._rayLength;

        ctx.save();
        if (this._rayState === RayState.TELEGRAPH) {
            // Flicker so it reads as a charging weapon rather than a static line
            const elapsed = 1 - this._rayStateTimer / GameConfig.BOSS_RAY_TELEGRAPH;
            ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(elapsed * Math.PI * 8));
            ctx.strokeStyle = '#ff66dd';
            ctx.lineWidth   = 2;
            ctx.shadowColor = '#ff66dd';
            ctx.shadowBlur  = 12;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
        } else { // FIRING
            // Outer glow
            const t = this._rayStateTimer / GameConfig.BOSS_RAY_DURATION;
            ctx.globalAlpha = 0.7 + 0.3 * t;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth   = GameConfig.BOSS_RAY_THICKNESS;
            ctx.shadowColor = '#ff66dd';
            ctx.shadowBlur  = 36;
            ctx.lineCap     = 'round';
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
            // Bright inner core
            ctx.globalAlpha = 1;
            ctx.strokeStyle = '#ffd0ff';
            ctx.lineWidth   = GameConfig.BOSS_RAY_THICKNESS * 0.4;
            ctx.shadowBlur  = 12;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
            ctx.stroke();
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
