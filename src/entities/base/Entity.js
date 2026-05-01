let _nextId = 0;

export class Entity {
    constructor(x = 0, y = 0) {
        this.id     = _nextId++;
        this.x      = x;
        this.y      = y;
        this.active = true;
        this.tags   = new Set();
    }

    update(_dt) {}
    render(_ctx) {}

    destroy() {
        this.active = false;
    }

    addTag(tag)    { this.tags.add(tag); return this; }
    hasTag(tag)    { return this.tags.has(tag); }
    removeTag(tag) { this.tags.delete(tag); return this; }
}