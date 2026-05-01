import { GameConfig } from '../core/GameConfig.js';

/**
 * Loads sprites from a JSON manifest and draws them auto-scaled to the
 * current canvas resolution. Swap any sprite at runtime via swapSprite().
 *
 * Manifest format (assets/sprites/sprites.json):
 *   { "sprites": { "key": { "src": "path/to/img.png", "width": 36, "height": 36 } } }
 *
 * width/height are the authored sizes at SPRITE_REFERENCE_WIDTH × SPRITE_REFERENCE_HEIGHT.
 * At runtime they scale proportionally to the actual canvas size.
 */
export class SpriteManager {
    constructor() {
        this._cache    = new Map(); // key → { img: HTMLImageElement, entry }
        this._manifest = null;
        this._loaded   = false;
    }

    async loadManifest(path) {
        try {
            const res = await fetch(path);
            this._manifest = await res.json();
            await this._preloadAll();
        } catch {
            console.warn('SpriteManager: manifest not found, sprites disabled.');
        }
        this._loaded = true;
    }

    async _preloadAll() {
        await Promise.all(
            Object.entries(this._manifest.sprites).map(([key, entry]) =>
                this._loadSprite(key, entry)
            )
        );
    }

    _loadSprite(key, entry) {
        return new Promise(resolve => {
            const img     = new Image();
            img.onload    = () => { this._cache.set(key, { img, entry }); resolve(); };
            img.onerror   = () => { console.warn(`Sprite missing: ${entry.src}`); resolve(); };
            img.src       = entry.src;
        });
    }

    /**
     * Draw a sprite centred at (x, y).
     * targetWidth / targetHeight are optional overrides in authored-resolution pixels.
     * options: { rotation?: number (radians), tint?: CSS color string, alpha?: number }
     */
    draw(ctx, key, x, y, targetWidth = null, targetHeight = null, options = {}) {
        const cached = this._cache.get(key);
        if (!cached) return;

        const { img, entry } = cached;
        const scaleX = GameConfig.CANVAS_WIDTH  / GameConfig.SPRITE_REFERENCE_WIDTH;
        const scaleY = GameConfig.CANVAS_HEIGHT / GameConfig.SPRITE_REFERENCE_HEIGHT;
        const scale  = Math.min(scaleX, scaleY);

        const w = (targetWidth  ?? entry.width  ?? img.naturalWidth)  * scale;
        const h = (targetHeight ?? entry.height ?? img.naturalHeight) * scale;

        ctx.save();
        if (options.alpha !== undefined) ctx.globalAlpha = options.alpha;

        if (options.rotation) {
            ctx.translate(x, y);
            ctx.rotate(options.rotation);
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
        } else {
            ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
        }

        // Optional tint via multiply blend
        if (options.tint) {
            ctx.globalCompositeOperation = 'multiply';
            ctx.fillStyle = options.tint;
            if (options.rotation) {
                ctx.fillRect(-w / 2, -h / 2, w, h);
            } else {
                ctx.fillRect(x - w / 2, y - h / 2, w, h);
            }
        }

        ctx.restore();
    }

    /**
     * Hot-swap a sprite by key without reloading the manifest.
     * Useful for customisation / modding at runtime.
     */
    swapSprite(key, newSrc) {
        const entry = this._manifest?.sprites[key];
        if (!entry) { console.warn(`swapSprite: unknown key "${key}"`); return; }
        entry.src = newSrc;
        this._loadSprite(key, entry);
    }

    isLoaded() { return this._loaded; }
}