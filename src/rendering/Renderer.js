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

    drawBackground() {
        const ctx = this.ctx;
        const cx  = GameConfig.CANVAS_WIDTH  / 2;
        const cy  = GameConfig.CANVAS_HEIGHT / 2;
        const r   = Math.max(GameConfig.CANVAS_WIDTH, GameConfig.CANVAS_HEIGHT) * 0.8;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gradient.addColorStop(0, '#1a0030');
        gradient.addColorStop(1, '#050008');
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

    drawTableBorder(rect) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#4a0060';
        ctx.lineWidth   = 6;
        ctx.shadowColor = '#9900cc';
        ctx.shadowBlur  = 18;
        ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
        ctx.restore();
    }

    drawHUD(scoreSnapshot, players) {
        const ctx = this.ctx;
        const W   = GameConfig.CANVAS_WIDTH;
        ctx.save();

        // Stars counter (top-right)
        ctx.font      = `bold 16px 'Courier New'`;
        ctx.fillStyle = '#00ccff';
        ctx.textAlign = 'right';
        ctx.fillText(`${scoreSnapshot.stars}/${GameConfig.STARS_TO_WIN} stars`, W - 20, 30);

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
            ctx.textBaseline = 'middle';
            ctx.fillText(`${p.name.toUpperCase()}`, px + 26, 14);
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