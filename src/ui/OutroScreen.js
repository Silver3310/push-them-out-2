import { GameConfig } from '../core/GameConfig.js';

// Death thresholds that determine which medal the player earns.
const GOLD_THRESHOLD   = 20;   // fewer than 20 deaths → gold
const SILVER_THRESHOLD = 40;   // fewer than 40 deaths → silver
                                // 40 or more deaths    → bronze

/**
 * Medal descriptor produced by `_getMedal(deaths)`.
 * @typedef {{ key: string, label: string, color: string, glowColor: string }} Medal
 */

/**
 * Full-screen outro splash shown after all levels are cleared.
 *
 * ### Medal system
 * The outro selects one of three tier-specific backgrounds based on the
 * player's total death count for the run:
 *
 *   < 20 deaths  → GOLD   (sprite: `ui_outro_gold`)
 *   < 40 deaths  → SILVER (sprite: `ui_outro_silver`)
 *   ≥ 40 deaths  → BRONZE (sprite: `ui_outro_bronze`)
 *
 * A drawn medal badge, tier label, and the rating rules are rendered on top
 * of the background so the player immediately knows their score and how to
 * improve it on the next run. The outro music (`Outro_Sound.wav`) plays for
 * all three tiers — only the background image and medal colour differ.
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
        this._drawStatsPanel(ctx, W, medal);
        this._drawMedalBadge(ctx, W, H, medal);
        this._drawRatingRules(ctx, W, H, this._snapshot.playerDeaths);
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

    _drawStatsPanel(ctx, W, medal) {
        const panelH = 130;
        ctx.save();

        // Dark backing strip
        ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        ctx.fillRect(0, 0, W, panelH);

        // "SESSION STATS" heading in medal colour
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle    = medal.color;
        ctx.font         = `bold 34px 'Courier New'`;
        ctx.shadowColor  = medal.glowColor;
        ctx.shadowBlur   = 18;
        ctx.fillText('SESSION STATS', W / 2, 14);

        // Core numbers
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#ffffff';
        ctx.font       = `bold 21px 'Courier New'`;
        const snap = this._snapshot;
        ctx.fillText(
            `★ ${snap.starsCollected} collected  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            W / 2, 58,
        );

        // Secondary line
        ctx.fillStyle = 'rgba(220, 200, 150, 0.85)';
        ctx.font      = `bold 15px 'Courier New'`;
        ctx.fillText(
            `${snap.starsLost} star${snap.starsLost !== 1 ? 's' : ''} lost to holes`,
            W / 2, 95,
        );

        ctx.restore();
    }

    _drawMedalBadge(ctx, W, H, medal) {
        // Centre the badge in the middle band of the screen
        const cx = W / 2;
        const cy = H / 2 - 30;
        const r  = 60;

        ctx.save();

        // Animated pulse — subtle scale throb
        const pulse = 1 + 0.03 * Math.sin(this._time * 3.5);

        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);

        // Outer glow ring
        const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2);
        glow.addColorStop(0, medal.glowColor + '55');
        glow.addColorStop(1, medal.glowColor + '00');
        ctx.beginPath();
        ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Medal circle background
        const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        grad.addColorStop(0, medal.highlight);
        grad.addColorStop(1, medal.shadow);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.shadowColor = medal.glowColor;
        ctx.shadowBlur  = 24;
        ctx.fill();

        // Dark outline
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth   = 3;
        ctx.stroke();
        ctx.shadowBlur  = 0;

        // Star inside the medal
        _drawStar(ctx, 0, 0, 5, r * 0.55, r * 0.25, medal.starColor);

        ctx.restore();

        // Medal label below the badge
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.font         = `bold 40px 'Courier New'`;
        ctx.fillStyle    = medal.color;
        ctx.shadowColor  = medal.glowColor;
        ctx.shadowBlur   = 20;
        ctx.fillText(medal.label, W / 2, cy + r + 18);
        ctx.restore();
    }

    _drawRatingRules(ctx, W, H, deaths) {
        const panelW = 680;
        const panelH = 110;
        const px     = (W - panelW) / 2;
        const py     = H - 200;

        ctx.save();

        // Semi-transparent panel
        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        _roundRect(ctx, px, py, panelW, panelH, 10);
        ctx.fill();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';

        // Heading
        ctx.font      = `bold 16px 'Courier New'`;
        ctx.fillStyle = 'rgba(200, 230, 255, 0.9)';
        ctx.fillText('HOW TO EARN A BETTER MEDAL', W / 2, py + 12);

        // Three rows — highlight whichever tier the player achieved
        const rows = [
            { deaths: `< ${GOLD_THRESHOLD} deaths`,   medal: 'GOLD',   color: MEDALS.gold.color,   glow: MEDALS.gold.glowColor   },
            { deaths: `< ${SILVER_THRESHOLD} deaths`, medal: 'SILVER', color: MEDALS.silver.color, glow: MEDALS.silver.glowColor },
            { deaths: `≥ ${SILVER_THRESHOLD} deaths`, medal: 'BRONZE', color: MEDALS.bronze.color, glow: MEDALS.bronze.glowColor },
        ];

        rows.forEach((row, i) => {
            const isActive = row.medal.toLowerCase() === _getMedal(deaths).tier;
            const y = py + 42 + i * 24;
            ctx.font      = isActive ? `bold 17px 'Courier New'` : `bold 14px 'Courier New'`;
            ctx.fillStyle = isActive ? row.color : 'rgba(180,180,180,0.7)';
            if (isActive) {
                ctx.shadowColor = row.glow;
                ctx.shadowBlur  = 10;
            } else {
                ctx.shadowBlur = 0;
            }
            const prefix = isActive ? '▶ ' : '  ';
            ctx.fillText(`${prefix}${row.deaths}  →  ${row.medal} MEDAL`, W / 2, y);
        });

        ctx.restore();
    }

    _drawDismissHint(ctx, W, H) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font         = `bold 15px 'Courier New'`;
        ctx.fillStyle    = 'rgba(180, 220, 255, 0.65)';
        ctx.fillText('Press ESC to return to menu', W / 2, H - 16);
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

/**
 * Trace a rounded rectangle path (does not fill/stroke — caller does that).
 */
function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
}
