export class Camera {
    constructor(viewWidth, viewHeight) {
        this.x          = 0;
        this.y          = 0;
        this.viewWidth  = viewWidth;
        this.viewHeight = viewHeight;
        this.zoom       = 1;
    }

    // Smoothly track a target entity, clamped to world bounds
    follow(target, worldWidth, worldHeight) {
        const hw = (this.viewWidth  / 2) / this.zoom;
        const hh = (this.viewHeight / 2) / this.zoom;
        this.x = Math.max(hw, Math.min(worldWidth  - hw, target.x));
        this.y = Math.max(hh, Math.min(worldHeight - hh, target.y));
    }

    applyTransform(ctx) {
        ctx.save();
        ctx.translate(this.viewWidth / 2, this.viewHeight / 2);
        ctx.scale(this.zoom, this.zoom);
        ctx.translate(-this.x, -this.y);
    }

    restoreTransform(ctx) {
        ctx.restore();
    }

    // Convert a canvas (screen) coordinate to world coordinate
    toWorld(screenX, screenY) {
        return {
            x: (screenX - this.viewWidth  / 2) / this.zoom + this.x,
            y: (screenY - this.viewHeight / 2) / this.zoom + this.y,
        };
    }
}