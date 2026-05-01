import { GameConfig } from '../core/GameConfig.js';

/**
 * Thin wrapper around the Web Audio API.
 *
 * Graph:  BufferSource → spatialGain → sfxBus ──┐
 *                                                 ├─→ masterGain → destination
 *         BufferSource → spatialGain → musicBus ─┘
 *
 * spatialGain is computed from the 2D distance between the sound source and
 * the listener (player position) using an inverse-distance model:
 *
 *   gain = referenceDistance / (referenceDistance + rolloff * (dist - referenceDistance))
 *
 * This mirrors the Web Audio API's own "inverse" PannerNode model so you can
 * swap to a PannerNode in the future without changing call-sites.
 */
export class AudioEngine {
    constructor() {
        this._ctx       = null;
        this._master    = null;
        this._sfxBus    = null;
        this._musicBus  = null;
        this._ready     = false;
        this._listener  = { x: GameConfig.CANVAS_WIDTH / 2, y: GameConfig.CANVAS_HEIGHT / 2 };
    }

    // Must be called from a user-gesture handler to satisfy browser autoplay policy
    init() {
        if (this._ready) return;
        this._ctx      = new (window.AudioContext || window.webkitAudioContext)();
        this._master   = this._ctx.createGain();
        this._sfxBus   = this._ctx.createGain();
        this._musicBus = this._ctx.createGain();

        this._sfxBus.connect(this._master);
        this._musicBus.connect(this._master);
        this._master.connect(this._ctx.destination);

        this._sfxBus.gain.value   = GameConfig.SFX_VOLUME;
        this._musicBus.gain.value = GameConfig.MUSIC_VOLUME;
        this._master.gain.value   = 1.0;

        this._ready = true;
    }

    resume() {
        if (this._ctx?.state === 'suspended') this._ctx.resume();
    }

    // Call every frame with the primary player's position
    setListenerPosition(x, y) {
        this._listener.x = x;
        this._listener.y = y;
    }

    /**
     * Play a decoded AudioBuffer with optional spatial attenuation.
     * sourceX/sourceY: world position of the sound emitter (null = centre, no attenuation).
     * options: { loop, music, delay }
     * Returns the AudioBufferSourceNode so callers can call .stop() on it.
     */
    playBuffer(audioBuffer, sourceX = null, sourceY = null, options = {}) {
        if (!this._ready || !audioBuffer) return null;
        this.resume();

        const source   = this._ctx.createBufferSource();
        source.buffer  = audioBuffer;
        source.loop    = options.loop ?? false;

        const spatialGain       = this._ctx.createGain();
        spatialGain.gain.value  = sourceX !== null
            ? this._distanceGain(sourceX, sourceY)
            : 1.0;

        source.connect(spatialGain);
        spatialGain.connect(options.music ? this._musicBus : this._sfxBus);
        source.start(options.delay ?? 0);
        return source;
    }

    // Volume controls (0–1)
    setMasterVolume(v) { this._setGain(this._master,   v); }
    setSfxVolume(v)    { this._setGain(this._sfxBus,   v); }
    setMusicVolume(v)  { this._setGain(this._musicBus, v); }

    _setGain(node, v) {
        if (node) node.gain.value = Math.max(0, Math.min(1, v));
    }

    _distanceGain(sx, sy) {
        const dist = Math.hypot(sx - this._listener.x, sy - this._listener.y);
        const ref  = GameConfig.AUDIO_REFERENCE_DISTANCE;
        const max  = GameConfig.AUDIO_MAX_DISTANCE;
        const roll = GameConfig.AUDIO_ROLLOFF_FACTOR;
        if (dist <= ref) return 1.0;
        if (dist >= max) return 0.0;
        return ref / (ref + roll * (dist - ref));
    }

    get context() { return this._ctx; }
    get isReady()  { return this._ready; }
}