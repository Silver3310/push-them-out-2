import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Full-screen company splash shown before the main menu.
 *
 * Displays "Oinklancers present…" over a starry background. Any key press or
 * mouse click (after a 0.5 s grace period that prevents instant accidental
 * dismissal) emits SPLASH_DISMISSED, which Game uses to transition to the
 * MENU state. This screen is the first user-gesture gate, so the browser's
 * audio context unlocks at the same moment the menu becomes visible.
 *
 * Call `activate()` before the first `update()`, and `deactivate()` when
 * leaving to remove native event listeners.
 */
export class SplashScreen {
    constructor(canvas) {
        this.canvas     = canvas;
        this._time      = 0;
        this._graceTimer = 0;
        this._dismissed = false;

        // Bound so they can be added and removed by reference.
        this._onKey   = () => this._tryDismiss();
        this._onClick = () => this._tryDismiss();
    }

    activate() {
        this._time       = 0;
        this._graceTimer = 0.5;
        this._dismissed  = false;
        window.addEventListener('keydown',   this._onKey);
        window.addEventListener('mousedown', this._onClick);
        this.canvas.style.cursor = 'pointer';
    }

    deactivate() {
        window.removeEventListener('keydown',   this._onKey);
        window.removeEventListener('mousedown', this._onClick);
        this.canvas.style.cursor = 'default';
    }

    update(dt) {
        this._time += dt;
        if (this._graceTimer > 0) this._graceTimer -= dt;
    }

    render(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        // Deep-space background
        ctx.fillStyle = '#04060e';
        ctx.fillRect(0, 0, W, H);

        // Sparse starfield — static positions for stable rendering
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (const [sx, sy, sr] of _SPLASH_STARS) {
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }

        // Fade the text in over the first second
        const alpha = Math.min(1, this._time * 1.4);

        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // "Oinklancers present…"
        ctx.font        = `bold 64px 'Courier New'`;
        ctx.fillStyle   = '#ffffff';
        ctx.shadowColor = '#88bbff';
        ctx.shadowBlur  = 28;
        ctx.fillText('Oinklancers present…', W / 2, H / 2 - 30);

        // Continue prompt — only visible after grace period, blinks gently
        if (this._graceTimer <= 0) {
            const blink = 0.5 + 0.5 * Math.sin(this._time * Math.PI * 1.6);
            ctx.globalAlpha  = alpha * (0.45 + 0.55 * blink);
            ctx.shadowBlur   = 0;
            ctx.font         = `22px 'Courier New'`;
            ctx.fillStyle    = 'rgba(180, 210, 255, 0.9)';
            ctx.fillText('(press any button to continue)', W / 2, H / 2 + 52);
        }

        ctx.restore();
    }

    _tryDismiss() {
        if (this._graceTimer > 0 || this._dismissed) return;
        this._dismissed = true;
        eventBus.emit(GameEvents.SPLASH_DISMISSED);
    }
}

// Pre-baked star positions — stable across frames (LCG-seeded, different
// seed than the menu so the two starfields don't look identical).
const _SPLASH_STARS = (() => {
    const out  = [];
    let   seed = 13;
    const rand = () => {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    };
    for (let i = 0; i < 80; i++) {
        out.push([
            rand() * GameConfig.CANVAS_WIDTH,
            rand() * GameConfig.CANVAS_HEIGHT,
            rand() * 1.2 + 0.3,
        ]);
    }
    return out;
})();
