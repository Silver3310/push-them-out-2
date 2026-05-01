class EventBus {
    constructor() {
        this._listeners = new Map();
    }

    // Subscribe; returns an unsubscribe function for convenience
    on(event, listener) {
        if (!this._listeners.has(event)) this._listeners.set(event, []);
        this._listeners.get(event).push(listener);
        return () => this.off(event, listener);
    }

    off(event, listener) {
        const list = this._listeners.get(event);
        if (!list) return;
        const i = list.indexOf(listener);
        if (i !== -1) list.splice(i, 1);
    }

    emit(event, data) {
        const list = this._listeners.get(event);
        if (!list) return;
        // Shallow-copy so listeners added during dispatch don't fire this round
        list.slice().forEach(fn => fn(data));
    }

    clear() {
        this._listeners.clear();
    }
}

// Single shared bus for the whole game
export const eventBus = new EventBus();