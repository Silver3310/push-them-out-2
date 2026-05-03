import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/**
 * ArenaSingularity — the Level 5 exclusive, permanent map-wide gravity well.
 *
 * Unlike the transient {@link BlackHole} hazard, the singularity:
 *
 *   - Never despawns — it lives for the entire duration of Level 5.
 *   - Has a pull radius large enough to cover the whole canvas so every
 *     movable object feels a constant inward nudge.
 *   - Applies deliberately gentle forces (see `GameConfig.ARENA_SINGULARITY_*`)
 *     so the effect is a sustained positional challenge rather than a guaranteed
 *     death trap — the kill zone is small and requires prolonged inattention
 *     to enter.
 *   - Does NOT affect the boss (same immunity rule as for transient black holes
 *     and asteroids — enforced by the caller, not here).
 *
 * ### Visual layers (render order, bottom → top)
 *
 *   1. **Map-wide tint** — a very subtle dark radial gradient spanning the
 *      whole pull radius. It makes the entire arena feel "pulled inward"
 *      without obscuring gameplay elements.
 *   2. **Accretion disc** — a moderately-sized rotating spiral (radius ~160 px)
 *      that makes the singularity unmistakably visible at the map centre.
 *   3. **Dark core** — a soft radial gradient creating a "void" effect leading
 *      into the kill zone.
 *   4. **Kill-zone marker** — solid black disc capped with a pulsing violet ring
 *      so the lethal boundary reads clearly.
 */
export class ArenaSingularity extends Entity {
    constructor(x, y) {
        super(x, y);
        this.pullRadius = GameConfig.ARENA_SINGULARITY_PULL_RADIUS;
        this.killRadius = GameConfig.ARENA_SINGULARITY_KILL_RADIUS;
        // Expose as `radius` so safe-spawn checks in managers can treat this
        // as an obstacle with the kill-zone footprint.
        this.radius     = this.killRadius;
        this._spin      = 0;
        this.addTag('arenaSingularity');
    }

    update(dt) {
        if (!this.active) return;
        this._spin += dt * 0.9; // slow cosmetic rotation
    }

    /**
     * Apply one tick of spiral pull to `ball`.
     *
     * Return values mirror {@link BlackHole#affect}:
     *   - `'kill'` — ball reached the lethal core; caller should destroy it.
     *   - `'pull'` — force applied; ball still alive.
     *   - `null`   — ball outside pull radius (no-op).
     *
     * Physics writes only to `ball.vx/vy`; game-state mutations (die/respawn)
     * are the caller's responsibility.
     *
     * @param {{x:number,y:number,vx:number,vy:number,active:boolean,isInHole?:boolean}} ball
     * @returns {('kill'|'pull'|null)}
     */
    affect(ball) {
        if (!this.active || !ball.active || ball.isInHole) return null;

        const dx     = this.x - ball.x;
        const dy     = this.y - ball.y;
        const distSq = dx * dx + dy * dy;

        if (distSq >= this.pullRadius * this.pullRadius) return null;

        const dist = Math.sqrt(distSq) || 0.0001;
        if (dist <= this.killRadius) return 'kill';

        // Falloff: zero at pull edge, maximum just outside kill radius.
        const falloff = 1 - dist / this.pullRadius;
        const radial  = GameConfig.ARENA_SINGULARITY_PULL_FORCE  * falloff;
        const swirl   = GameConfig.ARENA_SINGULARITY_SWIRL_FORCE * falloff;

        const nx = dx / dist;
        const ny = dy / dist;
        // CCW tangential perpendicular — matches the BlackHole convention so
        // both hazards spiral objects in the same rotational direction.
        const tx = -ny;
        const ty =  nx;

        ball.vx += nx * radial + tx * swirl;
        ball.vy += ny * radial + ty * swirl;
        return 'pull';
    }

    render(ctx) {
        if (!this.active) return;

        ctx.save();

        // 1. Subtle map-wide gravity tint — the entire playfield tilts inward.
        _drawFieldTint(ctx, this.x, this.y, this.pullRadius);

        // 2. Visible accretion disc at the centre.
        _drawAccretionDisc(ctx, this.x, this.y, 160, this._spin);

        // 3. Dark void core leading into the kill zone.
        _drawVoidCore(ctx, this.x, this.y, 72);

        // 4. Kill-zone boundary — solid black + pulsing danger ring.
        _drawKillZone(ctx, this.x, this.y, this.killRadius);

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Private rendering helpers
// ---------------------------------------------------------------------------

function _drawFieldTint(ctx, x, y, radius) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,    'rgba(70, 0, 140, 0.28)');
    grad.addColorStop(0.25, 'rgba(45, 0, 100, 0.16)');
    grad.addColorStop(0.60, 'rgba(20, 0,  60, 0.07)');
    grad.addColorStop(1,    'rgba( 5, 0,  20, 0)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawAccretionDisc(ctx, x, y, radius, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';

    const arms    = 6;
    const turns   = 1.6;
    const samples = 64;

    for (let arm = 0; arm < arms; arm++) {
        ctx.beginPath();
        for (let s = 0; s <= samples; s++) {
            const t  = s / samples;
            const r  = radius * (0.14 + 0.82 * t);
            const a  = (arm / arms) * Math.PI * 2 + t * Math.PI * 2 * turns;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        // Outer arms brighter; inner arms more saturated purple.
        const alpha = 0.55 - arm * 0.06;
        ctx.strokeStyle = arm < 2
            ? `rgba(200, 120, 255, ${alpha})`
            : `rgba(140,  60, 220, ${alpha})`;
        ctx.lineWidth = 2.5 - arm * 0.2;
        ctx.stroke();
    }
    ctx.restore();
}

function _drawVoidCore(ctx, x, y, radius) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0,    'rgba(  0,  0,  0, 0.96)');
    grad.addColorStop(0.45, 'rgba( 15,  0, 35, 0.80)');
    grad.addColorStop(1,    'rgba(  0,  0,  0, 0)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawKillZone(ctx, x, y, radius) {
    // Solid lethal core
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();

    // Pulsing danger ring — alerts the player to the exact lethal boundary.
    const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.005);
    ctx.globalAlpha  = pulse;
    ctx.strokeStyle  = 'rgba(210, 100, 255, 0.95)';
    ctx.lineWidth    = 2.5;
    ctx.shadowColor  = '#cc44ff';
    ctx.shadowBlur   = 18;
    ctx.beginPath();
    ctx.arc(x, y, radius + 5, 0, Math.PI * 2);
    ctx.stroke();
    // Secondary outer ring at lower opacity for a halo depth effect
    ctx.globalAlpha *= 0.4;
    ctx.lineWidth    = 1.5;
    ctx.shadowBlur   = 8;
    ctx.beginPath();
    ctx.arc(x, y, radius + 14, 0, Math.PI * 2);
    ctx.stroke();
}
