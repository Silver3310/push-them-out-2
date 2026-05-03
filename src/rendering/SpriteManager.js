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
     * Works with a shallow copy of the manifest entry so the manifest's
     * `src` field is never mutated — this keeps `reloadFromManifest()`
     * able to restore original paths correctly after per-level overrides.
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
        const manifestEntry = this._manifest?.sprites[key];
        if (!manifestEntry) { console.warn(`swapSprite: unknown key "${key}"`); return; }

        // Copy so the manifest src is never mutated — reloadFromManifest()
        // depends on the original paths remaining intact.
        const entry = { ...manifestEntry, src: newSrc };

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
        img.onerror = () => console.warn(`Sprite missing: ${newSrc}`);
        img.src     = newSrc;
    }

    /**
     * Reload every sprite from its original manifest path. Fires async image
     * loads; entities show their procedural fallback for the brief loading gap.
     * Called by `LevelManager.reset()` so a full game replay starts with the
     * correct base artwork regardless of how many levels were played.
     */
    reloadFromManifest() {
        if (!this._manifest) return;
        // _preloadAll reads the original manifest entries (not mutated because
        // swapSprite now copies before modifying src).
        this._preloadAll();
    }

    isLoaded() { return this._loaded; }

    /**
     * Remove all entries from the runtime image cache. Entities fall back to
     * their procedural rendering path until sprites reload via `swapSprite` /
     * `_applySpriteOverrides`. Call this before a hard game reset so stale
     * per-level art from a previous run cannot bleed into the first frame of
     * the new one while the level-1 images are reloading asynchronously.
     */
    clearSpriteCache() {
        this._cache.clear();
    }

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

        // Tinted path: build the tinted bitmap on an off-screen buffer so
        // the multiply operation is constrained to the sprite's own alpha
        // channel. Doing the multiply directly on `ctx` would leak the tint
        // into the sprite's transparent regions (bleeding onto whatever was
        // already drawn behind it). Black/white sprite art tints cleanly:
        // black stays black, white adopts the tint colour.
        const drawable = options.tint
            ? _buildTintedBitmap(img, w, h, options.tint)
            : img;

        if (options.rotation) {
            ctx.translate(x, y);
            ctx.rotate(options.rotation);
            ctx.drawImage(drawable, -w / 2, -h / 2, w, h);
        } else {
            ctx.drawImage(drawable, x - w / 2, y - h / 2, w, h);
        }

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Tint helper: shared off-screen buffer reused across calls so we don't
// allocate a fresh canvas every frame. Resized lazily as needed.
// ---------------------------------------------------------------------------

let _tintBuffer = null;

/**
 * Return a canvas containing `img` multiplied by `tint`, with the sprite's
 * own alpha channel preserved (transparent pixels stay transparent). The
 * returned canvas is the shared module buffer — callers must not retain
 * a reference past the current draw call.
 */
function _buildTintedBitmap(img, w, h, tint) {
    if (!_tintBuffer) {
        _tintBuffer = (typeof OffscreenCanvas !== 'undefined')
            ? new OffscreenCanvas(1, 1)
            : document.createElement('canvas');
    }
    if (_tintBuffer.width !== w || _tintBuffer.height !== h) {
        _tintBuffer.width  = w;
        _tintBuffer.height = h;
    }
    const bctx = _tintBuffer.getContext('2d');
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, w, h);
    bctx.drawImage(img, 0, 0, w, h);
    // Multiply tint over the sprite. This leaks into transparent regions;
    // we mask back below.
    bctx.globalCompositeOperation = 'multiply';
    bctx.fillStyle = tint;
    bctx.fillRect(0, 0, w, h);
    // Restore the original alpha channel — keeps only the pixels where the
    // sprite itself had non-zero alpha, discarding the leaked tint.
    bctx.globalCompositeOperation = 'destination-in';
    bctx.drawImage(img, 0, 0, w, h);
    return _tintBuffer;
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
