import { GameConfig } from '../../core/GameConfig.js';
import { eventBus }   from '../../events/EventBus.js';
import { GameEvents } from '../../events/GameEvents.js';
import { Bullet }    from '../objects/Bullet.js';

export class PlayerController {
    constructor(player, inputHandler, gameRef = null) {
        this.player = player;
        this.input  = inputHandler;
        this.game   = gameRef;
        this._prevLeft  = false;
        this._prevRight = false;
    }

    /**
     * Snapshot the current mouse-button state into the rising-edge
     * trackers. Call this right after construction when a button is
     * already held (e.g. the click that dismissed the main menu) to
     * avoid an immediate phantom shot on the first update().
     */
    syncInputState() {
        this._prevLeft  = this.input.mouse.left;
        this._prevRight = this.input.mouse.right;
    }

    update(dt) {
        const p = this.player;
        if (!p.active || p.isInHole) return;

        // WASD / arrow-key thrust. Thrust input scales by the player's
        // current movement multiplier so status effects (e.g. "fat & slow"
        // from eating a cake) feel sluggish in line with the visual cue.
        const t = GameConfig.PLAYER_THRUST * p.movementMultiplier;
        if (this.input.isKeyDown('KeyW')     || this.input.isKeyDown('ArrowUp'))    p.applyImpulse(0,  -t);
        if (this.input.isKeyDown('KeyS')     || this.input.isKeyDown('ArrowDown'))  p.applyImpulse(0,   t);
        if (this.input.isKeyDown('KeyA')     || this.input.isKeyDown('ArrowLeft'))  p.applyImpulse(-t,  0);
        if (this.input.isKeyDown('KeyD')     || this.input.isKeyDown('ArrowRight')) p.applyImpulse(t,   0);

        // Left click: shoot toward cursor (rising-edge only)
        if (this.input.mouse.left && !this._prevLeft) this._shoot();
        this._prevLeft = this.input.mouse.left;

        // Right click: special burst (rising-edge, respects cooldown)
        if (this.input.mouse.right && !this._prevRight) this._special();
        this._prevRight = this.input.mouse.right;
    }

    _shoot() {
        if (!this.game) return; // No game reference, can't shoot
        
        const p  = this.player;
        const dx = this.input.mouse.x - p.x;
        const dy = this.input.mouse.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        
        // Create bullet at player position
        const bullet = new Bullet(
            p.x,
            p.y,
            (dx / len) * GameConfig.BULLET_SPEED,
            (dy / len) * GameConfig.BULLET_SPEED
        );
        
        this.game.addBullet(bullet);
        eventBus.emit(GameEvents.BALL_SHOOT, { ball: p });
    }

    _special() {
        if (this.player.specialCooldown > 0) return;
        this.player.specialCooldown = 3.0;
        const p  = this.player;
        const dx = this.input.mouse.x - p.x;
        const dy = this.input.mouse.y - p.y;
        const len = Math.hypot(dx, dy) || 1;
        p.applyImpulse(
            (dx / len) * GameConfig.PLAYER_SHOOT_POWER * 2.2,
            (dy / len) * GameConfig.PLAYER_SHOOT_POWER * 2.2
        );
        eventBus.emit(GameEvents.BALL_SHOOT, { ball: p, special: true });
    }
}