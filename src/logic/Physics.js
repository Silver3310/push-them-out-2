import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

export class Physics {
    constructor(width, height) {
        this.width  = width;
        this.height = height;
    }

    // Master update: call once per fixed timestep
    update(balls, planets, holes) {
        this._applyHolePull(balls, holes);
        this._resolveBallBallCollisions(balls);
        this._resolveBallPlanetCollisions(balls, planets);
        this._resolveWallCollisions(balls);
    }

    _applyHolePull(balls, holes) {
        holes.forEach(hole => balls.forEach(ball => hole.checkBall(ball)));
    }

    _resolveBallBallCollisions(balls) {
        const active = balls.filter(b => b.active && !b.isInHole);
        for (let i = 0; i < active.length; i++) {
            for (let j = i + 1; j < active.length; j++) {
                this._collideBalls(active[i], active[j]);
            }
        }
    }

    _collideBalls(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.radius + b.radius;
        if (dist >= minDist || dist === 0) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;
        const totalMass = a.mass + b.mass;

        // Positional correction to prevent sinking
        a.x -= nx * overlap * (b.mass / totalMass);
        a.y -= ny * overlap * (b.mass / totalMass);
        b.x += nx * overlap * (a.mass / totalMass);
        b.y += ny * overlap * (a.mass / totalMass);

        // Impulse-based elastic collision
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const velAlongNormal = rvx * nx + rvy * ny;
        if (velAlongNormal > 0) return; // Already separating

        const impulseMag = -(1 + GameConfig.BALL_RESTITUTION) * velAlongNormal / totalMass;
        a.vx -= impulseMag * b.mass * nx;
        a.vy -= impulseMag * b.mass * ny;
        b.vx += impulseMag * a.mass * nx;
        b.vy += impulseMag * a.mass * ny;

        eventBus.emit(GameEvents.BALL_HIT, {
            a, b,
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            strength: Math.abs(velAlongNormal),
        });
    }

    _resolveBallPlanetCollisions(balls, planets) {
        balls.forEach(ball => {
            if (!ball.active || ball.isInHole) return;
            planets.forEach(planet => {
                const dx   = ball.x - planet.x;
                const dy   = ball.y - planet.y;
                const dist = Math.hypot(dx, dy);
                const minDist = ball.radius + planet.radius;
                if (dist >= minDist || dist === 0) return;

                const nx = dx / dist;
                const ny = dy / dist;
                ball.x += nx * (minDist - dist);
                ball.y += ny * (minDist - dist);

                // Reflect velocity off planet surface with restitution
                const dot = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dot * nx) * planet.restitution;
                ball.vy = (ball.vy - 2 * dot * ny) * planet.restitution;
            });
        });
    }

    _resolveWallCollisions(balls) {
        const rest = GameConfig.WALL_RESTITUTION;
        balls.forEach(ball => {
            if (!ball.active || ball.isInHole) return;
            const r = ball.radius;

            if (ball.x - r < 0) {
                ball.x = r;
                ball.vx = Math.abs(ball.vx) * rest;
            } else if (ball.x + r > this.width) {
                ball.x = this.width - r;
                ball.vx = -Math.abs(ball.vx) * rest;
            }

            if (ball.y - r < 0) {
                ball.y = r;
                ball.vy = Math.abs(ball.vy) * rest;
            } else if (ball.y + r > this.height) {
                ball.y = this.height - r;
                ball.vy = -Math.abs(ball.vy) * rest;
            }
        });
    }
}