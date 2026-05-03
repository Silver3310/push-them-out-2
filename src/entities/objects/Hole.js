import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

export class Hole extends Entity {
    constructor(x, y) {
        super(x, y);
        this.radius        = 20;
        this.pullRadius    = GameConfig.HOLE_PULL_RADIUS;
        this.captureRadius = GameConfig.HOLE_CAPTURE_RADIUS;
        // Set by Game._updateHoleStyles() on dark levels (1, 5, 6) where the
        // black hole opening is almost invisible against the background.
        // null → default dim rendering. Any CSS colour string → accent ring.
        this.accentColor   = null;
        this.addTag('hole');
    }

    checkBall(ball) {
        if (!ball.active || ball.isInHole) return;
        const dist = Math.hypot(this.x - ball.x, this.y - ball.y);

        if (dist < this.captureRadius + ball.radius * 0.3) {
            ball.isInHole = true;
            ball.vx = 0;
            ball.vy = 0;
            ball.x  = this.x;
            ball.y  = this.y;
            eventBus.emit(GameEvents.BALL_FELL_IN_HOLE, { ball, hole: this });
            return;
        }

        if (dist < this.pullRadius) {
            // Gravitational pull that intensifies near the center
            const strength = GameConfig.HOLE_PULL_FORCE * (1 - dist / this.pullRadius);
            const len = dist || 1;
            ball.vx += ((this.x - ball.x) / len) * strength;
            ball.vy += ((this.y - ball.y) / len) * strength;
        }
    }

    render(ctx) {
        ctx.save();

        // Subtle gravity-well glow
        const gradient = ctx.createRadialGradient(
            this.x, this.y, this.captureRadius * 0.5,
            this.x, this.y, this.pullRadius
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0.85)');
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.pullRadius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Hole opening
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#000000';
        ctx.fill();
        ctx.strokeStyle = '#440055';
        ctx.lineWidth   = 2;
        ctx.stroke();

        // Accent ring — drawn on dark levels where the black opening blends
        // into the background. Pulses so it catches the player's eye without
        // being distracting on brighter levels (it's absent by default).
        if (this.accentColor) {
            const pulse = 0.55 + 0.45 * Math.sin(Date.now() * 0.0038);
            ctx.globalAlpha  = pulse;
            ctx.strokeStyle  = this.accentColor;
            ctx.lineWidth    = 2.5;
            ctx.shadowColor  = this.accentColor;
            ctx.shadowBlur   = 14;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 7, 0, Math.PI * 2);
            ctx.stroke();
            // Second, slightly larger ring at half opacity for a halo effect
            ctx.globalAlpha *= 0.45;
            ctx.lineWidth    = 1.5;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 14, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
}