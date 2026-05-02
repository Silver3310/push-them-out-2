import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

/** Sprite key used in assets/sprites/sprites.json for the black hole. */
export const BLACK_HOLE_SPRITE_KEY = 'black_hole';

/**
 * BlackHole hazard – a short-lived gravity well that sucks any nearby
 * ball-like entity inward in a spiral and destroys it when it reaches
 * the central kill zone.
 *
 * Unlike a {@link Hole} (the ever-present pool-pocket), a black hole:
 *
 *   - lives for `GameConfig.BLACK_HOLE_LIFESPAN` seconds and then vanishes,
 *   - applies BOTH a radial pull AND a tangential ("swirl") force so that
 *     captured objects spiral inward visibly rather than falling straight in,
 *   - kills anything that crosses `killRadius` regardless of who it is —
 *     player, enemy, star, or asteroid.
 *
 * The very centre is hard-painted opaque black on top of any sprite, so
 * the kill zone reads visually as a featureless void at all times. This is
 * a hard guarantee of the design — see the procedural fallback below.
 *
 * ### Rendering precedence
 *
 *   1. If a SpriteManager is provided AND the configured sprite key
 *      ("black_hole") is loaded, the sprite is drawn at the pull-radius
 *      diameter, slowly rotating to suggest spiral motion. The opaque
 *      black core is then composited on top, so designers can swap art
 *      without ever masking the lethal centre.
 *   2. Otherwise a procedural multi-stop radial gradient is drawn so the
 *      game still works without any asset files.
 *
 * Customise the look at any time:
 *
 *   sprites.swapSprite('black_hole', 'assets/sprites/objects/my_blackhole.png')
 */
export class BlackHole extends Entity {
    /**
     * @param {number}             x        World x of the singularity centre.
     * @param {number}             y        World y of the singularity centre.
     * @param {SpriteManager|null} sprites  Optional sprite manager.
     */
    constructor(x, y, sprites = null) {
        super(x, y);
        this._sprites    = sprites;
        this.pullRadius  = GameConfig.BLACK_HOLE_PULL_RADIUS;
        this.killRadius  = GameConfig.BLACK_HOLE_KILL_RADIUS;
        // Used by callers that treat hazards as round obstacles (e.g.
        // safe-spawn checks). Mirrors the Hole/Planet shape.
        this.radius      = this.pullRadius;
        this.lifespan    = GameConfig.BLACK_HOLE_LIFESPAN;
        this._age        = 0;
        this._spinAngle  = Math.random() * Math.PI * 2;
        this.addTag('blackHole');
    }

    /** 0..1 — fraction of life elapsed (used for fade-in/fade-out alpha). */
    get lifeProgress() {
        return Math.min(1, this._age / this.lifespan);
    }

    update(dt) {
        if (!this.active) return;
        this._age += dt;
        // Slow visible spin — purely cosmetic; physics swirl is constant.
        this._spinAngle += dt * 2.6;
        if (this._age >= this.lifespan) {
            this.destroy();
        }
    }

    /**
     * Apply a single tick of spiral pull to a ball-shaped entity.
     *
     * Returns the interaction kind so the manager can react:
     *   - `'kill'` – the ball crossed `killRadius` and should die now.
     *   - `'pull'` – force was applied; the ball is still alive.
     *   - `null`   – the ball was outside the pull radius (no-op).
     *
     * No game-state mutation happens here beyond writing to `ball.vx/vy`;
     * the manager is responsible for actually killing the entity so the
     * blast-radius rules for player/enemy/star differ correctly.
     *
     * @param {{x:number,y:number,vx:number,vy:number,active:boolean,isInHole?:boolean}} ball
     * @returns {('kill'|'pull'|null)}
     */
    affect(ball) {
        if (!this.active || !ball.active || ball.isInHole) return null;
        const dx = this.x - ball.x;
        const dy = this.y - ball.y;
        const distSq = dx * dx + dy * dy;
        if (distSq >= this.pullRadius * this.pullRadius) return null;

        const dist = Math.sqrt(distSq) || 0.0001;
        if (dist <= this.killRadius) return 'kill';

        // Falloff: full force at the edge of kill radius, zero at pull edge
        const falloff           = 1 - dist / this.pullRadius;
        const radialStrength    = GameConfig.BLACK_HOLE_PULL_FORCE  * falloff;
        const tangentialStrength = GameConfig.BLACK_HOLE_SWIRL_FORCE * falloff;

        const nx = dx / dist;
        const ny = dy / dist;
        // Tangential perpendicular (CCW). The swirl direction is
        // intentionally fixed so multiple black holes don't cancel each
        // other out into a confusing tug-of-war for the player.
        const tx = -ny;
        const ty =  nx;

        ball.vx += nx * radialStrength + tx * tangentialStrength;
        ball.vy += ny * radialStrength + ty * tangentialStrength;
        return 'pull';
    }

    render(ctx) {
        if (!this.active) return;

        // Smooth fade in/out across lifetime (ease-out then ease-in).
        // Peaks at the midpoint so the player has time to read the threat.
        const t     = this.lifeProgress;
        const alpha = t < 0.15 ? t / 0.15
                    : t > 0.85 ? (1 - t) / 0.15
                    : 1;

        ctx.save();
        ctx.globalAlpha = alpha;

        // Outer pull-radius gradient is always drawn so the danger field is
        // legible even when a sprite is in use (it sits behind the sprite).
        _drawPullField(ctx, this.x, this.y, this.pullRadius);

        if (this._sprites?.has(BLACK_HOLE_SPRITE_KEY)) {
            const d = this.pullRadius * 1.6;
            this._sprites.draw(ctx, BLACK_HOLE_SPRITE_KEY, this.x, this.y, d, d, {
                rotation: this._spinAngle,
            });
        } else {
            _drawProceduralBlackHole(ctx, this.x, this.y, this.pullRadius, this._spinAngle);
        }

        // The opaque kill core is ALWAYS drawn on top, sprite or not, so the
        // lethal centre is unmistakable regardless of artwork.
        _drawKillCore(ctx, this.x, this.y, this.killRadius);

        ctx.restore();
    }
}

// ---------------------------------------------------------------------------
// Procedural drawing helpers (private, module-scoped)
// ---------------------------------------------------------------------------

function _drawPullField(ctx, x, y, radius) {
    const grad = ctx.createRadialGradient(x, y, radius * 0.15, x, y, radius);
    grad.addColorStop(0,    'rgba( 90,  20, 130, 0.55)');
    grad.addColorStop(0.55, 'rgba( 50,  10,  90, 0.25)');
    grad.addColorStop(1,    'rgba( 10,   0,  30, 0)');
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
}

function _drawProceduralBlackHole(ctx, x, y, radius, angle) {
    // Two interleaved spiral arcs to suggest the accretion-disk swirl.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.lineCap = 'round';

    const arms = 5;
    const turns = 1.4;
    const samples = 50;

    for (let arm = 0; arm < arms; arm++) {
        ctx.beginPath();
        for (let s = 0; s <= samples; s++) {
            const t = s / samples;
            const r = radius * (0.18 + 0.78 * t);
            const a = (arm / arms) * Math.PI * 2 + t * Math.PI * 2 * turns;
            const px = Math.cos(a) * r;
            const py = Math.sin(a) * r;
            s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.strokeStyle = `rgba(220, 160, 255, ${0.35 - arm * 0.04})`;
        ctx.lineWidth   = 2;
        ctx.stroke();
    }
    ctx.restore();
}

function _drawKillCore(ctx, x, y, radius) {
    // Solid black with a faint violet rim — clearly the "void" zone.
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#000000';
    ctx.fill();
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = 'rgba(180, 100, 255, 0.85)';
    ctx.stroke();
}
