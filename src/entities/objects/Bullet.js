import { Entity }      from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

export class Bullet extends Entity {
    constructor(x, y, vx, vy) {
        super(x, y);
        this.radius = GameConfig.BULLET_RADIUS;
        this.vx = vx;
        this.vy = vy;
        this.lifetime = GameConfig.BULLET_LIFETIME;
        this.prevX = x;
        this.prevY = y;
        this.addTag('bullet');
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
        
        // Draw bullet trail (fading)
        const alpha = Math.max(0, this.lifetime / GameConfig.BULLET_LIFETIME);
        
        // Glow effect
        const glow = ctx.createRadialGradient(
            this.x, this.y, 0,
            this.x, this.y, this.radius * 2.5
        );
        glow.addColorStop(0, `rgba(255, 200, 100, ${alpha * 0.6})`);
        glow.addColorStop(1, `rgba(255, 200, 100, 0)`);
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
        
        // Bullet core
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 100, ${alpha})`;
        ctx.fill();
        
        // Bright highlight
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.4, this.y - this.radius * 0.4, this.radius * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 200, ${alpha * 0.8})`;
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
