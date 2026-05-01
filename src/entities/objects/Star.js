import { Ball }       from './Ball.js';
import { GameConfig } from '../../core/GameConfig.js';

/** Sprite key used in assets/sprites/sprites.json for the collectible star. */
export const STAR_SPRITE_KEY = 'star_collectible';

/**
 * Collectible star entity.
 *
 * Participates in full ball physics so it can be pushed around by enemies and
 * captured by holes, making it challenging for the player to collect.
 * The player collects a star by touching it (proximity check in Game._collectStars).
 *
 * Rendering precedence:
 *   1. If a SpriteManager is provided AND the "star_collectible" PNG is loaded,
 *      the sprite is drawn (rotated) with an ambient glow halo underneath.
 *      Swap the image at any time via:
 *        sprites.swapSprite('star_collectible', 'assets/sprites/objects/my_star.png')
 *   2. Otherwise the star is drawn procedurally with canvas arcs, so the game
 *      works out-of-the-box with no asset files.
 *
 * @param {number}         x       - Initial x position.
 * @param {number}         y       - Initial y position.
 * @param {SpriteManager|null} sprites - Optional sprite manager for PNG rendering.
 */
export class Star extends Ball {
    constructor(x, y, sprites = null) {
        super(x, y, GameConfig.STAR_RADIUS, GameConfig.STAR_MASS);
        this.color   = '#ffd700';
        this._angle  = Math.random() * Math.PI * 2; // random start rotation
        this._sprites = sprites;
        this.addTag('star');
    }

    update(dt) {
        super.update(dt);
        this._angle += dt * 1.8; // slow spin
    }

    render(ctx) {
        if (!this.active || this.isInHole) return;

        // Ambient glow is always drawn regardless of sprite vs canvas path
        _drawGlow(ctx, this.x, this.y, this.radius);

        if (this._sprites?._cache.has(STAR_SPRITE_KEY)) {
            // Sprite path — rotate around the star's centre, same spin rate
            this._sprites.draw(
                ctx,
                STAR_SPRITE_KEY,
                this.x, this.y,
                GameConfig.STAR_RADIUS * 2,  // draw at diameter width …
                GameConfig.STAR_RADIUS * 2,  // … and height
                { rotation: this._angle },
            );
        } else {
            // Procedural fallback — canvas-drawn 5-point star
            _drawCanvasStar(ctx, this.x, this.y, this.radius, this._angle);
        }
    }
}

// ---------------------------------------------------------------------------
// Private drawing helpers (module-scoped, not exported)
// ---------------------------------------------------------------------------

function _drawGlow(ctx, x, y, radius) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 2.8);
    glow.addColorStop(0, 'rgba(255, 220, 0, 0.45)');
    glow.addColorStop(1, 'rgba(255, 180, 0, 0)');
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.8, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
}

function _drawCanvasStar(ctx, x, y, radius, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Star body
    ctx.beginPath();
    _starPath(ctx, 0, 0, radius, radius * 0.42, 5);
    ctx.fillStyle   = '#ffd700';
    ctx.shadowColor = '#ffe866';
    ctx.shadowBlur  = 10;
    ctx.fill();

    // Specular highlight (offset slightly up-left)
    ctx.beginPath();
    _starPath(ctx, -radius * 0.18, -radius * 0.18, radius * 0.38, radius * 0.16, 5);
    ctx.fillStyle  = 'rgba(255, 255, 210, 0.45)';
    ctx.shadowBlur = 0;
    ctx.fill();

    ctx.restore();
}

/**
 * Trace a 5-point star path onto ctx.
 * Points alternate between outerR and innerR starting at the top (−90°).
 */
function _starPath(ctx, cx, cy, outerR, innerR, points) {
    const step = Math.PI / points; // 36° per vertex
    for (let i = 0; i < points * 2; i++) {
        const r     = i % 2 === 0 ? outerR : innerR;
        const angle = -Math.PI / 2 + i * step;
        const x     = cx + Math.cos(angle) * r;
        const y     = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
}
