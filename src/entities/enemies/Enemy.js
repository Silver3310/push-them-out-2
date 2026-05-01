import { Ball }       from '../objects/Ball.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

export class Enemy extends Ball {
    constructor(x, y, color, name) {
        super(x, y, GameConfig.ENEMY_RADIUS, GameConfig.ENEMY_MASS);
        this.color  = color;
        this.name   = name;
        this.deaths = 0;
        this.spawnX = x;
        this.spawnY = y;
        this.addTag('enemy');
    }

    die() {
        this.deaths++;
        eventBus.emit(GameEvents.ENEMY_DEATH, { enemy: this });
    }

    respawn() {
        this.x        = this.spawnX;
        this.y        = this.spawnY;
        this.vx       = 0;
        this.vy       = 0;
        this.isInHole = false;
        eventBus.emit(GameEvents.ENEMY_SPAWN, { enemy: this });
    }

    render(ctx) {
        if (this.isInHole) return;
        ctx.save();

        // Glow
        const glow = ctx.createRadialGradient(
            this.x, this.y, this.radius * 0.3,
            this.x, this.y, this.radius * 1.9
        );
        glow.addColorStop(0, this.color + '66');
        glow.addColorStop(1, this.color + '00');
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 1.9, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();

        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold 11px 'Courier New'`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(this.name.toUpperCase(), this.x, this.y - this.radius - 2);

        ctx.restore();
    }
}