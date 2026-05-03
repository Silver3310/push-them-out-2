import { GameConfig } from '../core/GameConfig.js';

/**
 * Full-screen outro splash shown after all levels are cleared.
 *
 * Displays `ui_outro` (assets/sprites/ui/outro.png) at canvas size with a
 * semi-transparent stats panel anchored to the top of the screen.
 *
 * ### Dismissal
 * The outro can **only** be dismissed by pressing ESC. This is handled
 * entirely by the `keydown` listener in `Game._setupEventListeners` —
 * OutroScreen itself does not add any input handlers. The intentional
 * restriction prevents accidental skips from stray clicks or held keys.
 *
 * Call `show(snapshot)` to activate the screen with the session's score
 * snapshot, and `deactivate()` when leaving to restore cursor styling.
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
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        if (this.sprites.has('ui_outro')) {
            this.sprites.draw(ctx, 'ui_outro', W / 2, H / 2, W, H);
        } else {
            ctx.fillStyle = '#0a1020';
            ctx.fillRect(0, 0, W, H);
        }

        this._drawStatsPanel(ctx, W);
    }

    _drawStatsPanel(ctx, W) {
        if (!this._snapshot) return;
        const snap   = this._snapshot;
        const panelH = 150;

        ctx.save();

        // Dark backing strip
        ctx.fillStyle = 'rgba(0, 0, 0, 0.68)';
        ctx.fillRect(0, 0, W, panelH);

        // "SESSION STATS" heading
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle    = '#ffd700';
        ctx.font         = `bold 36px 'Courier New'`;
        ctx.shadowColor  = '#ffd700';
        ctx.shadowBlur   = 18;
        ctx.fillText('SESSION STATS', W / 2, 16);

        // Core numbers
        ctx.shadowBlur = 0;
        ctx.fillStyle  = '#ffffff';
        ctx.font       = `22px 'Courier New'`;
        ctx.fillText(
            `★ ${snap.starsCollected} collected  ·  ${snap.enemiesKilled} enemies  ·  ${snap.playerDeaths} deaths`,
            W / 2, 66,
        );

        // Secondary line
        ctx.fillStyle = 'rgba(220, 200, 150, 0.85)';
        ctx.font      = `16px 'Courier New'`;
        ctx.fillText(
            `${snap.starsLost} star${snap.starsLost !== 1 ? 's' : ''} lost to holes`,
            W / 2, 102,
        );

        // Dismiss hint — ESC only
        ctx.fillStyle = 'rgba(180, 220, 255, 0.65)';
        ctx.font      = `14px 'Courier New'`;
        ctx.fillText('Press ESC to return to menu', W / 2, 128);

        ctx.restore();
    }
}
