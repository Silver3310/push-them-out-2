import { GameConfig } from '../core/GameConfig.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx    = canvas.getContext('2d');
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    // Keep the canvas logical size fixed at GameConfig dimensions
    // but letterbox/pillarbox it inside the browser window
    _resize() {
        const aspect = GameConfig.CANVAS_WIDTH / GameConfig.CANVAS_HEIGHT;
        const ww     = window.innerWidth;
        const wh     = window.innerHeight;
        let cw, ch;
        if (ww / wh > aspect) {
            ch = wh;
            cw = wh * aspect;
        } else {
            cw = ww;
            ch = ww / aspect;
        }
        this.canvas.style.width  = `${cw}px`;
        this.canvas.style.height = `${ch}px`;
        this.canvas.width  = GameConfig.CANVAS_WIDTH;
        this.canvas.height = GameConfig.CANVAS_HEIGHT;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Paint the level background. The two gradient stops come from the
     * `LevelManager`'s render spec, which interpolates them mid-transition
     * so consecutive levels cross-fade smoothly.
     *
     * @param {{bgInner: string, bgOuter: string}} spec
     */
    drawBackground(spec) {
        const ctx = this.ctx;
        const cx  = GameConfig.CANVAS_WIDTH  / 2;
        const cy  = GameConfig.CANVAS_HEIGHT / 2;
        const r   = Math.max(GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT) * 0.8;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, spec.bgInner);
        gradient.addColorStop(1, spec.bgOuter);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Starfield – static pattern drawn from a seeded list for performance
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        for (const [sx, sy, sr] of _STARS) {
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    /**
     * Stroke the play-field border using the active level's accent colours.
     *
     * @param {{x: number, y: number, w: number, h: number}} rect
     * @param {{borderColor: string, borderShadow: string}} spec
     */
    drawTableBorder(rect, spec) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = spec.borderColor;
        ctx.lineWidth   = 6;
        ctx.shadowColor = spec.borderShadow;
        ctx.shadowBlur  = 18;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    /**
     * Render the in-game HUD.
     *
     * @param {object} scoreSnapshot - From `ScoreManager.getSnapshot()`. Uses
     *     `starsCollectedThisLevel` (per-level progress) and `starsLost`.
     * @param {object} levelInfo     - `{ name: string, starsToWin: number }`
     *     pulled from the active `LevelManager.current`.
     * @param {Player[]} players
     */
    drawHUD(scoreSnapshot, levelInfo, players) {
        const ctx = this.ctx;
        const W   = GameConfig.CANVAS_WIDTH;
        ctx.save();
        ctx.textBaseline = 'middle';

        // Level name (top-centre)
        ctx.font      = `bold 13px 'Courier New'`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.textAlign = 'center';
        ctx.fillText(levelInfo.name, W / 2, 20);

        // Star progress (top-right): gold ★ collected / goal
        const collected = scoreSnapshot.starsCollectedThisLevel;
        const goal      = levelInfo.starsToWin;
        ctx.font      = `bold 16px 'Courier New'`;
        ctx.fillStyle = '#ffd700';
        ctx.textAlign = 'right';
        ctx.shadowColor = 'rgba(255, 215, 0, 0.6)';
        ctx.shadowBlur  = 6;
        ctx.fillText(`★ ${collected} / ${goal}`, W - 20, 20);
        ctx.shadowBlur = 0;

        // Stars-lost indicator (small, muted, below star counter)
        if (scoreSnapshot.starsLost > 0) {
            ctx.font      = `11px 'Courier New'`;
            ctx.fillStyle = 'rgba(200, 100, 100, 0.75)';
            ctx.fillText(`${scoreSnapshot.starsLost} lost`, W - 20, 38);
        }

        // Player panels (top-left, one per player)
        let px = 20;
        players.forEach(p => {
            // Coloured dot
            ctx.beginPath();
            ctx.arc(px + 10, 20, 10, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            // Name + death counter
            ctx.fillStyle    = '#ffffff';
            ctx.textAlign    = 'left';
            ctx.font         = `bold 12px 'Courier New'`;
            ctx.fillText(p.name.toUpperCase(), px + 26, 14);
            ctx.fillStyle = '#aaaaaa';
            ctx.font      = `11px 'Courier New'`;
            ctx.fillText(`${p.deaths} Deaths`, px + 26, 28);

            px += 180;
        });

        ctx.restore();
    }

    drawControls() {
        const ctx = this.ctx;
        ctx.save();
        ctx.font      = `14px 'Courier New'`;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'left';
        const lines = [
            'WASD to move',
            'Left click to shoot',
            'Right click – special ability',
        ];
        lines.forEach((line, i) => {
            ctx.fillText(line, 20, GameConfig.CANVAS_HEIGHT - 20 - (lines.length - 1 - i) * 18);
        });
        ctx.restore();
    }

    /**
     * Render every active hazard warning, one stacked panel per entry.
     * Each entry pulses between full and half opacity so it catches the
     * eye without obscuring gameplay. The countdown rounds up, so a
     * 10-second window reads "10" at the very start and "1" in the
     * last second.
     *
     * Game.js collects warnings from each hazard manager and forwards
     * them here in a single call, so the renderer doesn't need to know
     * about individual hazard types.
     *
     * @param {{label: string, countdown: number}[]} warnings
     *   Each entry: a short label (no leading punctuation) and the
     *   seconds remaining until the event fires (must be > 0).
     */
    drawHazardWarnings(warnings) {
        if (!warnings || warnings.length === 0) return;

        const ctx = this.ctx;
        const W   = GameConfig.CANVAS_WIDTH;

        // Pulse between 0.55 and 1.0 opacity at ~1 Hz
        const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(Date.now() * 0.006));

        ctx.save();
        ctx.globalAlpha  = pulse;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        warnings.forEach((w, i) => {
            const yLabel = 58 + i * 38;
            const ySecs  = yLabel + 22;

            ctx.font         = `bold 22px 'Courier New'`;
            ctx.fillStyle    = '#ff4400';
            ctx.shadowColor  = '#ff2200';
            ctx.shadowBlur   = 14;
            ctx.fillText(`!! ${w.label} !!`, W / 2, yLabel);

            const secs = Math.ceil(w.countdown);
            ctx.font        = `bold 16px 'Courier New'`;
            ctx.fillStyle   = '#ffaa00';
            ctx.shadowColor = '#ff8800';
            ctx.shadowBlur  = 8;
            ctx.fillText(`${secs}s`, W / 2, ySecs);
        });

        ctx.restore();
    }
}

// Pre-baked star positions so the starfield is stable across frames
const _STARS = (() => {
    const stars = [];
    let seed = 42;
    const rand = () => { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; };
    for (let i = 0; i < 120; i++) {
        stars.push([
            rand() * GameConfig.CANVAS_WIDTH,
            rand() * GameConfig.CANVAS_HEIGHT,
            rand() * 1.5 + 0.3,
        ]);
    }
    return stars;
})();