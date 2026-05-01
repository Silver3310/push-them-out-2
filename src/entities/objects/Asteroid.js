import { Ball }       from './Ball.js';
import { GameConfig } from '../../core/GameConfig.js';

/** Sprite key used in assets/sprites/sprites.json for the asteroid. */
export const ASTEROID_SPRITE_KEY = 'asteroid';

/**
 * Asteroid entity – travels in a fixed diagonal trajectory from the top of the
 * canvas toward the bottom.
 *
 * Unlike regular Ball entities:
 *  - It ignores friction; its velocity is constant after spawn.
 *  - It does NOT participate in the standard Physics.update() ball-ball
 *    resolution loop, so it is never deflected by players, enemies, or stars.
 *  - On first contact with a player, enemy, or star it destroys both the
 *    target and itself (handled externally by Game._updateAsteroids).
 *
 * Rendering precedence:
 *   1. If "asteroid" PNG is present in sprites.json the image is drawn
 *      rotating (tumbling) around the asteroid's centre.
 *      Swap the asset at runtime:
 *        sprites.swapSprite('asteroid', 'assets/sprites/objects/my_rock.png')
 *   2. Otherwise a procedural rocky polygon is drawn as a zero-dependency
 *      fallback so the game works with no asset files.
 *
 * @param {number}             x       - Initial x (may be above the canvas).
 * @param {number}             y       - Initial y (may be above the canvas).
 * @param {number}             vx      - Horizontal velocity (px/frame at 60 fps).
 * @param {number}             vy      - Vertical velocity (px/frame, positive = downward).
 * @param {SpriteManager|null} sprites - Optional sprite manager for PNG rendering.
 */
export class Asteroid extends Ball {
    constructor(x, y, vx, vy, sprites = null) {
        super(x, y, GameConfig.ASTEROID_RADIUS, GameConfig.ASTEROID_MASS);
        this.vx       = vx;
        this.vy       = vy;
        this._sprites = sprites;
        this._angle   = Math.random() * Math.PI * 2;
        this._spin    = (Math.random() - 0.5) * 0.04; // slow visual tumble
        this.addTag('asteroid');
    }

    /**
     * Move at constant velocity – no friction, no hole gravity.
     * The fixed timestep dt is unused because motion is authored per-frame
     * (vx/vy are already pixels-per-frame values).
     */
    update(_dt) {
        if (!this.active) return;
        this.x += this.vx;
        this.y += this.vy;
        this._angle += this._spin;
    }

    /**
     * Returns true once the asteroid has fully exited the canvas so the
     * manager can drop it from the active list.
     * @param {number} W - Canvas width.
     * @param {number} H - Canvas height.
     */
    isOutOfBounds(W, H) {
        const r = this.radius;
        return (
            this.x < -r * 2   ||
            this.x > W + r * 2 ||
            this.y < -r * 2   ||
            this.y > H + r * 2
        );
    }

    render(ctx) {
        if (!this.active) return;

        if (this._sprites?.has(ASTEROID_SPRITE_KEY)) {
            const d = this.radius * 2;
            this._sprites.draw(ctx, ASTEROID_SPRITE_KEY, this.x, this.y, d, d, {
                rotation: this._angle,
            });
        } else {
            _drawProceduralAsteroid(ctx, this.x, this.y, this.radius, this._angle);
        }
    }
}

// ---------------------------------------------------------------------------
// Procedural fallback renderer (no external assets required)
// ---------------------------------------------------------------------------

function _drawProceduralAsteroid(ctx, x, y, radius, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Soft fiery glow
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.9);
    glow.addColorStop(0,   'rgba(255, 130, 30, 0.40)');
    glow.addColorStop(0.5, 'rgba(255,  60, 10, 0.18)');
    glow.addColorStop(1,   'rgba(255,  30,  0, 0)');
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    // Rocky irregular polygon – jitter is deterministic (stable across frames)
    const verts = 9;
    ctx.beginPath();
    for (let i = 0; i < verts; i++) {
        const a      = (i / verts) * Math.PI * 2;
        const jitter = 0.72 + ((i * 13) % 7) / 25; // 0.72 – 1.00
        const r      = radius * jitter;
        i === 0
            ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r)
            : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle   = '#7a6a58';
    ctx.strokeStyle = '#3d3028';
    ctx.lineWidth   = 2;
    ctx.fill();
    ctx.stroke();

    // Surface crack detail for a bit of texture
    ctx.beginPath();
    ctx.moveTo(-radius * 0.30, -radius * 0.10);
    ctx.lineTo( radius * 0.10,  radius * 0.35);
    ctx.strokeStyle = 'rgba(50, 35, 20, 0.65)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.restore();
}
