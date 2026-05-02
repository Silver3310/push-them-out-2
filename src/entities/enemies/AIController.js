import { GameConfig } from '../../core/GameConfig.js';
import { distance }   from '../../logic/MathUtils.js';

const AIBehavior = Object.freeze({
    SEEK_PLAYER: 'SEEK_PLAYER',
    FLEE_HOLE:   'FLEE_HOLE',
    WANDER:      'WANDER',
});

/**
 * Drives an Enemy entity. Decisions are reconsidered on a fixed cadence
 * (`ENEMY_AI_THINK_INTERVAL`) and the chosen behaviour is executed each
 * frame as a small steering impulse.
 *
 * If the enemy has the SHOOTER ability, the controller also calls
 * `enemy.fireAt(target)` whenever the cooldown is ready and forwards the
 * returned bullet to the supplied game reference. The decoupling lets the
 * Enemy class own its weapon state machine while the controller still
 * decides who to shoot at.
 */
export class AIController {
    /**
     * @param {Enemy} enemy
     * @param {{holes: Hole[], players: Player[]}} worldRef
     * @param {{ addBullet(bullet: Bullet): void }|null} [gameRef]
     *     Required for shooter enemies so they can publish bullets to the
     *     world. Pass `null` for non-shooting enemies if you want to skip
     *     wiring it.
     */
    constructor(enemy, worldRef, gameRef = null) {
        this.enemy      = enemy;
        this.world      = worldRef;
        this._game      = gameRef;
        this.behavior   = AIBehavior.WANDER;
        this.thinkTimer = 0;
        this._seekTarget = null;
        this._fleeTarget = null;
        this._wanderPos  = { x: 640, y: 360 };
    }

    update(dt) {
        const e = this.enemy;
        if (!e.active || e.isInHole) return;

        this.thinkTimer -= dt;
        if (this.thinkTimer <= 0) {
            this.thinkTimer = GameConfig.ENEMY_AI_THINK_INTERVAL;
            this._decide();
        }
        this._execute();
        this._maybeFire();
    }

    _decide() {
        const e = this.enemy;

        // Safety first: flee any nearby hole
        const dangerHole = this.world.holes.find(
            h => distance(e.x, e.y, h.x, h.y) < GameConfig.HOLE_PULL_RADIUS * 2.5
        );
        if (dangerHole) {
            this.behavior    = AIBehavior.FLEE_HOLE;
            this._fleeTarget = dangerHole;
            return;
        }

        // Seek the nearest active player
        const targets = this.world.players.filter(p => p.active && !p.isInHole);
        if (targets.length > 0) {
            this.behavior     = AIBehavior.SEEK_PLAYER;
            this._seekTarget  = targets.reduce((best, p) =>
                distance(e.x, e.y, p.x, p.y) < distance(e.x, e.y, best.x, best.y) ? p : best
            );
            return;
        }

        // Nothing to do – drift toward a random spot
        this.behavior    = AIBehavior.WANDER;
        this._wanderPos  = {
            x: 100 + Math.random() * (GameConfig.CANVAS_WIDTH  - 200),
            y: 100 + Math.random() * (GameConfig.CANVAS_HEIGHT - 200),
        };
    }

    _execute() {
        const e     = this.enemy;
        const speed = GameConfig.ENEMY_AI_SPEED;
        let tx, ty;

        if (this.behavior === AIBehavior.SEEK_PLAYER && this._seekTarget) {
            tx = this._seekTarget.x;
            ty = this._seekTarget.y;
        } else if (this.behavior === AIBehavior.FLEE_HOLE && this._fleeTarget) {
            // Move directly away from the hole
            tx = e.x + (e.x - this._fleeTarget.x);
            ty = e.y + (e.y - this._fleeTarget.y);
        } else {
            tx = this._wanderPos.x;
            ty = this._wanderPos.y;
        }

        const dx   = tx - e.x;
        const dy   = ty - e.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
            e.applyImpulse((dx / dist) * speed, (dy / dist) * speed);
        }
    }

    /**
     * If the enemy has the SHOOTER ability and the cooldown is ready, fire
     * a bullet aimed at the current seek target. No-op for non-shooters.
     */
    _maybeFire() {
        if (!this._game) return;
        if (!this.enemy.canFire) return;
        const target = this._seekTarget;
        if (!target || !target.active || target.isInHole) return;
        const bullet = this.enemy.fireAt(target);
        if (bullet) this._game.addBullet(bullet);
    }
}
