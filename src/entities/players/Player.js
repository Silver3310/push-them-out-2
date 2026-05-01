import { Ball }       from '../objects/Ball.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

export class Player extends Ball {
    constructor(x, y, color, name) {
        super(x, y, GameConfig.PLAYER_RADIUS, GameConfig.PLAYER_MASS);
        this.color   = color;
        this.name    = name;
        this.deaths  = 0;
        this.spawnX  = x;
        this.spawnY  = y;
        this.specialCooldown = 0;
        this.addTag('player');
    }

    die() {
        this.deaths++;
        eventBus.emit(GameEvents.PLAYER_DEATH, { player: this });
    }

    respawn() {
        this.x        = this.spawnX;
        this.y        = this.spawnY;
        this.vx       = 0;
        this.vy       = 0;
        this.isInHole = false;
        eventBus.emit(GameEvents.PLAYER_SPAWN, { player: this });
    }

    update(dt) {
        super.update(dt);
        if (this.specialCooldown > 0) this.specialCooldown -= dt;
    }

    render(ctx) {
        if (this.isInHole) return;
        ctx.save();

        // Soft glow halo
        const glow = ctx.createRadialGradient(
            this.x, this.y, this.radius * 0.3,
            this.x, this.y, this.radius * 1.9
        );
        glow.addColorStop(0, this.color + '88');
        glow.addColorStop(1, this.color + '00');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Ball body
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        // Specular highlight
        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fill();

        // Name label above ball
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold 11px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.name.toUpperCase(), this.x, this.y - this.radius - 2);

        // Special cooldown arc indicator
        if (this.specialCooldown > 0) {
            const progress = this.specialCooldown / 3.0;
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.strokeStyle = '#ffcc00';
            ctx.lineWidth   = 2;
            ctx.stroke();
        }

        ctx.restore();
    }
}