import { GameConfig } from '../core/GameConfig.js';

// Death thresholds that determine which medal the player earns.
const GOLD_THRESHOLD   = 20;   // fewer than 20 deaths → gold
const SILVER_THRESHOLD = 40;   // fewer than 40 deaths → silver
                                // 40 or more deaths    → bronze

/**
 * Height of the dark header strip that holds session stats (left column) and
 * the medal badge with rating rules (right column). Tall enough to contain all
 * UI so the outro background image is completely unobstructed.
 */
const HEADER_H = 248;

/** Height of the thin footer strip that holds the dismiss hint. */
const FOOTER_H = 30;

/**
 * Medal descriptor produced by `_getMedal(deaths)`.
 * @typedef {{ tier: string, spriteKey: string, label: string, color: string, glowColor: string, highlight: string, shadow: string, starColor: string }} Medal
 */

/**
 * Full-screen outro splash shown after all levels are cleared.
 *
 * ### Layout
 * The screen is divided into three horizontal bands:
 *
 *   ┌─────────────────────────────────────────┐
 *   │  HEADER (HEADER_H px)                   │
 *   │  left col: SESSION STATS                │
 *   │  right col: medal badge + rating rules  │
 *   ├─────────────────────────────────────────┤
 *   │  BACKGROUND IMAGE (unobstructed)        │
 *   ├─────────────────────────────────────────┤
 *   │  FOOTER (FOOTER_H px) – dismiss hint    │
 *   └─────────────────────────────────────────┘
 *
 * ### Medal system
 * One of three tier-specific backgrounds is selected based on the player's
 * total death count for the run:
 *
 *   < 20 deaths  → GOLD   (sprite: `ui_outro_gold`)
 *   < 40 deaths  → SILVER (sprite: `ui_outro_silver`)
 *   ≥ 40 deaths  → BRONZE (sprite: `ui_outro_bronze`)
 *
 * ### Dismissal
 * ESC only — handled by `Game._setupEventListeners`. OutroScreen does not
 * add its own input listeners, preventing accidental skips.
 *
 * ### Public API
 * - `show(snapshot)` — activate with the final score snapshot.
 * - `deactivate()`   — tidy up cursor on exit.
 * - `update(dt)`     — advance internal animation timer.
 * - `render(ctx)`    — draw the full screen.
 */
export class OutroScreen {
    constructor(canvas, input, sprites) {
        this.canvas  = canvas;
        this.input   = input;
        this.sprites = sprites;

        this._snapshot = null;
        this._time     = 0;
    }

    /**
     * Activate the outro with the final score snapshot.
     * @param {{ starsCollected: number, enemiesKilled: number, playerDeaths: number, starsLost: number }} snapshot
     */
    show(snapshot) {
        this._snapshot = snapshot;
        this._time     = 0;
        this.canvas.style.cursor = 'default';
    }

    deactivate() {
        this.canvas.style.cursor = 'default';
    }

    update(dt) {
        this._time += dt;
    }

    render(ctx) {
        if (!this._snapshot) return;

        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        const medal = _getMedal(this._snapshot.playerDeaths);

        this._drawBackground(ctx, W, H, medal);
        this._drawHeaderPanel(ctx, W, medal, this._snapshot.playerDeaths);
        this._drawDismissHint(ctx, W, H);
    }

    // -------------------------------------------------------------------------
    // Private rendering helpers
    // -------------------------------------------------------------------------

    _drawBackground(ctx, W, H, medal) {
        // Try tier-specific sprite first, then legacy outro, then solid fill.
        if (this.sprites.has(medal.spriteKey)) {
            this.sprites.draw(ctx, medal.spriteKey, W / 2, H / 2, W, H);
        } else if (this.sprites.has('ui_outro')) {
            this.sprites.draw(ctx, 'ui_outro', W / 2, H / 2, W, H);
        } else {
            ctx.fillStyle = '#0a1020';
            ctx.fillRect(0, 0, W, H);
        }
    }

    /**
     * Full-width header strip. Draws the dark backing, a subtle column
     * divider, then delegates to the two sub-sections.
     */
    _drawHeaderPanel(ctx, W, medal, deaths) {
        ctx.save();

        // Dark backing across the full width
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, HEADER_H);

        // Subtle vertical divider between left and right columns
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(W / 2, 12);
        ctx.lineTo(W / 2, HEADER_H - 12);
        ctx.stroke();

        ctx.restore();

        this._drawStatsSection(ctx, W, medal);
        this._drawMedalSection(ctx, W, medal, deaths);
    }

    /**
     * Left column of the header: session statistics.
     * Centred on x = W / 4.
     */
    _drawStatsSection(ctx, W, medal) {
        const cx   = W / 4;
        const snap = this._snapshot;

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        // "SESSION STATS" heading in medal colour
        ctx.font        = `bold 30px 'Courier New'`;
        ctx.fillStyle   = medal.color;
        ctx.shadowColor = medal.glowColor;
        ctx.shadowBlur  = 18;
        ctx.fillText('SESSION STATS', cx, 18);

        // Core numbers
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#ffffff';
        ctx.font       = `bold 18px 'Courier New'`;
        ctx.fillText(
            `★ ${snap.starsCollected} collected  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            cx, 64,
        );

        ctx.restore();
    }

    /**
     * Right column of the header: animated medal badge, tier label, and the
     * three-row rating-rules guide. Centred on x = W * 3/4.
     */
    _drawMedalSection(ctx, W, medal, deaths) {
        const cx      = (W * 3) / 4;
        const r       = 38;
        const badgeCY = 62;

        // --- Animated badge ---
        ctx.save();
        const pulse = 1 + 0.03 * Math.sin(this._time * 3.5);
        ctx.translate(cx, badgeCY);
        ctx.scale(pulse, pulse);

        // Outer glow halo
        const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2);
        glow.addColorStop(0, medal.glowColor + '55');
        glow.addColorStop(1, medal.glowColor + '00');
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Medal circle body
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, medal.highlight);
        grad.addColorStop(1, medal.shadow);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle   = grad;
        ctx.shadowColor = medal.glowColor;
        ctx.shadowBlur  = 20;
        ctx.fill();

        // Outline ring
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth   = 3;
        ctx.stroke();
        ctx.shadowBlur  = 0;

        _drawStar(ctx, 0, 0, 5, r * 0.55, r * 0.25, medal.starColor);

        ctx.restore();

        // --- Tier label ---
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.font         = `bold 26px 'Courier New'`;
        ctx.fillStyle    = medal.color;
        ctx.shadowColor  = medal.glowColor;
        ctx.shadowBlur   = 16;
        ctx.fillText(medal.label, cx, badgeCY + r + 10);
        ctx.restore();

        // --- Rating guide ---
        this._drawRatingRules(ctx, cx, deaths);
    }

    /**
     * Three-row medal threshold guide rendered in the right column, below the
     * badge. The tier the player achieved is highlighted with colour and an
     * arrow prefix; the other two rows are dimmed.
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} cx      Horizontal centre of the right column.
     * @param {number} deaths  Player's total death count for the run.
     */
    _drawRatingRules(ctx, cx, deaths) {
        const startY   = 152;
        const achieved = _getMedal(deaths).tier;

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        // Section heading
        ctx.font      = `bold 13px 'Courier New'`;
        ctx.fillStyle = 'rgba(200, 230, 255, 0.9)';
        ctx.fillText('HOW TO EARN A BETTER MEDAL', cx, startY);

        const rows = [
            { label: `< ${GOLD_THRESHOLD} deaths`,   medal: 'GOLD',   color: MEDALS.gold.color,   glow: MEDALS.gold.glowColor   },
            { label: `< ${SILVER_THRESHOLD} deaths`, medal: 'SILVER', color: MEDALS.silver.color, glow: MEDALS.silver.glowColor },
            { label: `≥ ${SILVER_THRESHOLD} deaths`, medal: 'BRONZE', color: MEDALS.bronze.color, glow: MEDALS.bronze.glowColor },
        ];

        rows.forEach((row, i) => {
            const isActive = row.medal.toLowerCase() === achieved;
            const y = startY + 22 + i * 22;
            ctx.font        = isActive ? `bold 15px 'Courier New'` : `bold 12px 'Courier New'`;
            ctx.fillStyle   = isActive ? row.color  : 'rgba(180,180,180,0.7)';
            ctx.shadowColor = isActive ? row.glow   : 'transparent';
            ctx.shadowBlur  = isActive ? 10 : 0;
            ctx.fillText(`${isActive ? '▶ ' : '  '}${row.label}  →  ${row.medal} MEDAL`, cx, y);
        });

        ctx.restore();
    }

    /**
     * Thin footer strip at the very bottom with the dismiss prompt, keeping
     * the outro background completely unobstructed.
     */
    _drawDismissHint(ctx, W, H) {
        ctx.save();

        // Dark backing so the hint is legible over any background colour
        ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
        ctx.fillRect(0, H - FOOTER_H, W, FOOTER_H);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = `bold 14px 'Courier New'`;
        ctx.fillStyle    = 'rgba(180, 220, 255, 0.65)';
        ctx.fillText('Press ESC to return to menu', W / 2, H - FOOTER_H / 2);

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Medal data
// ---------------------------------------------------------------------------

const MEDALS = {
    gold: {
        tier:       'gold',
        spriteKey:  'ui_outro_gold',
        label:      'GOLD MEDAL!',
        color:      '#ffd700',
        glowColor:  '#ffaa00',
        highlight:  '#fff0a0',
        shadow:     '#b8860b',
        starColor:  '#ffffff',
    },
    silver: {
        tier:       'silver',
        spriteKey:  'ui_outro_silver',
        label:      'SILVER MEDAL!',
        color:      '#d0d8e8',
        glowColor:  '#8899bb',
        highlight:  '#ffffff',
        shadow:     '#778899',
        starColor:  '#ffffee',
    },
    bronze: {
        tier:       'bronze',
        spriteKey:  'ui_outro_bronze',
        label:      'BRONZE MEDAL!',
        color:      '#cd7f32',
        glowColor:  '#a05010',
        highlight:  '#e8a060',
        shadow:     '#6b3a10',
        starColor:  '#fff0d0',
    },
};

/**
 * Return the appropriate medal descriptor for the given death count.
 * @param {number} deaths
 * @returns {Medal}
 */
function _getMedal(deaths) {
    if (deaths < GOLD_THRESHOLD)   return MEDALS.gold;
    if (deaths < SILVER_THRESHOLD) return MEDALS.silver;
    return MEDALS.bronze;
}

// ---------------------------------------------------------------------------
// Canvas drawing utilities (module-private)
// ---------------------------------------------------------------------------

/**
 * Draw a regular star polygon.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx       Centre x
 * @param {number} cy       Centre y
 * @param {number} points   Number of star points
 * @param {number} outerR   Outer radius
 * @param {number} innerR   Inner radius (valley)
 * @param {string} color    Fill colour
 */
function _drawStar(ctx, cx, cy, points, outerR, innerR, color) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const angle = (i * Math.PI) / points - Math.PI / 2;
        const r     = i % 2 === 0 ? outerR : innerR;
        const x     = cx + Math.cos(angle) * r;
        const y     = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
}
