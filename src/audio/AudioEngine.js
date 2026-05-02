import { GameConfig } from '../core/GameConfig.js';

/**
 * Thin wrapper around the Web Audio API.
 *
 * Graph:  BufferSource → spatialGain → sfxBus ──┐
 *                                                 ├─→ masterGain → destination
 *         BufferSource → spatialGain → musicBus ─┘
 *
 * `spatialGain` is computed from the 2D distance between the sound source and
 * the listener (player position) using an inverse-distance model:
 *
 *   gain = referenceDistance / (referenceDistance + rolloff * (dist - referenceDistance))
 *
 * This mirrors the Web Audio API's own "inverse" PannerNode model so we can
 * swap to a real PannerNode in the future without changing call-sites.
 *
 * `playBuffer()` returns a {@link PlaybackHandle}. Callers can use it to
 * stop the source, schedule a fade-out, or schedule a fade-in (for music
 * crossfades). One-shot SFX usually ignores the handle.
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
     *
     * @param {AudioBuffer} audioBuffer
     * @param {number|null} sourceX  World-space X of the emitter, or null for non-spatial.
     * @param {number|null} sourceY  World-space Y of the emitter.
     * @param {object}      [options]
     * @param {boolean}     [options.loop=false]       Loop the buffer forever.
     * @param {boolean}     [options.music=false]      Route via the music bus instead of sfx.
     * @param {number}      [options.delay=0]          Seconds to wait before starting.
     * @param {number}      [options.volume=1]         Per-clip volume multiplier (0..1+).
     * @param {number}      [options.fadeInSec=0]      If > 0, ramp gain from 0 to target over this many seconds.
     * @returns {PlaybackHandle|null}
     */
    playBuffer(audioBuffer, sourceX = null, sourceY = null, options = {}) {
        if (!this._ready || !audioBuffer) return null;
        this.resume();

        const source   = this._ctx.createBufferSource();
        source.buffer  = audioBuffer;
        source.loop    = options.loop ?? false;

        const targetGain = (options.volume ?? 1) * (sourceX !== null
            ? this._distanceGain(sourceX, sourceY)
            : 1.0);

        const gainNode = this._ctx.createGain();
        const fadeIn   = Math.max(0, options.fadeInSec ?? 0);
        if (fadeIn > 0) {
            const now = this._ctx.currentTime;
            // exponentialRampToValueAtTime can't go to zero, so seed at a tiny positive value
            gainNode.gain.setValueAtTime(0.0001, now);
            gainNode.gain.exponentialRampToValueAtTime(Math.max(targetGain, 0.0001), now + fadeIn);
        } else {
            gainNode.gain.value = targetGain;
        }

        source.connect(gainNode);
        gainNode.connect(options.music ? this._musicBus : this._sfxBus);
        source.start(this._ctx.currentTime + (options.delay ?? 0));

        return new PlaybackHandle(source, gainNode, this._ctx, targetGain);
    }

    // -------------------------------------------------------------------------
    // Bus volume controls (0–1)
    // -------------------------------------------------------------------------

    setMasterVolume(v) { this._setGain(this._master,   v); }
    setSfxVolume(v)    { this._setGain(this._sfxBus,   v); }
    setMusicVolume(v)  { this._setGain(this._musicBus, v); }

    /**
     * Smoothly ramp the music bus volume to `target` over `seconds`.
     * Used by `AudioManager.pauseMusic / resumeMusic` so the music dips
     * gracefully when the player toggles pause instead of cutting hard.
     */
    rampMusicVolume(target, seconds) {
        if (!this._ready) return;
        const node    = this._musicBus;
        const now     = this._ctx.currentTime;
        const safeTgt = Math.max(0.0001, Math.min(1, target));
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(safeTgt, now + Math.max(0.001, seconds));
    }

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

/**
 * Caller-friendly handle returned by {@link AudioEngine.playBuffer}. Wraps the
 * raw `AudioBufferSourceNode` together with the per-clip gain node so callers
 * can manipulate volume envelopes (fades, crossfades) without poking the Web
 * Audio internals directly.
 *
 * Stop is idempotent and swallows the "already stopped" exception that the
 * Web Audio API throws if the source has finished or been stopped before.
 */
export class PlaybackHandle {
    constructor(source, gainNode, ctx, targetGain) {
        this.source     = source;
        this.gain       = gainNode;
        this._ctx       = ctx;
        this._targetGain = targetGain;
        this._stopped   = false;
    }

    /** Stop immediately (or at `whenSec` from now). Idempotent. */
    stop(whenSec = 0) {
        if (this._stopped) return;
        this._stopped = true;
        try { this.source.stop(this._ctx.currentTime + Math.max(0, whenSec)); }
        catch { /* already stopped */ }
    }

    /**
     * Linearly ramp gain to silence over `seconds`, then stop the source.
     * Used by the music crossfade to retire the outgoing track.
     */
    fadeOut(seconds) {
        if (this._stopped) return;
        const node = this.gain;
        const now  = this._ctx.currentTime;
        const dur  = Math.max(0.001, seconds);
        node.gain.cancelScheduledValues(now);
        node.gain.setValueAtTime(node.gain.value, now);
        node.gain.linearRampToValueAtTime(0.0001, now + dur);
        // Schedule the source stop a hair after the fade so we don't clip.
        this.stop(dur + 0.05);
    }
}
