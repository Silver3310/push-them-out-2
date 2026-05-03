import { Entity } from '../base/Entity.js';

/**
 * Visual telegraph for an upcoming hazardous spawn.
 *
 * Rendered as a yellow translucent circle whose radius matches the
 * inbound entity, with a pulsing exclamation mark inside. Lives for
 * `duration` seconds and then triggers its `onFire` callback before
 * deactivating. Owned exclusively by {@link WarningManager}; do not
 * instantiate directly.
 *
 * The mark is drawn from canvas primitives (rectangle + dot) rather
 * than text so it scales cleanly at any radius and is unaffected by
 * font availability.
 */
export class SpawnWarning extends Entity {
    /**
     * @param {number}   x         World x of the future spawn centre.
     * @param {number}   y         World y of the future spawn centre.
     * @param {number}   radius    Visual radius — should match the entity
     *                             that will appear so the ring encloses it.
     * @param {number}   duration  Seconds to display the warning before firing.
     * @param {Function} onFire    Callback invoked exactly once when `duration`
     *                             elapses (right before the warning deactivates).
     */
    constructor(x, y, radius, duration, onFire) {
        super(x, y);
        this.radius   = radius;
        this.duration = duration;
        this.onFire   = onFire;
        this._age     = 0;
        this._fired   = false;
        this.addTag('spawnWarning');
    }

    /** 0..1 — fraction of the warning's lifetime that has elapsed. */
    get progress() {
        return Math.min(1, this._age / this.duration);
    }

    update(dt) {
        if (!this.active) return;
        this._age += dt;

        if (this._age >= this.duration && !this._fired) {
            this._fired = true;
            try { this.onFire?.(); }
            finally { this.destroy(); }
        }
    }

    render(ctx) {
        if (!this.active) return;

        // Pulse at ~2 Hz so the warning catches the eye throughout its life.
        const pulse  = 0.5 + 0.5 * Math.sin(performance.now() * 0.012);
        const alpha  = 0.45 + 0.45 * pulse;
        const r      = this.radius;

        ctx.save();

        // Soft fill so the circle reads even on busy backgrounds.
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 220, 60, ${alpha * 0.22})`;
        ctx.fill();

        // Dashed outline — universally readable as "warning zone".
        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 200, 0, ${alpha})`;
        ctx.lineWidth   = 3;
        ctx.setLineDash([10, 6]);
        ctx.shadowColor = '#ffaa00';
        ctx.shadowBlur  = 14;
        ctx.stroke();
        ctx.setLineDash([]);

        _drawExclamation(ctx, this.x, this.y, r, alpha);

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Module-level helpers (private)
// ---------------------------------------------------------------------------

/**
 * Draw a stylised exclamation mark sized relative to `r`. Uses primitive
 * shapes (rounded rectangle + circle) so the glyph stays crisp at any radius
 * and renders identically across browsers regardless of font availability.
 */
function _drawExclamation(ctx, x, y, r, alpha) {
    const stemW   = Math.max(3, r * 0.16);
    const stemH   = r * 0.55;
    const dotR    = Math.max(2, r * 0.12);
    const gap     = r * 0.12;

    ctx.fillStyle = `rgba(255, 240, 120, ${alpha})`;
    ctx.shadowColor = '#ff9900';
    ctx.shadowBlur  = 10;

    // Stem (rounded rectangle, top portion of the mark)
    const stemTop = y - stemH * 0.6;
    _roundedRect(ctx, x - stemW / 2, stemTop, stemW, stemH, stemW * 0.4);
    ctx.fill();

    // Dot (bottom)
    ctx.beginPath();
    ctx.arc(x, stemTop + stemH + gap + dotR, dotR, 0, Math.PI * 2);
    ctx.fill();
}

function _roundedRect(ctx, x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
