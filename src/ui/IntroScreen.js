import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Full-screen intro splash shown between "Start game" and the first level.
 *
 * Displays `ui_intro` (assets/sprites/ui/intro.png) at canvas size, overlaid
 * with a per-character wave animation of the prompt text on the right side.
 * Any key press or mouse click (after a 0.3 s grace period) emits
 * INTRO_DISMISSED so Game can transition to PLAYING.
 *
 * Call `activate()` before the first `update()` call, and `deactivate()` when
 * leaving this screen to clean up the native `keydown` listener.
 */
export class IntroScreen {
    constructor(canvas, input, sprites) {
        this.canvas  = canvas;
        this.input   = input;
        this.sprites = sprites;

        this._time           = 0;
        this._graceTimer     = 0;
        this._prevMouseLeft  = false;
        this._keyJustPressed = false;
        this._onKeyDown      = () => { this._keyJustPressed = true; };
    }

    activate() {
        this._time           = 0;
        this._graceTimer     = 0.3;
        // Treat the initial mouse state as "already held" so the click that
        // launched the intro (Start game button) doesn't immediately dismiss it.
        this._prevMouseLeft  = this.input.mouse.left;
        this._keyJustPressed = false;
        window.addEventListener('keydown', this._onKeyDown);
        this.canvas.style.cursor = 'pointer';
    }

    deactivate() {
        window.removeEventListener('keydown', this._onKeyDown);
        this.canvas.style.cursor = 'default';
    }

    update(dt) {
        this._time       += dt;
        this._graceTimer -= dt;

        const clicked = this.input.mouse.left && !this._prevMouseLeft;
        this._prevMouseLeft = this.input.mouse.left;

        if (this._graceTimer > 0) {
            // Flush any key that fired during the grace window so it doesn't
            // carry over and dismiss the screen on the very next frame.
            this._keyJustPressed = false;
            return;
        }

        if (clicked || this._keyJustPressed) {
            this._keyJustPressed = false;
            eventBus.emit(GameEvents.INTRO_DISMISSED);
        }
    }

    render(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        if (this.sprites.has('ui_intro')) {
            this.sprites.draw(ctx, 'ui_intro', W / 2, H / 2, W, H);
        } else {
            ctx.fillStyle = '#0a1020';
            ctx.fillRect(0, 0, W, H);
        }

        this._drawWavingText(ctx, 'Click any button to save the stars', W * 0.72, H * 0.55);
    }

    _drawWavingText(ctx, text, centerX, centerY) {
        ctx.save();
        ctx.font         = `bold 26px 'Courier New'`;
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'middle';

        const chars = text.split('');

        // Measure the full string width so we can horizontally centre the block.
        let totalWidth = 0;
        for (const ch of chars) totalWidth += ctx.measureText(ch).width;

        let curX = centerX - totalWidth / 2;
        for (let i = 0; i < chars.length; i++) {
            const dy    = Math.sin(this._time * 3 + i * 0.45) * 10;
            const charW = ctx.measureText(chars[i]).width;

            ctx.shadowColor = '#7ce6ff';
            ctx.shadowBlur  = 14;
            ctx.fillStyle   = '#ffffff';
            ctx.fillText(chars[i], curX, centerY + dy);

            curX += charW;
        }
        ctx.restore();
    }
}
