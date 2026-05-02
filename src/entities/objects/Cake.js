import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/** Sprite key used in assets/sprites/sprites.json for the cake pickup. */
export const CAKE_SPRITE_KEY = 'cake';

/**
 * Cake hazard – a tasty trap. Same physical size as the player.
 *
 * On player contact:
 *
 *   1. The cake is consumed (destroyed).
 *   2. The player gains the "fat & slow" status for
 *      `GameConfig.CAKE_SLOW_DURATION` seconds.
 *
 * Cakes are static (no velocity, no physics participation). They sit on
 * the play field until the player walks into them. AI enemies ignore
 * cakes — only the player can be tempted into eating one.
 *
 * ### Rendering precedence
 *
 *   1. SpriteManager-based draw if `cake` is loaded.
 *   2. Procedural canvas cupcake fallback so the game runs zero-asset.
 *
 * Customise the look:
 *
 *   sprites.swapSprite('cake', 'assets/sprites/objects/my_cake.png')
 */
export class Cake extends Entity {
    /**
     * @param {number}             x
     * @param {number}             y
     * @param {SpriteManager|null} sprites
     */
    constructor(x, y, sprites = null) {
        super(x, y);
        this._sprites = sprites;
        // Same physical size as the player so the visual "swallow it whole"
        // moment matches the contact check radius.
        this.radius   = GameConfig.PLAYER_RADIUS;
        this._wobble  = Math.random() * Math.PI * 2;
        this.addTag('cake');
    }

    update(dt) {
        if (!this.active) return;
        this._wobble += dt * 3.2;
    }

    render(ctx) {
        if (!this.active) return;

        // Subtle hover wobble — pure cosmetic, doesn't move the hitbox.
        const dy = Math.sin(this._wobble) * 1.4;

        ctx.save();
        ctx.translate(this.x, this.y + dy);

        // Soft pink "smell" glow underneath cues the pickup nature.
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2.2);
        glow.addColorStop(0, 'rgba(255, 180, 220, 0.45)');
        glow.addColorStop(1, 'rgba(255, 100, 180, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        if (this._sprites?.has(CAKE_SPRITE_KEY)) {
            const d = this.radius * 2;
            this._sprites.draw(ctx, CAKE_SPRITE_KEY, 0, 0, d, d);
        } else {
            _drawProceduralCake(ctx, this.radius);
        }

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Procedural drawing helper (private)
// ---------------------------------------------------------------------------

function _drawProceduralCake(ctx, radius) {
    // Cupcake silhouette: brown wrapper, pink frosting dome, red cherry on top.

    // Wrapper (trapezoid)
    ctx.beginPath();
    ctx.moveTo(-radius * 0.85,  radius * 0.85);
    ctx.lineTo( radius * 0.85,  radius * 0.85);
    ctx.lineTo( radius * 0.65,  radius * 0.15);
    ctx.lineTo(-radius * 0.65,  radius * 0.15);
    ctx.closePath();
    ctx.fillStyle   = '#8a4a2a';
    ctx.strokeStyle = '#5a2c14';
    ctx.lineWidth   = 1.5;
    ctx.fill();
    ctx.stroke();

    // Wrapper fluting
    ctx.strokeStyle = '#5a2c14';
    ctx.lineWidth   = 1;
    for (let i = -3; i <= 3; i++) {
        const fx = (i / 3) * radius * 0.7;
        ctx.beginPath();
        ctx.moveTo(fx,  radius * 0.85);
        ctx.lineTo(fx * 0.78,  radius * 0.15);
        ctx.stroke();
    }

    // Frosting dome
    ctx.beginPath();
    ctx.moveTo(-radius * 0.7, radius * 0.15);
    ctx.bezierCurveTo(
        -radius * 0.9, -radius * 0.6,
         radius * 0.9, -radius * 0.6,
         radius * 0.7,  radius * 0.15
    );
    ctx.closePath();
    const frosting = ctx.createLinearGradient(0, -radius * 0.6, 0, radius * 0.15);
    frosting.addColorStop(0, '#ffd6e8');
    frosting.addColorStop(1, '#ff7fb1');
    ctx.fillStyle   = frosting;
    ctx.strokeStyle = '#cc4477';
    ctx.lineWidth   = 1.2;
    ctx.fill();
    ctx.stroke();

    // Sprinkles
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI + (i / 4) * Math.PI;
        const r = radius * 0.45;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 0.7, -radius * 0.15 + Math.sin(a) * r * 0.4, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Cherry
    ctx.beginPath();
    ctx.arc(0, -radius * 0.55, radius * 0.18, 0, Math.PI * 2);
    ctx.fillStyle   = '#e22244';
    ctx.strokeStyle = '#7a0c1c';
    ctx.lineWidth   = 1;
    ctx.fill();
    ctx.stroke();

    // Cherry highlight
    ctx.beginPath();
    ctx.arc(-radius * 0.06, -radius * 0.62, radius * 0.06, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fill();
}
