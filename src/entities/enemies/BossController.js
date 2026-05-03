import { AIController } from './AIController.js';
import { GameConfig }   from '../../core/GameConfig.js';

/**
 * AIController extension that adds the two boss-only mechanics — dash
 * and the killing-ray attack — on top of the standard seek/wander/flee
 * brain.
 *
 * Behaviour stack (per fixed timestep):
 *   1. base AIController.update — picks seek target, applies movement
 *      impulse, and (since the boss has the SHOOTER ability) fires bullets
 *      via `Enemy.fireAt()`.
 *   2. `_maybeDash`             — whenever the dash cooldown has elapsed the
 *      boss bursts toward the player, regardless of distance. The only gate
 *      is the cooldown timer (`BOSS_DASH_COOLDOWN`).
 *   3. `boss.updateRay`         — drives the ray attack state machine; the
 *      boss internally cycles idle → telegraph → firing → idle.
 */
export class BossController extends AIController {
    constructor(boss, worldRef, gameRef = null) {
        super(boss, worldRef, gameRef);
        this._dashCooldown = GameConfig.BOSS_DASH_COOLDOWN;
    }

    update(dt) {
        super.update(dt);
        this._maybeDash(dt);
        this.enemy.updateRay(dt, this._seekTarget);
    }

    _maybeDash(dt) {
        this._dashCooldown -= dt;
        if (this._dashCooldown > 0) return;
        const target = this._seekTarget;
        if (!target || !target.active || target.isInHole) return;

        // Distance check intentionally removed — the boss dashes at any range.
        this.enemy.dash(target.x, target.y);
        this._dashCooldown = GameConfig.BOSS_DASH_COOLDOWN;
    }
}
