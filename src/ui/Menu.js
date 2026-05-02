import { GameConfig } from '../core/GameConfig.js';
import { LEVELS }     from '../core/LevelConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Main menu screen.
 *
 * Three sub-screens:
 *   - main:   title + waving buttons (Start the game / Rules / About)
 *   - rules:  scrollable static panel describing how to play
 *   - about:  credits + year
 *
 * Animations are time-based and frame-rate independent. The screen draws
 * directly onto the game canvas via render(ctx); the host (Game) decides
 * when to call update()/render() based on its top-level state.
 *
 * The menu does not depend on the rest of the game world; it only
 * requires the canvas (for cursor styling) and the InputHandler instance
 * (for mouse position and click edges). It announces "Start the game"
 * via the shared eventBus (GameEvents.MENU_START_GAME).
 */

const SCREEN = Object.freeze({
    MAIN:  'main',
    RULES: 'rules',
    ABOUT: 'about',
});

export class Menu {
    constructor(canvas, input) {
        this.canvas = canvas;
        this.input  = input;

        this.screen = SCREEN.MAIN;
        this._time  = 0;
        this._prevMouseLeft = false;
        // Last button the cursor was hovering — used to emit
        // MENU_BUTTON_HOVER only on the rising edge so the SFX doesn't
        // spam every frame the cursor sits over a button.
        this._prevHoverId   = null;

        const cx = GameConfig.CANVAS_WIDTH / 2;
        const startY = 320;
        const gap    = 110;
        this._buttons = [
            { id: 'start', label: 'Start the game', x: cx, baseY: startY,           w: 620, h: 80, phase: 0.0 },
            { id: 'rules', label: 'Rules',          x: cx, baseY: startY + gap,     w: 360, h: 80, phase: 1.1 },
            { id: 'about', label: 'About',          x: cx, baseY: startY + gap * 2, w: 360, h: 80, phase: 2.2 },
        ];

        this._stars    = this._generateStars(140);
        this._asteroid = this._spawnAsteroid(true);
    }

    /**
     * Handles ESC press. Returns true if the menu consumed it (i.e. there
     * was a sub-screen to back out of), so the caller can suppress
     * default handling.
     */
    handleEscape() {
        if (this.screen === SCREEN.MAIN) return false;
        this.screen = SCREEN.MAIN;
        return true;
    }

    update(dt) {
        this._time += dt;
        this._updateAsteroid(dt);

        const clicked = this.input.mouse.left && !this._prevMouseLeft;
        this._prevMouseLeft = this.input.mouse.left;

        const hovered = this.screen === SCREEN.MAIN
            ? this._buttonAt(this.input.mouse.x, this.input.mouse.y)
            : null;
        this.canvas.style.cursor = hovered || this.screen !== SCREEN.MAIN ? 'pointer' : 'default';

        // Rising-edge hover detection: emit only when entering a new button,
        // not on every frame the cursor lingers (or on the cursor leaving).
        const hoverId = hovered?.id ?? null;
        if (hoverId !== this._prevHoverId) {
            if (hoverId) eventBus.emit(GameEvents.MENU_BUTTON_HOVER, { id: hoverId });
            this._prevHoverId = hoverId;
        }

        if (!clicked) return;

        if (this.screen !== SCREEN.MAIN) {
            // Click anywhere on a sub-screen returns to the main screen;
            // it's a UI action so we play the click SFX too.
            eventBus.emit(GameEvents.MENU_BUTTON_CLICK, { id: 'back' });
            this.screen = SCREEN.MAIN;
            return;
        }
        if (!hovered) return;

        eventBus.emit(GameEvents.MENU_BUTTON_CLICK, { id: hovered.id });
        if (hovered.id === 'start') eventBus.emit(GameEvents.MENU_START_GAME);
        if (hovered.id === 'rules') this.screen = SCREEN.RULES;
        if (hovered.id === 'about') this.screen = SCREEN.ABOUT;
    }

    render(ctx) {
        this._drawBackground(ctx);
        this._drawAsteroid(ctx);

        if (this.screen === SCREEN.MAIN)  { this._drawTitle(ctx);  this._drawButtons(ctx); return; }
        if (this.screen === SCREEN.RULES) { this._drawRules(ctx);  return; }
        if (this.screen === SCREEN.ABOUT) { this._drawAbout(ctx);  return; }
    }

    /**
     * Reset the cursor style when the menu is dismissed. The Game owns
     * the cursor outside the menu, so we restore the default here.
     */
    deactivate() {
        this.canvas.style.cursor = 'default';
    }

    // -------------------------------------------------------------------------
    // Animation
    // -------------------------------------------------------------------------

    _updateAsteroid(dt) {
        const a = this._asteroid;
        a.y   += a.vy * dt;
        a.rot += a.rotSpeed * dt;
        if (a.y - a.radius > GameConfig.CANVAS_HEIGHT + 40) {
            this._asteroid = this._spawnAsteroid(false);
        }
    }

    _spawnAsteroid(initial) {
        const W = GameConfig.CANVAS_WIDTH;
        const radius = 28 + Math.random() * 22;
        return {
            x:        80 + Math.random() * (W - 160),
            y:        initial ? -radius - Math.random() * 250 : -radius - 20,
            vy:       18 + Math.random() * 18,         // slow fall, ~18-36 px/s
            rot:      Math.random() * Math.PI * 2,
            rotSpeed: (Math.random() - 0.5) * 0.6,     // calm rotation
            radius,
            vertices: this._generateRockShape(radius),
        };
    }

    _generateRockShape(radius) {
        const n = 12;
        const verts = [];
        for (let i = 0; i < n; i++) {
            const angle = (i / n) * Math.PI * 2;
            const r     = radius * (0.78 + Math.random() * 0.32);
            verts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
        }
        return verts;
    }

    _generateStars(count) {
        // Deterministic seed so the starfield doesn't flicker between reloads
        let seed = 7;
        const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
        const stars = [];
        for (let i = 0; i < count; i++) {
            stars.push({
                x:  rand() * GameConfig.CANVAS_WIDTH,
                y:  rand() * GameConfig.CANVAS_HEIGHT,
                r:  rand() * 1.6 + 0.3,
                tw: rand() * Math.PI * 2,
            });
        }
        return stars;
    }

    // -------------------------------------------------------------------------
    // Hit testing
    // -------------------------------------------------------------------------

    _buttonAt(mx, my) {
        for (const b of this._buttons) {
            const y = this._buttonY(b);
            if (mx >= b.x - b.w / 2 && mx <= b.x + b.w / 2 &&
                my >= y - b.h / 2 && my <= y + b.h / 2) return b;
        }
        return null;
    }

    _buttonY(b) {
        return b.baseY + Math.sin(this._time * 1.4 + b.phase) * 8;
    }

    // -------------------------------------------------------------------------
    // Drawing
    // -------------------------------------------------------------------------

    _drawBackground(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;

        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0,    '#0a1c4a');
        grad.addColorStop(0.55, '#1c4f8a');
        grad.addColorStop(1,    '#2a7fb8');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        for (const s of this._stars) {
            const a = 0.45 + Math.sin(this._time * 1.2 + s.tw) * 0.25;
            ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Pixel-square stars drifting downward (homage to the original menu)
        ctx.fillStyle = 'rgba(120, 220, 255, 0.55)';
        for (let i = 0; i < 14; i++) {
            const x = (i * 173.13) % W;
            const y = (i * 91.7 + this._time * 6) % (H + 20);
            ctx.fillRect(x, y, 5, 5);
        }

        // Planet horizon at the bottom
        const planet = ctx.createRadialGradient(W / 2, H + 380, 200, W / 2, H + 380, 720);
        planet.addColorStop(0,   '#9bff9b');
        planet.addColorStop(0.6, '#7da7e8');
        planet.addColorStop(1,   '#1f3469');
        ctx.fillStyle = planet;
        ctx.beginPath();
        ctx.arc(W / 2, H + 380, 720, 0, Math.PI * 2);
        ctx.fill();
    }

    _drawAsteroid(ctx) {
        const a = this._asteroid;
        ctx.save();
        ctx.translate(a.x, a.y);
        ctx.rotate(a.rot);

        ctx.shadowColor = 'rgba(255, 180, 100, 0.4)';
        ctx.shadowBlur  = 18;
        const grad = ctx.createRadialGradient(
            -a.radius * 0.3, -a.radius * 0.3, a.radius * 0.2,
            0, 0, a.radius * 1.2
        );
        grad.addColorStop(0, '#a89084');
        grad.addColorStop(1, '#3a2c28');
        ctx.fillStyle = grad;

        ctx.beginPath();
        a.vertices.forEach((v, i) => {
            if (i === 0) ctx.moveTo(v.x, v.y);
            else         ctx.lineTo(v.x, v.y);
        });
        ctx.closePath();
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle  = 'rgba(40, 25, 22, 0.45)';
        for (let i = 0; i < 4; i++) {
            const angle = i * 1.7;
            const r     = a.radius * 0.45;
            ctx.beginPath();
            ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r, a.radius * 0.12 + (i % 2) * 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    _drawTitle(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = '#7ce6ff';
        ctx.shadowBlur   = 28;
        ctx.fillStyle    = '#ffffff';
        ctx.font = `bold 80px 'Courier New'`;
        ctx.fillText('PushThemOut - Time Is Out', W / 2, 160);

        ctx.shadowBlur = 0;
        ctx.font       = `18px 'Courier New'`;
        ctx.fillStyle  = 'rgba(220, 240, 255, 0.7)';
        ctx.fillText('Knock them into the holes — last one standing wins.', W / 2, 215);
        ctx.restore();
    }

    _drawButtons(ctx) {
        const hovered = this._buttonAt(this.input.mouse.x, this.input.mouse.y);
        for (const b of this._buttons) {
            this._drawButton(ctx, b, this._buttonY(b), hovered === b);
        }
    }

    _drawButton(ctx, b, y, hovered) {
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = hovered ? '#ffffff' : '#7ce6ff';
        ctx.shadowBlur   = hovered ? 40       : 18;
        ctx.fillStyle    = hovered ? '#ffffff' : 'rgba(220, 240, 255, 0.92)';
        ctx.font         = `bold 56px 'Courier New'`;
        ctx.fillText(b.label, b.x, y);
        ctx.restore();
    }

    _drawRules(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 12, 30, 0.6)';
        ctx.fillRect(60, 80, W - 120, H - 160);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor  = '#7ce6ff';
        ctx.shadowBlur   = 22;
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold 64px 'Courier New'`;
        ctx.fillText('Rules', W / 2, 110);

        ctx.shadowBlur = 0;
        ctx.font       = `22px 'Courier New'`;
        ctx.fillStyle  = 'rgba(230, 240, 255, 0.92)';
        ctx.textAlign  = 'left';

        const rules = [
            '• Use WASD (or arrow keys) to move your ball around the arena.',
            '• Left-click to shoot a small projectile that pushes other balls.',
            '• Right-click to use your special burst ability.',
            '• Knock enemies into the corner holes to score stars.',
            '• If you fall in a hole yourself, you respawn after a short delay.',
            `• Clear all ${LEVELS.length} levels — each demands more stars than the last (starting at ${LEVELS[0].starsToWin}, ending at ${LEVELS[LEVELS.length - 1].starsToWin}).`,
            '• Press ESC during the game to pause.',
        ];

        let y = 220;
        rules.forEach(line => { ctx.fillText(line, 120, y); y += 42; });

        this._drawHint(ctx, 'Click anywhere or press ESC to go back');
        ctx.restore();
    }

    _drawAbout(ctx) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();
        ctx.fillStyle = 'rgba(0, 12, 30, 0.6)';
        ctx.fillRect(60, 80, W - 120, H - 160);

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor  = '#7ce6ff';
        ctx.shadowBlur   = 22;
        ctx.fillStyle    = '#ffffff';
        ctx.font         = `bold 64px 'Courier New'`;
        ctx.fillText('About', W / 2, 110);

        ctx.shadowBlur = 0;
        ctx.font       = `28px 'Courier New'`;
        ctx.fillStyle  = 'rgba(230, 240, 255, 0.92)';

        const lines = [
            'PushThemOut 2 — 2026',
            '',
            'Programmer:        silver3310',
            'Graphics designer: mefeliks2140',
            'Sound designer:    wsocha',
        ];
        let y = 230;
        lines.forEach(line => { ctx.fillText(line, W / 2, y); y += 50; });

        this._drawHint(ctx, 'Click anywhere or press ESC to go back');
        ctx.restore();
    }

    _drawHint(ctx, text) {
        const W = GameConfig.CANVAS_WIDTH;
        const H = GameConfig.CANVAS_HEIGHT;
        ctx.save();
        ctx.font         = `18px 'Courier New'`;
        ctx.fillStyle    = 'rgba(180, 220, 255, 0.7)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(text, W / 2, H - 110);
        ctx.restore();
    }
}
