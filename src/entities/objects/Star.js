import { Ball }       from './Ball.js';
import { GameConfig } from '../../core/GameConfig.js';

/**
 * Collectible star entity.
 *
 * Participates in full ball physics so it can be pushed around by enemies and
 * captured by holes, making it challenging for the player to collect.
 * The player collects a star by touching it (proximity check in Game._collectStars).
 */
export class Star extends Ball {
    constructor(x, y) {
        super(x, y, GameConfig.STAR_RADIUS, GameConfig.STAR_MASS);
        this.color  = '#ffd700';
        this._angle = Math.random() * Math.PI * 2; // random start rotation
        this.addTag('star');
    }

    update(dt) {
        super.update(dt);
        this._angle += dt * 1.8; // slow spin
    }

    render(ctx) {
        if (!this.active || this.isInHole) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this._angle);

        // Ambient glow
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 2.8);
        glow.addColorStop(0, 'rgba(255, 220, 0, 0.45)');
        glow.addColorStop(1, 'rgba(255, 180, 0, 0)');
        ctx.beginPath();
        ctx.arc(0, 0, this.radius * 2.8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Star body
        ctx.beginPath();
        _starPath(ctx, 0, 0, this.radius, this.radius * 0.42, 5);
        ctx.fillStyle   = '#ffd700';
        ctx.shadowColor = '#ffe866';
        ctx.shadowBlur  = 10;
        ctx.fill();

        // Specular highlight (offset slightly up-left)
        ctx.beginPath();
        _starPath(ctx, -this.radius * 0.18, -this.radius * 0.18, this.radius * 0.38, this.radius * 0.16, 5);
        ctx.fillStyle  = 'rgba(255, 255, 210, 0.45)';
        ctx.shadowBlur = 0;
        ctx.fill();

        ctx.restore();
    }
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
