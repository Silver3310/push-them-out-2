import { GameConfig } from '../core/GameConfig.js';

/**
 * Loads sprites from a JSON manifest and draws them auto-scaled to the
 * current canvas resolution. Swap any sprite at runtime via `swapSprite()`.
 *
 * Manifest format (assets/sprites/sprites.json):
 *   { "sprites": { "key": { "src": "path/to/img.png", "width": 36, "height": 36 } } }
 *
 * `width`/`height` are the authored sizes at
 * `SPRITE_REFERENCE_WIDTH × SPRITE_REFERENCE_HEIGHT`. At runtime they scale
 * proportionally to the actual canvas size.
 *
 * ### Cross-fade swaps
 *
 * `swapSprite(key, newSrc, fadeMs)` accepts an optional duration. When > 0,
 * the manager keeps the previously cached image around for `fadeMs`
 * milliseconds after the new image finishes loading and `draw()` blends
 * the two by alpha. This is what lets level transitions slide between
 * sprite sets in lock-step with the gradient fade. With `fadeMs = 0`
 * (the default) the swap is instant — same as the original behaviour.
 *
 * @typedef {object} CacheEntry
 * @property {HTMLImageElement} img   Currently active image.
 * @property {object}           entry Manifest entry (src/width/height).
 * @property {HTMLImageElement|null} previousImg   Outgoing image during a
 *                                                 cross-fade, or `null`.
 * @property {object|null}      previousEntry      Outgoing manifest entry.
 * @property {number}           fadeStart          performance.now() snapshot
 *                                                 captured when the new image
 *                                                 finished loading.
 * @property {number}           fadeDuration       Cross-fade length (ms).
 */
export class SpriteManager {
    constructor() {
        /** @type {Map<string, CacheEntry>} */
        this._cache    = new Map();
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

    /**
     * Initial load (or hard reload) of a sprite. Replaces the cache entry
     * the moment the image becomes available; failures are non-fatal.
     */
    _loadSprite(key, entry) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload  = () => {
                this._cache.set(key, _newCacheEntry(img, entry));
                resolve();
            };
            img.onerror = () => { console.warn(`Sprite missing: ${entry.src}`); resolve(); };
            img.src     = entry.src;
        });
    }

    /**
     * True when the given key has a cached image ready to draw.
     * Entities use this to decide between sprite path and procedural fallback.
     */
    has(key) { return this._cache.has(key); }

    /**
     * Draw a sprite centred at (x, y).
     *
     * `targetWidth` / `targetHeight` are optional overrides in
     * authored-resolution pixels. `options`:
     *   - `rotation` (radians)
     *   - `tint`     (CSS colour applied via "multiply")
     *   - `alpha`    (0–1)
     *
     * If a cross-fade is in progress the previous and current images are
     * blended by alpha. Once the fade completes the previous image is
     * dropped and subsequent draws short-circuit back to the cheap path.
     */
    draw(ctx, key, x, y, targetWidth = null, targetHeight = null, options = {}) {
        const cached = this._cache.get(key);
        if (!cached) return;

        const baseAlpha = options.alpha ?? 1;
        let curAlpha   = baseAlpha;

        if (cached.previousImg) {
            const elapsed = performance.now() - cached.fadeStart;
            const t       = cached.fadeDuration > 0
                ? Math.min(1, elapsed / cached.fadeDuration)
                : 1;

            if (t >= 1) {
                cached.previousImg   = null;
                cached.previousEntry = null;
                cached.fadeStart     = 0;
                cached.fadeDuration  = 0;
            } else {
                this._drawImage(
                    ctx, cached.previousImg, cached.previousEntry,
                    x, y, targetWidth, targetHeight,
                    { ...options, alpha: baseAlpha * (1 - t) },
                );
                curAlpha = baseAlpha * t;
            }
        }

        this._drawImage(
            ctx, cached.img, cached.entry,
            x, y, targetWidth, targetHeight,
            { ...options, alpha: curAlpha },
        );
    }

    /**
     * Hot-swap a sprite by key without reloading the manifest.
     *
     * @param {string} key       - Sprite key as declared in the manifest.
     * @param {string} newSrc    - Path to the new image. Missing files leave
     *                             the previous image untouched (warns once).
     * @param {number} [fadeMs]  - When > 0, cross-fade between the old and
     *                             new image over this duration once the new
     *                             image finishes loading. When 0 (default)
     *                             the swap is instant.
     */
    swapSprite(key, newSrc, fadeMs = 0) {
        const entry = this._manifest?.sprites[key];
        if (!entry) { console.warn(`swapSprite: unknown key "${key}"`); return; }
        entry.src = newSrc;

        if (fadeMs <= 0) {
            this._loadSprite(key, entry);
            return;
        }

        const img = new Image();
        img.onload  = () => {
            const previous = this._cache.get(key);
            this._cache.set(key, {
                img,
                entry,
                previousImg:   previous?.img   ?? null,
                previousEntry: previous?.entry ?? null,
                fadeStart:     performance.now(),
                fadeDuration:  fadeMs,
            });
        };
        img.onerror = () => console.warn(`Sprite missing: ${entry.src}`);
        img.src     = newSrc;
    }

    isLoaded() { return this._loaded; }

    // -------------------------------------------------------------------------
    // Private drawing helper (shared between current and previous-image paths)
    // -------------------------------------------------------------------------

    _drawImage(ctx, img, entry, x, y, targetWidth, targetHeight, options) {
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
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure)
// ---------------------------------------------------------------------------

function _newCacheEntry(img, entry) {
    return {
        img,
        entry,
        previousImg:   null,
        previousEntry: null,
        fadeStart:     0,
        fadeDuration:  0,
    };
}
