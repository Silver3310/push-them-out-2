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
        // Brief grace window after respawn — prevents instant re-kill from
        // spiked enemies sitting on the spawn point or lingering boss rays.
        this._invulnTimer = 0;

        // Cake-induced "fat & slow" status. While `_fatTimer > 0` the
        // player's render radius and collision radius are scaled up and
        // their thrust / max-speed are scaled down.
        this._fatTimer  = 0;
        this._baseRadius   = GameConfig.PLAYER_RADIUS;
        this._baseMaxSpeed = GameConfig.PLAYER_MAX_SPEED;
        this.addTag('player');
    }

    /** True while the post-respawn grace window has not expired. */
    get isInvulnerable() {
        return this._invulnTimer > 0;
    }

    /** True while the player is under the "ate a cake" status effect. */
    get isFat() {
        return this._fatTimer > 0;
    }

    /**
     * Multiplier applied to thrust input while fat/slow. PlayerController
     * reads this so WASD movement feels sluggish in a way that mirrors
     * the visual size change.
     */
    get movementMultiplier() {
        return this.isFat ? GameConfig.CAKE_SLOW_MULTIPLIER : 1;
    }

    /**
     * Apply (or refresh) the cake-induced fat & slow status. Touching
     * another cake while still fat extends the timer to whichever is
     * later — it never shortens an existing slowdown.
     *
     * @param {number} duration  Duration in seconds.
     */
    applyFatSlow(duration) {
        this._fatTimer = Math.max(this._fatTimer, duration);
        // Snap the runtime parameters straight away so the very next
        // physics tick already sees the larger body and lower cap.
        this.radius   = this._baseRadius   * GameConfig.CAKE_FAT_RADIUS_MULTIPLIER;
        this.maxSpeed = this._baseMaxSpeed * GameConfig.CAKE_SLOW_MULTIPLIER;
        eventBus.emit(GameEvents.PLAYER_ATE_CAKE, { player: this, duration });
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
        this._invulnTimer = GameConfig.PLAYER_RESPAWN_INVULN;
        // Fresh respawn always clears any cake debuff.
        this._clearFatStatus();
        eventBus.emit(GameEvents.PLAYER_SPAWN, { player: this });
    }

    update(dt) {
        super.update(dt);
        if (this.specialCooldown > 0) this.specialCooldown -= dt;
        if (this._invulnTimer > 0)    this._invulnTimer    -= dt;
        if (this._fatTimer > 0) {
            this._fatTimer -= dt;
            if (this._fatTimer <= 0) this._clearFatStatus();
        }
    }

    /** Restore base radius / max speed when the cake debuff expires. */
    _clearFatStatus() {
        this._fatTimer = 0;
        this.radius    = this._baseRadius;
        this.maxSpeed  = this._baseMaxSpeed;
    }

    render(ctx) {
        if (this.isInHole) return;
        ctx.save();

        // Flicker while invulnerable so the player can read the grace window
        if (this.isInvulnerable) {
            ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(performance.now() * 0.018));
        }

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

        // Frosting outline cues "you ate a cake" while the debuff is active.
        if (this.isFat) {
            const pulse = 0.35 + 0.35 * Math.abs(Math.sin(performance.now() * 0.008));
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.radius + 2, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 200, 230, ${pulse + 0.4})`;
            ctx.lineWidth   = 3;
            ctx.stroke();
        }

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
