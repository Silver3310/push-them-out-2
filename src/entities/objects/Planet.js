import { Entity }     from '../base/Entity.js';
import { GameConfig } from '../../core/GameConfig.js';

export class Planet extends Entity {
    constructor(x, y, radius, color = '#c8e06e') {
        super(x, y);
        this.radius      = radius;
        this.color       = color;
        this.restitution = GameConfig.PLANET_BOUNCE_RESTITUTION;
        this.addTag('planet');
    }

    render(ctx) {
        ctx.save();

        const gradient = ctx.createRadialGradient(
            this.x - this.radius * 0.3,
            this.y - this.radius * 0.3,
            this.radius * 0.1,
            this.x, this.y, this.radius
        );
        gradient.addColorStop(0,   '#ffffff44');
        gradient.addColorStop(0.3,  this.color);
        gradient.addColorStop(1,    this._darken(this.color, 0.45));

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Faint rim highlight
        ctx.strokeStyle = this.color + '88';
        ctx.lineWidth   = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    _darken(hex, amount) {
        const n = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, Math.floor(((n >> 16) & 0xff) * (1 - amount)));
        const g = Math.max(0, Math.floor(((n >>  8) & 0xff) * (1 - amount)));
        const b = Math.max(0, Math.floor(( n        & 0xff) * (1 - amount)));
        return `rgb(${r},${g},${b})`;
    }
}