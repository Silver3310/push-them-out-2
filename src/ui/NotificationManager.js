import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Duration of the CSS slide-in / slide-out transition in milliseconds.
 * Must match the `transition` value in `.notification` in style.css.
 */
const SLIDE_MS = 400;

/**
 * DOM-based notification system that displays queued messages in a small
 * galaxy-styled panel.  The panel slides in from the right side of the
 * screen, stays for the requested duration, then slides back out before
 * the next queued notification begins.
 *
 * ## Usage – event-driven (preferred, works from anywhere)
 *   eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Hello!' });
 *   eventBus.emit(GameEvents.SHOW_NOTIFICATION, { message: 'Hello!', duration: 5000 });
 *
 * ## Usage – direct call
 *   notificationManager.show('Hello!', 4000);
 *
 * ## Extending with new notifications
 *   Simply emit SHOW_NOTIFICATION from any module (Game, ScoreManager,
 *   AsteroidManager, etc.) — no wiring changes required.
 */
export class NotificationManager {
    /**
     * @param {HTMLElement} overlay  The #ui-overlay element that notifications
     *                               render into.  Must exist in the DOM.
     */
    constructor(overlay) {
        this._queue   = [];
        this._showing = false;
        this._element = this._createElement();
        overlay.appendChild(this._element);

        eventBus.on(GameEvents.SHOW_NOTIFICATION, ({ message, duration } = {}) => {
            this.show(message, duration);
        });
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Queue a notification message.
     *
     * @param {string} message   Text to display.
     * @param {number} [duration=3000]  How long (ms) the panel stays fully
     *                                  visible, excluding slide animations.
     */
    show(message, duration = 3000) {
        if (typeof message !== 'string' || message.trim() === '') return;
        this._queue.push({ message, duration });
        if (!this._showing) this._showNext();
    }

    /**
     * Clear all pending notifications and immediately hide the current one.
     * Call this when starting a new game so stale messages don't linger.
     */
    reset() {
        this._queue   = [];
        this._showing = false;
        this._element.classList.remove('visible');
        this._element.replaceChildren();
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    _createElement() {
        const el = document.createElement('div');
        el.className = 'notification';
        el.setAttribute('aria-live', 'polite');
        return el;
    }

    _showNext() {
        if (this._queue.length === 0) {
            this._showing = false;
            return;
        }

        this._showing = true;
        const { message, duration } = this._queue.shift();

        // Build content: header strip + message body
        const header = document.createElement('div');
        header.className   = 'notification__header';
        header.textContent = '◈ TRANSMISSION';

        const body = document.createElement('div');
        body.className   = 'notification__body';
        body.textContent = message;

        this._element.replaceChildren(header, body);

        // Double rAF ensures the browser paints the off-screen initial state
        // before the visible class is applied, so the CSS transition fires.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this._element.classList.add('visible');
            });
        });

        // After slide-in + display time, slide out and then show the next item
        setTimeout(() => {
            this._element.classList.remove('visible');
            setTimeout(() => this._showNext(), SLIDE_MS);
        }, SLIDE_MS + duration);
    }
}
