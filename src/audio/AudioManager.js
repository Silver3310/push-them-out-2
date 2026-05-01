import { AudioEngine } from './AudioEngine.js';
import { eventBus }    from '../events/EventBus.js';
import { GameEvents }  from '../events/GameEvents.js';

/**
 * High-level audio API. Loads sounds from a JSON manifest, wires up game
 * events to sound effects, and delegates spatial volume to AudioEngine.
 *
 * Manifest format (assets/sounds/sounds.json):
 *   { "sounds": { "key": { "src": "path.ogg", "preload": true, "category": "sfx|music" } } }
 *
 * Swap any sound at runtime: change the src in sounds.json and call
 * loadManifest() again, or call swapSound(key, newSrc) directly.
 */
export class AudioManager {
    constructor() {
        this.engine        = new AudioEngine();
        this._buffers      = new Map(); // key → AudioBuffer
        this._manifest     = null;
        this._currentMusic = null;
    }

    async loadManifest(path) {
        try {
            const res      = await fetch(path);
            this._manifest = await res.json();
        } catch {
            console.warn('AudioManager: manifest not found, audio disabled.');
        }
    }

    // Called once on first user gesture to unlock Web Audio
    initOnUserGesture() {
        this.engine.init();
        if (this._manifest) this._preloadAll();
    }

    // Wire AudioManager into the EventBus and set up the gesture unlock
    bindEvents() {
        const unlock = () => this.initOnUserGesture();
        document.addEventListener('click',   unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });

        eventBus.on(GameEvents.PLAY_SFX,   ({ key, x, y })  => this.playSfx(key, x, y));
        eventBus.on(GameEvents.PLAY_MUSIC,  ({ key })        => this.playMusic(key));
        eventBus.on(GameEvents.STOP_MUSIC,  ()               => this.stopMusic());

        // Automatic SFX for key game events
        eventBus.on(GameEvents.BALL_HIT, ({ x, y, strength }) => {
            if (strength > 0.5) this.playSfx('ball_hit', x, y);
        });
        eventBus.on(GameEvents.BALL_FELL_IN_HOLE, ({ ball }) => {
            this.playSfx('ball_in_hole', ball.x, ball.y);
        });
        eventBus.on(GameEvents.BALL_SHOOT, ({ ball, special }) => {
            this.playSfx(special ? 'special' : 'shoot', ball.x, ball.y);
        });
        eventBus.on(GameEvents.PLAYER_SPAWN, ({ player }) => {
            this.playSfx('respawn', player.x, player.y);
        });
        eventBus.on(GameEvents.GAME_VICTORY, () => {
            this.stopMusic();
            this.playSfx('victory');
        });
    }

    playSfx(key, x = null, y = null) {
        const buf = this._buffers.get(key);
        this.engine.playBuffer(buf, x, y);
    }

    playMusic(key) {
        this.stopMusic();
        const buf = this._buffers.get(key);
        if (!buf) return;
        this._currentMusic = this.engine.playBuffer(buf, null, null, { loop: true, music: true });
    }

    stopMusic() {
        try { this._currentMusic?.stop(); } catch { /* already stopped */ }
        this._currentMusic = null;
    }

    // Hot-swap a sound by key without reloading everything
    swapSound(key, newSrc) {
        const entry = this._manifest?.sounds[key];
        if (!entry) { console.warn(`swapSound: unknown key "${key}"`); return; }
        entry.src = newSrc;
        this._loadSound(key, newSrc);
    }

    setListenerPosition(x, y) {
        this.engine.setListenerPosition(x, y);
    }

    async _preloadAll() {
        const entries = Object.entries(this._manifest.sounds);
        await Promise.all(
            entries
                .filter(([, e]) => e.preload !== false)
                .map(([key, e]) => this._loadSound(key, e.src))
        );
    }

    async _loadSound(key, src) {
        if (!this.engine.isReady) return; // context not yet created
        try {
            const res    = await fetch(src);
            if (!res.ok) return;
            const raw    = await res.arrayBuffer();
            const buffer = await this.engine.context.decodeAudioData(raw);
            this._buffers.set(key, buffer);
        } catch {
            console.warn(`AudioManager: could not load "${src}"`);
        }
    }
}