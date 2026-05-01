import { GameConfig } from '../../core/GameConfig.js';
import { distance }   from '../../logic/MathUtils.js';

const AIBehavior = Object.freeze({
    SEEK_PLAYER: 'SEEK_PLAYER',
    FLEE_HOLE:   'FLEE_HOLE',
    WANDER:      'WANDER',
});

export class AIController {
    constructor(enemy, worldRef) {
        this.enemy      = enemy;
        this.world      = worldRef; // { holes: Hole[], players: Player[] }
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
}