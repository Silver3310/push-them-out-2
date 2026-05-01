import { LEVELS } from './LevelConfig.js';

/** Duration (seconds) of the gradient cross-fade when advancing levels. */
const TRANSITION_DURATION = 2.5;

/**
 * Drives level progression and the smooth visual handover between levels.
 *
 * `LevelManager` owns:
 *   - the current level index,
 *   - the live "render spec" (background + border colours + planet palette)
 *     consumed by `Renderer` and the planet entities each frame,
 *   - the cross-fade interpolation that runs whenever `advance()` is called,
 *   - the per-level sprite swaps applied via `SpriteManager.swapSprite`.
 *
 * The player never sees an explicit "Level X complete" modal — the only
 * cues are the colour fade, the recoloured planets, and a single
 * `SHOW_NOTIFICATION` event emitted by `Game`.
 *
 * ### Lifecycle
 *
 *   const lm = new LevelManager(spriteManager);
 *   // … each frame:
 *   lm.update(dt);
 *   const spec = lm.getRenderSpec();
 *   renderer.drawBackground(spec);
 *   renderer.drawTableBorder(rect, spec);
 *
 *   // when the player clears a level:
 *   if (!lm.isLast) lm.advance();
 *
 * ### Transition timeline
 *
 *   t = 0                  → fade begins; render spec equals fromSpec
 *   t = duration / 2       → sprite overrides applied; HUD label switches
 *   t = duration           → fade ends; render spec equals toSpec
 */
export class LevelManager {
    /**
     * @param {SpriteManager|null} sprites - Optional. When provided, level
     *     transitions trigger `swapSprite` for each entry in the level's
     *     `spriteOverrides` map at the midpoint of the cross-fade.
     */
    constructor(sprites = null) {
        this._sprites = sprites;
        this._index   = 0;

        /**
         * Active transition state, or `null` when the level is settled.
         * @type {{ from: object, to: object, t: number, duration: number, swapped: boolean }|null}
         */
        this._transition = null;

        // Apply level 1's sprite overrides immediately (no-op if empty).
        this._applySpriteOverrides(this.current);
    }

    // -------------------------------------------------------------------------
    // Public read-only accessors
    // -------------------------------------------------------------------------

    /** The currently active level config (post-midpoint of any transition). */
    get current()    { return LEVELS[this._index]; }

    /** Zero-based index of the active level. */
    get index()      { return this._index; }

    /** Total number of levels in the campaign. */
    get total()      { return LEVELS.length; }

    /** True when no further level remains (clearing emits GAME_VICTORY). */
    get isLast()     { return this._index >= LEVELS.length - 1; }

    /** True while the gradient cross-fade is animating. */
    get isTransitioning() { return this._transition !== null; }

    /** The next level config, or `null` on the final level. */
    peekNext() {
        return LEVELS[this._index + 1] ?? null;
    }

    // -------------------------------------------------------------------------
    // Mutators
    // -------------------------------------------------------------------------

    /**
     * Reset to level 1 with no transition. Called from `Game._startNewGame`
     * so each new run begins on the first level with the default visuals.
     */
    reset() {
        this._index      = 0;
        this._transition = null;
        this._applySpriteOverrides(this.current);
    }

    /**
     * Advance to the next level and start the cross-fade. The active level
     * (`current`) only flips at the midpoint of the fade so HUD text and
     * sprite swaps stay synchronised with the visual handoff.
     *
     * @returns {boolean} false if already on the final level (caller should
     *                    instead emit GAME_VICTORY); true otherwise.
     */
    advance() {
        if (this.isLast) return false;
        const fromLevel = this.current;
        const toLevel   = LEVELS[this._index + 1];

        this._transition = {
            from:    fromLevel,
            to:      toLevel,
            t:       0,
            duration: TRANSITION_DURATION,
            swapped: false,
        };
        return true;
    }

    /**
     * Drive the transition timer. Safe to call every frame; a no-op when not
     * transitioning. Call this from the game loop's update step (uses real
     * dt so the fade plays in wall-clock time, not physics-step time).
     *
     * @param {number} dt - Seconds since last frame.
     */
    update(dt) {
        if (!this._transition) return;

        this._transition.t += dt;

        // Midpoint: flip the active level index and apply sprite overrides.
        const halfDone = this._transition.t >= this._transition.duration * 0.5;
        if (halfDone && !this._transition.swapped) {
            this._index += 1;
            this._applySpriteOverrides(this.current);
            this._transition.swapped = true;
        }

        if (this._transition.t >= this._transition.duration) {
            this._transition = null;
        }
    }

    /**
     * Returns the render spec to use this frame. While transitioning the
     * background colours and the planet palette are linearly interpolated
     * (eased) between the outgoing and incoming levels' specs.
     *
     * @returns {{
     *   bgInner: string,
     *   bgOuter: string,
     *   borderColor: string,
     *   borderShadow: string,
     *   planetPalette: string[],
     * }}
     */
    getRenderSpec() {
        if (!this._transition) {
            return { ..._normalisedSpec(this.current) };
        }

        const t       = _easeInOutCubic(this._transition.t / this._transition.duration);
        const fromSpec = _normalisedSpec(this._transition.from);
        const toSpec   = _normalisedSpec(this._transition.to);

        return {
            bgInner:      _lerpHex(fromSpec.bgInner,      toSpec.bgInner,      t),
            bgOuter:      _lerpHex(fromSpec.bgOuter,      toSpec.bgOuter,      t),
            borderColor:  _lerpHex(fromSpec.borderColor,  toSpec.borderColor,  t),
            borderShadow: _lerpHex(fromSpec.borderShadow, toSpec.borderShadow, t),
            planetPalette: fromSpec.planetPalette.map((c, i) =>
                _lerpHex(c, toSpec.planetPalette[i] ?? c, t)
            ),
        };
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    _applySpriteOverrides(level) {
        if (!this._sprites) return;
        const overrides = level.spriteOverrides ?? {};
        for (const [key, src] of Object.entries(overrides)) {
            this._sprites.swapSprite(key, src);
        }
    }
}

// ---------------------------------------------------------------------------
// Module-level helpers (pure, unexported)
// ---------------------------------------------------------------------------

/** Flatten a level config into the structural shape used by `getRenderSpec`. */
function _normalisedSpec(level) {
    return {
        bgInner:       level.background.bgInner,
        bgOuter:       level.background.bgOuter,
        borderColor:   level.background.borderColor,
        borderShadow:  level.background.borderShadow,
        planetPalette: level.planetPalette,
    };
}

/** Smooth ease — slow at the edges, fastest in the middle. */
function _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Linear interpolate two 6-digit hex colours. Inputs are expected to look
 * like `#RRGGBB`; the result is the same form. Used by `getRenderSpec`
 * during cross-fades.
 */
function _lerpHex(a, b, t) {
    const ar = parseInt(a.slice(1, 3), 16);
    const ag = parseInt(a.slice(3, 5), 16);
    const ab = parseInt(a.slice(5, 7), 16);
    const br = parseInt(b.slice(1, 3), 16);
    const bg = parseInt(b.slice(3, 5), 16);
    const bb = parseInt(b.slice(5, 7), 16);
    const r  = Math.round(ar + (br - ar) * t);
    const g  = Math.round(ag + (bg - ag) * t);
    const bl = Math.round(ab + (bb - ab) * t);
    return `#${_byteHex(r)}${_byteHex(g)}${_byteHex(bl)}`;
}

function _byteHex(n) {
    return n.toString(16).padStart(2, '0');
}
