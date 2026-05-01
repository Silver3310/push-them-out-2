import { Ball }       from '../objects/Ball.js';
import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';

/** Sprite key used in assets/sprites/sprites.json for the enemy ball. */
export const ENEMY_SPRITE_KEY = 'enemy_ball';

/**
 * AI-controlled antagonist ball.
 *
 * Rendering precedence:
 *   1. If a SpriteManager is provided AND the "enemy_ball" PNG is loaded,
 *      the sprite is drawn over the team-colour glow. Per-level art swaps
 *      are handled transparently — `LevelManager` calls
 *      `SpriteManager.swapSprite('enemy_ball', …)` during transitions and
 *      this entity picks up the new image on the next render.
 *   2. Otherwise the ball is drawn procedurally so the game works without
 *      any asset files.
 *
 * Glow halo and the floating name label are drawn from canvas primitives in
 * both modes — the glow uses `this.color`, so AI controllers and team
 * affiliation remain visually distinct regardless of the active sprite.
 */
export class Enemy extends Ball {
    constructor(x, y, color, name, sprites = null) {
        super(x, y, GameConfig.ENEMY_RADIUS, GameConfig.ENEMY_MASS);
        this.color    = color;
        this.name     = name;
        this.deaths   = 0;
        this.spawnX   = x;
        this.spawnY   = y;
        this._sprites = sprites;
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

        // Coloured glow halo — drawn for both sprite and procedural paths so
        // team identity reads even when the sprite is mid cross-fade.
        _drawGlow(ctx, this.x, this.y, this.radius, this.color);

        if (this._sprites?.has(ENEMY_SPRITE_KEY)) {
            const d = this.radius * 2;
            this._sprites.draw(ctx, ENEMY_SPRITE_KEY, this.x, this.y, d, d);
        } else {
            _drawCanvasBall(ctx, this.x, this.y, this.radius, this.color);
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
