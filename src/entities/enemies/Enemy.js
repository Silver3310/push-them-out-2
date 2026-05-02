import { Ball }       from '../objects/Ball.js';
import { Bullet }     from '../objects/Bullet.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

/** Sprite key used in assets/sprites/sprites.json for the enemy ball. */
export const ENEMY_SPRITE_KEY = 'enemy_ball';

/**
 * Enumeration of enemy abilities. Each level's `enemies.abilities` list in
 * `LevelConfig.js` is a subset of these strings — they are stringly-typed
 * by intent so the level-config file stays readable.
 *
 *   - `SPIKED`   Touching the enemy kills the player.
 *   - `SHOOTER`  Periodically fires bullets that push the player around.
 *
 * Both abilities are rendered with extra visual cues (spike triangles, a
 * targeting ring while the gun is ready) so the player can read the threat
 * before getting close.
 *
 * @readonly
 * @enum {string}
 */
export const EnemyAbility = Object.freeze({
    SPIKED:  'spiked',
    SHOOTER: 'shooter',
});

/**
 * @typedef {object} EnemyOptions
 * @property {number}                     [radius]         Override default radius.
 * @property {number}                     [mass]           Override default mass.
 * @property {string[]|EnemyAbility[]}    [abilities]      Subset of EnemyAbility.
 * @property {number}                     [shootInterval]  Seconds between shots
 *                                                         (only meaningful when
 *                                                         the SHOOTER ability is set).
 * @property {string}                     [spriteKey]      Sprite-manager key used
 *                                                         for the body image. Defaults
 *                                                         to 'enemy_ball'; subclasses
 *                                                         like Boss override it.
 */

/**
 * AI-controlled antagonist ball.
 *
 * ### Rendering precedence
 *
 *   1. If a SpriteManager is provided AND the configured sprite key (default
 *      "enemy_ball") is loaded, the sprite is drawn over the team-colour
 *      glow. Per-level art swaps are handled transparently — `LevelManager`
 *      calls `SpriteManager.swapSprite('enemy_ball', …)` during transitions
 *      and this entity picks up the new image on the next render. Drop a
 *      replacement PNG at `assets/sprites/levels/levelN/enemy_ball.png` to
 *      customise the look per level.
 *   2. Otherwise the ball is drawn procedurally so the game works without
 *      any asset files.
 *
 * Glow halo, spikes (when the SPIKED ability is set), the targeting ring
 * (when the SHOOTER cooldown is ready), and the floating name label are
 * always drawn from canvas primitives so the visual language for "this
 * enemy is dangerous" stays legible regardless of the active sprite.
 */
export class Enemy extends Ball {
    /**
     * @param {number}        x
     * @param {number}        y
     * @param {string}        color   Tint colour (sprite glow + procedural body).
     * @param {string}        name    Floating label.
     * @param {SpriteManager|null} sprites
     * @param {EnemyOptions}  [options]
     */
    constructor(x, y, color, name, sprites = null, options = {}) {
        const radius = options.radius ?? GameConfig.ENEMY_RADIUS;
        const mass   = options.mass   ?? GameConfig.ENEMY_MASS;
        super(x, y, radius, mass);

        this.color    = color;
        this.name     = name;
        this.deaths   = 0;
        this.spawnX   = x;
        this.spawnY   = y;
        this._sprites = sprites;
        this._spriteKey = options.spriteKey ?? ENEMY_SPRITE_KEY;

        const abilities = options.abilities ?? [];
        this.abilities = new Set(abilities);
        // Promote abilities to entity tags so other systems can query them
        // through the existing `hasTag('spiked')` / `hasTag('shooter')` API.
        if (this.abilities.has(EnemyAbility.SPIKED))  this.addTag('spiked');
        if (this.abilities.has(EnemyAbility.SHOOTER)) this.addTag('shooter');

        this.shootInterval  = options.shootInterval ?? GameConfig.ENEMY_SHOOT_INTERVAL;
        // Start with a full cooldown so freshly-spawned enemies don't snipe
        // the player on frame zero of a level.
        this._shootCooldown = this.shootInterval;

        this.addTag('enemy');
    }

    update(dt) {
        super.update(dt);
        if (this.abilities.has(EnemyAbility.SHOOTER) && this._shootCooldown > 0) {
            this._shootCooldown -= dt;
        }
    }

    /** True when the shooter cooldown has elapsed and the enemy can fire. */
    get canFire() {
        return this.abilities.has(EnemyAbility.SHOOTER)
            && this._shootCooldown <= 0
            && this.active
            && !this.isInHole;
    }

    /**
     * Construct an enemy bullet aimed at `target` and reset the shoot
     * cooldown. Returns `null` if the enemy is not currently able to fire —
     * caller checks `canFire` first to avoid the allocation.
     *
     * @param {{x: number, y: number}} target
     * @returns {Bullet|null}
     */
    fireAt(target) {
        if (!this.canFire || !target) return null;
        this._shootCooldown = this.shootInterval;

        const dx  = target.x - this.x;
        const dy  = target.y - this.y;
        const len = Math.hypot(dx, dy) || 1;
        const speed = GameConfig.ENEMY_BULLET_SPEED;
        // Spawn the bullet just outside the enemy so it isn't immediately
        // re-collided with by the firing entity.
        const muzzleOffset = this.radius + GameConfig.BULLET_RADIUS + 2;

        const bullet = new Bullet(
            this.x + (dx / len) * muzzleOffset,
            this.y + (dy / len) * muzzleOffset,
            (dx / len) * speed,
            (dy / len) * speed,
            { kind: 'enemy' },
        );

        eventBus.emit(GameEvents.BALL_SHOOT, { ball: this });
        return bullet;
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
        this._shootCooldown = this.shootInterval;
        eventBus.emit(GameEvents.ENEMY_SPAWN, { enemy: this });
    }

    render(ctx) {
        if (this.isInHole) return;

        // Coloured glow halo — drawn for both sprite and procedural paths so
        // team identity reads even when the sprite is mid cross-fade.
        _drawGlow(ctx, this.x, this.y, this.radius, this.color);

        // Spikes are rendered UNDER the body so they read as attached barbs
        // rather than detached triangles floating around the ball.
        if (this.abilities.has(EnemyAbility.SPIKED)) {
            _drawSpikes(ctx, this.x, this.y, this.radius, this.color);
        }

        if (this._sprites?.has(this._spriteKey)) {
            const d = this.radius * 2;
            this._sprites.draw(ctx, this._spriteKey, this.x, this.y, d, d);
        } else {
            _drawCanvasBall(ctx, this.x, this.y, this.radius, this.color);
        }

        // Subtle ring telegraphing "weapon is hot, will fire soon"
        if (this.abilities.has(EnemyAbility.SHOOTER) && this._shootCooldown <= 0) {
            _drawTargetingRing(ctx, this.x, this.y, this.radius);
        }

        _drawNameLabel(ctx, this.x, this.y, this.radius, this.name);
    }
}

// ---------------------------------------------------------------------------
// Module-level drawing helpers (private)
// ---------------------------------------------------------------------------

function _drawGlow(ctx, x, y, radius, color) {
    ctx.save();
    const glow = ctx.createRadialGradient(
        x, y, radius * 0.3,
        x, y, radius * 1.9,
    );
    glow.addColorStop(0, color + '66');
    glow.addColorStop(1, color + '00');
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.9, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
}

function _drawCanvasBall(ctx, x, y, radius, color) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
    ctx.restore();
}

function _drawNameLabel(ctx, x, y, radius, name) {
    ctx.save();
    ctx.fillStyle    = '#ffffff';
    ctx.font         = `bold 11px 'Courier New'`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(name.toUpperCase(), x, y - radius - 2);
    ctx.restore();
}

/**
 * Draw a ring of triangular spikes around the body. Scaled relative to the
 * enemy radius so the same helper works for normal enemies and the boss.
 */
function _drawSpikes(ctx, x, y, radius, color) {
    const spikeCount  = Math.max(10, Math.round(radius * 0.7));
    const innerR      = radius;
    const outerR      = radius + Math.max(6, radius * 0.45);
    const halfWidth   = Math.max(0.07, 0.08 * (24 / spikeCount));

    ctx.save();
    ctx.fillStyle   = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth   = 1.2;

    for (let i = 0; i < spikeCount; i++) {
        const angle  = (i / spikeCount) * Math.PI * 2;
        const tipX   = x + Math.cos(angle) * outerR;
        const tipY   = y + Math.sin(angle) * outerR;
        const baseAX = x + Math.cos(angle - halfWidth) * innerR;
        const baseAY = y + Math.sin(angle - halfWidth) * innerR;
        const baseBX = x + Math.cos(angle + halfWidth) * innerR;
        const baseBY = y + Math.sin(angle + halfWidth) * innerR;

        ctx.beginPath();
        ctx.moveTo(baseAX, baseAY);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(baseBX, baseBY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
    ctx.restore();
}

/** Pulsing concentric ring rendered while the shooter ability is off cooldown. */
function _drawTargetingRing(ctx, x, y, radius) {
    const t = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.4 * t;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5 + t * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}
