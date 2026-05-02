import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

export class Ball extends Entity {
    constructor(x, y, radius = GameConfig.PLAYER_RADIUS, mass = 1.0) {
        super(x, y);
        this.radius   = radius;
        this.mass     = mass;
        this.vx       = 0;
        this.vy       = 0;
        this.color    = '#ffffff';
        this.name     = '';
        this.isInHole = false;
        // Per-instance speed cap. Subclasses (e.g. Boss) override to allow
        // bursts faster than the global PLAYER_MAX_SPEED clamp.
        this.maxSpeed = GameConfig.PLAYER_MAX_SPEED;
        this.addTag('ball');
    }

    get speed() {
        return Math.hypot(this.vx, this.vy);
    }

    applyImpulse(ix, iy) {
        this.vx += ix / this.mass;
        this.vy += iy / this.mass;
        // Clamp to per-instance max speed
        const s = this.speed;
        if (s > this.maxSpeed) {
            const scale = this.maxSpeed / s;
            this.vx *= scale;
            this.vy *= scale;
        }
    }

    update(_dt) {
        if (this.isInHole) return;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= GameConfig.FRICTION;
        this.vy *= GameConfig.FRICTION;
        // Kill micro-velocities so balls fully stop
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
        if (Math.abs(this.vy) < 0.01) this.vy = 0;
    }

    render(ctx) {
        if (this.isInHole) return;
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        if (this.name) {
            ctx.fillStyle    = '#ffffff';
            ctx.font         = `bold ${Math.max(10, this.radius * 0.7)}px 'Courier New'`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(this.name.toUpperCase(), this.x, this.y - this.radius - 2);
        }
        ctx.restore();
    }
}