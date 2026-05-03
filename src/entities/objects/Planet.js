import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/**
 * Default sprite key when none is supplied. Resolved against
 * `assets/sprites/sprites.json`. Missing manifest entries / 404s fall back
 * to the procedural radial-gradient render so the game still works
 * without any planet artwork at all.
 */
export const DEFAULT_PLANET_SPRITE_KEY = 'planet_green';

/**
 * Planet bumper.
 *
 * Acts as a heavy, colour-tinted obstacle that bounces balls away. The
 * `color` field is reused for both the procedural gradient AND the sprite
 * tint — when `LevelManager` interpolates the planet palette during a
 * cross-fade, the tinted sprite (or the procedural body) recolours
 * automatically with no extra plumbing.
 *
 * ### Rendering precedence
 *
 *   1. If a {@link SpriteManager} is provided AND `spriteKey` is loaded,
 *      the sprite is drawn at `radius * 2` and tinted with `color` via
 *      the SpriteManager's `multiply`-blend tint pass. Designed for
 *      black/white sprite art: white pixels take the tint colour while
 *      black pixels stay black, so a single sprite renders as a "green
 *      planet" / "orange planet" / etc. driven entirely by `color`.
 *   2. Otherwise the original procedural radial-gradient sphere is
 *      drawn so the game runs without any asset files.
 *
 * ### Customising sprites per level
 *
 *   - In `LevelConfig.LEVELS[i].planetSprites` set a 6-entry array of
 *     sprite keys (one per planet slot). Defaults to all
 *     `DEFAULT_PLANET_SPRITE_KEY` when omitted.
 *   - For per-level art swaps, drop a PNG at
 *     `assets/sprites/levels/levelN/<key>.png` and reference it from the
 *     same level's `spriteOverrides` map. Standard `LEVEL_SPRITE_KEYS`
 *     plumbing (in `LevelConfig`) handles the cross-fade.
 */
export class Planet extends Entity {
    /**
     * @param {number}             x         World x.
     * @param {number}             y         World y.
     * @param {number}             radius    Visual + collision radius.
     * @param {string}             [color]   Tint / procedural colour. Live-mutated
     *                                       by `Game._applyLevelPalette` during
     *                                       level transitions.
     * @param {string}             [spriteKey]  Sprite-manager key — picks which
     *                                       planet artwork to use. Falls back to
     *                                       the procedural body if missing.
     * @param {SpriteManager|null} [sprites] Optional sprite manager. Without
     *                                       one the procedural body is always used.
     */
    constructor(x, y, radius, color = '#c8e06e', spriteKey = DEFAULT_PLANET_SPRITE_KEY, sprites = null) {
        super(x, y);
        this.radius      = radius;
        this.color       = color;
        this.spriteKey   = spriteKey;
        this._sprites    = sprites;
        this.restitution = GameConfig.PLANET_BOUNCE_RESTITUTION;
        this.addTag('planet');
    }

    render(ctx) {
        if (this.spriteKey && this._sprites?.has(this.spriteKey)) {
            this._renderSprite(ctx);
        } else {
            this._renderProcedural(ctx);
        }
    }

    /**
     * Draw the manifest sprite, tinted with `this.color`. Black/white sprite
     * art is recommended — black areas stay black under multiply, while
     * white areas adopt the tint exactly.
     */
    _renderSprite(ctx) {
        const d = this.radius * 2;
        this._sprites.draw(ctx, this.spriteKey, this.x, this.y, d, d, {
            tint: this.color,
        });

        // Faint rim highlight so the silhouette pops against busy backdrops,
        // matching the procedural body's visual signature.
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = this.color + '88';
        ctx.lineWidth   = 1.5;
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Original procedural radial-gradient body. Used whenever no sprite is
     * available — guarantees the game looks complete with zero asset files.
     */
    _renderProcedural(ctx) {
        ctx.save();

        const gradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3,
            this.y - this.radius * 0.3,
            this.radius * 0.1,
            this.x, this.y, this.radius,
        );
        gradient.addColorStop(0,   '#ffffff44');
        gradient.addColorStop(0.3,  this.color);
        gradient.addColorStop(1,    this._darken(this.color, 0.45));

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Faint rim highlight
        ctx.strokeStyle = this.color + '88';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Multiply each RGB channel by `(1 - amount)`. Used by the procedural
     * body for the dark side of the gradient. Accepts `#rrggbb`; non-hex
     * colour strings (e.g. interpolated `rgb(...)` — possible during
     * transitions if a future refactor changes lerp output) fall back to
     * the input colour to avoid NaN-corrupted gradients.
     */
    _darken(hex, amount) {
        if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) return hex;
        const n = parseInt(hex.slice(1), 16);
        const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - amount)));
        const g = Math.max(0, Math.floor(((n >>  8) & 0xff) * (1 - amount)));
        const b = Math.max(0, Math.floor(( n        & 0xff) * (1 - amount)));
        return `rgb(${r},${g},${b})`;
    }
}
