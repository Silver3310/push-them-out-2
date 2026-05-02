import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/**
 * @typedef {object} BulletOptions
 * @property {'player'|'enemy'} [kind='player']
 *     Distinguishes player-fired bullets (which push enemies) from
 *     enemy-fired bullets (which push the player). Game._updateBullets
 *     branches on this value.
 * @property {string} [color]
 *     CSS hex colour driving the procedural glow + core. Defaults to a
 *     warm yellow for player shots and a magenta for enemy shots.
 */

const _DEFAULT_COLORS = Object.freeze({
    player: '#ffc864',
    enemy:  '#ff66cc',
});

export class Bullet extends Entity {
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} vx
     * @param {number} vy
     * @param {BulletOptions} [options]
     */
    constructor(x, y, vx, vy, options = {}) {
        super(x, y);
        this.radius = GameConfig.BULLET_RADIUS;
        this.vx = vx;
        this.vy = vy;
        this.lifetime = GameConfig.BULLET_LIFETIME;
        this.prevX = x;
        this.prevY = y;

        this.kind  = options.kind  ?? 'player';
        this.color = options.color ?? _DEFAULT_COLORS[this.kind] ?? _DEFAULT_COLORS.player;

        this.addTag('bullet');
        this.addTag(this.kind === 'enemy' ? 'enemy_bullet' : 'player_bullet');
    }

    update(dt) {
        if (!this.active) return;

        // Store previous position for swept collision detection
        this.prevX = this.x;
        this.prevY = this.y;

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Decrease lifetime
        this.lifetime -= dt;
        if (this.lifetime <= 0) {
            this.destroy();
        }
    }

    render(ctx) {
        if (!this.active) return;
        ctx.save();

        const alpha = Math.max(0, this.lifetime / GameConfig.BULLET_LIFETIME);
        const [r, g, b] = _hexToRgb(this.color);

        // Glow effect — outer halo using bullet's tint
        const glow = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 2.5
        );
        glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.6})`);
        glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Bullet core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        ctx.fill();

        // Bright highlight (white-ish, scaled by base colour for warmth)
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.4, this.y - this.radius * 0.4, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
        ctx.fill();

        ctx.restore();
    }

    isOutOfBounds(width, height) {
        return this.x < -this.radius ||
               this.x > width + this.radius ||
               this.y < -this.radius ||
               this.y > height + this.radius;
    }
}

function _hexToRgb(hex) {
    return [
        parseInt(hex.slice(1, 3), 16),
        parseInt(hex.slice(3, 5), 16),
        parseInt(hex.slice(5, 7), 16),
    ];
}
