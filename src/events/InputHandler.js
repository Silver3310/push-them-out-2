export class InputHandler {
    constructor(canvas) {
        this.canvas = canvas;
        this.keys   = {};
        this.mouse  = { x: 0, y: 0, left: false, right: false };
        this._bindings = [];
        this._attach();
    }

    _attach() {
        const bind = (target, event, fn) => {
            target.addEventListener(event, fn);
            this._bindings.push({ target, event, fn });
        };

        bind(window, 'keydown', e => { this.keys[e.code] = true; });
        bind(window, 'keyup',   e => { this.keys[e.code] = false; });

        bind(this.canvas, 'mousemove', e => {
            const r = this.canvas.getBoundingClientRect();
            // Map CSS pixels → logical canvas pixels accounting for CSS scaling
            this.mouse.x = (e.clientX - r.left) * (this.canvas.width  / r.width);
            this.mouse.y = (e.clientY - r.top)  * (this.canvas.height / r.height);
        });

        bind(this.canvas, 'mousedown', e => {
            if (e.button === 0) this.mouse.left  = true;
            if (e.button === 2) this.mouse.right = true;
        });

        bind(this.canvas, 'mouseup', e => {
            if (e.button === 0) this.mouse.left  = false;
            if (e.button === 2) this.mouse.right = false;
        });

        bind(this.canvas, 'contextmenu', e => e.preventDefault());
    }

    isKeyDown(code) { return !!this.keys[code]; }

    destroy() {
        this._bindings.forEach(({ target, event, fn }) =>
            target.removeEventListener(event, fn)
        );
        this._bindings = [];
    }
}