import { AudioEngine } from './AudioEngine.js';
import { GameConfig }  from '../core/GameConfig.js';
import { eventBus }    from '../events/EventBus.js';
import { GameEvents }  from '../events/GameEvents.js';

/**
 * High-level audio API. Loads sounds from a JSON manifest, wires up game
 * events to sound effects, and delegates spatial volume + buses to
 * {@link AudioEngine}.
 *
 * ## Manifest format (assets/sounds/sounds.json)
 *
 * ```jsonc
 * {
 *   "menuMusic":          "music_menu",
 *   "musicByLevel":       { "1": "music_level_1", "2": "music_level_2", ... },
 *   "musicCrossfadeSec":  2.5,
 *   "musicPauseFadeSec":  0.25,
 *   "sounds": {
 *     "key": { "src": "path.ogg", "preload": true, "category": "sfx|music", "volume": 1.0 }
 *   }
 * }
 * ```
 *
 * - `sounds` is a flat key → entry map. Underscore-prefixed top-level keys
 *   (e.g. `_comment`, `_schema`, `_groups`) are ignored — they exist purely
 *   for human-readable annotation in the JSON.
 * - `category` selects the bus: `'music'` routes through the music bus
 *   (which dips when the player pauses); everything else uses the SFX bus.
 * - `volume` (optional, 0..1+) is a per-clip multiplier applied on top of
 *   the bus volume.
 * - `preload: false` defers the fetch until the sound is first requested,
 *   keeping the initial menu paint snappy. Music tracks default to lazy.
 *
 * ## Customising sounds
 *
 * - Repoint a file: change the `src` of an entry and reload. Or call
 *   `audioManager.swapSound('player_shoot', 'assets/sounds/sfx/new.ogg')`
 *   at runtime.
 * - Repoint level music: change `musicByLevel["3"]` to point at a
 *   different sound key. The new track plays the next time the player
 *   enters level 3.
 * - Add new music for a new level: add a `sounds` entry plus a
 *   `musicByLevel["7"]` row. No code change required.
 *
 * ## Adding a new SFX hook for an existing event
 *
 * 1. Add a `sounds` entry in `sounds.json`.
 * 2. Add one line in {@link AudioManager._bindSfxEvents} subscribing to
 *    the relevant `GameEvents.*` and calling `this.playSfx(key, x, y)`.
 *
 * ## Pause / resume
 *
 * The music bus is faded down to silence when the game pauses
 * (`musicPauseFadeSec`) and ramped back up on resume. SFX continues to
 * play during the brief pause/resume animation so menu clicks remain
 * audible.
 *
 * ## Browser autoplay policy
 *
 * The Web Audio context cannot start until a user gesture. AudioManager
 * binds a one-shot listener for the first click/keydown that calls
 * {@link AudioManager.initOnUserGesture}. Music requests issued before
 * the unlock are queued and played as soon as the context comes up.
 */
export class AudioManager {
    constructor() {
        this.engine        = new AudioEngine();
        this._buffers      = new Map(); // key → AudioBuffer
        this._loadingKeys  = new Map(); // key → in-flight Promise (dedupe concurrent loads)
        this._manifest     = null;

        /** Currently playing music PlaybackHandle, or null. */
        this._currentMusic = null;
        /** Manifest key of the currently playing music, or null. */
        this._currentMusicKey = null;
        /** Music key requested before audio was unlocked; played on init. */
        this._pendingMusicKey = null;

        /** True between pauseMusic() and resumeMusic(). */
        this._musicPaused = false;
    }

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    async loadManifest(path) {
        try {
            const res      = await fetch(path);
            this._manifest = await res.json();
        } catch {
            console.warn('AudioManager: manifest not found, audio disabled.');
        }
    }

    /** Called once on first user gesture to unlock Web Audio. */
    initOnUserGesture() {
        if (this.engine.isReady) return;
        this.engine.init();
        if (this._manifest) this._preloadAll();
        if (this._pendingMusicKey) {
            const key = this._pendingMusicKey;
            this._pendingMusicKey = null;
            // No crossfade for the initial track — just fade in from silence.
            this._playMusicByKey(key, 0);
        }
    }

    /**
     * Wire AudioManager into the EventBus and arm the gesture unlock.
     * Call once at boot, after `loadManifest`.
     */
    bindEvents() {
        const unlock = () => this.initOnUserGesture();
        document.addEventListener('click',   unlock, { once: true });
        document.addEventListener('keydown', unlock, { once: true });

        this._bindMusicEvents();
        this._bindSfxEvents();
        this._bindPauseEvents();
    }

    // -------------------------------------------------------------------------
    // Public playback API
    // -------------------------------------------------------------------------

    /**
     * Play a one-shot SFX. `x` / `y` are world-space coordinates of the
     * emitter — pass `null` (or omit) for non-spatial UI sounds. Unknown
     * keys and missing assets are silently ignored.
     */
    playSfx(key, x = null, y = null) {
        if (!key) return;
        const buf   = this._buffers.get(key);
        if (!buf) {
            // Lazy-load on first use — supports preload:false entries
            this._lazyLoad(key).then(loaded => {
                if (loaded) this.playSfx(key, x, y);
            });
            return;
        }
        const entry = this._manifest?.sounds?.[key];
        this.engine.playBuffer(buf, x, y, { volume: entry?.volume ?? 1 });
    }

    /**
     * Play the manifest's `menuMusic` track (looping, with a smooth fade).
     * Crossfades from any currently-playing track. Safe to call repeatedly:
     * if the requested track is already the one playing, it's a no-op.
     */
    playMenuMusic() {
        const key = this._manifest?.menuMusic;
        if (!key) return;
        this._playMusicByKey(key, this._musicCrossfadeSec);
    }

    /**
     * Play the intro music track (manifest key `introMusic`). Crossfades from
     * any currently-playing track. Called by Game when the intro screen opens.
     */
    playIntroMusic() {
        const key = this._manifest?.introMusic;
        if (!key) return;
        this._playMusicByKey(key, this._musicCrossfadeSec);
    }

    /**
     * Play the outro music track (manifest key `outroMusic`). Crossfades from
     * any currently-playing track. Called by Game when the outro screen opens.
     */
    playOutroMusic() {
        const key = this._manifest?.outroMusic;
        if (!key) return;
        this._playMusicByKey(key, this._musicCrossfadeSec);
    }

    /**
     * Play the music for `levelId` (matching `musicByLevel[String(levelId)]`).
     * Crossfades from any currently-playing track. Unknown level ids fall
     * back silently to the previous track so missing entries don't kill the
     * music in the middle of a session.
     */
    playLevelMusic(levelId) {
        const key = this._manifest?.musicByLevel?.[String(levelId)];
        if (!key) return;
        this._playMusicByKey(key, this._musicCrossfadeSec);
    }

    /**
     * Stop the current music track. `fadeOutSec` smooths the cut; pass 0
     * for an instant stop.
     */
    stopMusic(fadeOutSec = 0) {
        if (!this._currentMusic) return;
        if (fadeOutSec > 0) this._currentMusic.fadeOut(fadeOutSec);
        else                this._currentMusic.stop();
        this._currentMusic    = null;
        this._currentMusicKey = null;
    }

    /**
     * Hot-swap the source URL of an existing sound key. The new file
     * replaces the cached buffer immediately; subsequent playback uses
     * the new asset. The current music track is NOT restarted if its
     * key is the one being swapped — the change takes effect on the
     * next `playLevelMusic` / `playSfx` call.
     */
    swapSound(key, newSrc) {
        const entry = this._manifest?.sounds?.[key];
        if (!entry) { console.warn(`AudioManager.swapSound: unknown key "${key}"`); return; }
        entry.src = newSrc;
        this._buffers.delete(key);
        this._loadingKeys.delete(key);
        this._loadSound(key, newSrc);
    }

    setListenerPosition(x, y) {
        this.engine.setListenerPosition(x, y);
    }

    // -------------------------------------------------------------------------
    // Event wiring
    // -------------------------------------------------------------------------

    /**
     * Music: react to game lifecycle events and play the right track.
     * Adding a new music cue → add a row here.
     */
    _bindMusicEvents() {
        eventBus.on(GameEvents.PLAY_MUSIC,  ({ key } = {}) => this._playMusicByKey(key, this._musicCrossfadeSec));
        eventBus.on(GameEvents.STOP_MUSIC,  ()             => this.stopMusic(this._musicCrossfadeSec));

        // Per-level soundtracks. INTRO_DISMISSED triggers level 1 music (the
        // intro screen owns the intro track; dismissing it hands off to level 1).
        // Every subsequent level swap rides the visual cross-fade midpoint.
        eventBus.on(GameEvents.INTRO_DISMISSED,       ()          => this.playLevelMusic(1));
        eventBus.on(GameEvents.LEVEL_TRANSITION_MID,  ({ level }) => this.playLevelMusic(level.id));

        // GAME_VICTORY music is handled by Game.js: it calls playOutroMusic()
        // directly so the crossfade into the outro track is owned in one place.
        // The victory SFX is omitted here in favour of the outro music itself.
    }

    /**
     * SFX: declarative event → sound key bindings. To wire up a new SFX,
     * add an entry to `sounds.json` and one `eventBus.on(...)` line here.
     */
    _bindSfxEvents() {
        // Menu UI
        eventBus.on(GameEvents.MENU_BUTTON_HOVER, () => this.playSfx('menu_hover'));
        eventBus.on(GameEvents.MENU_BUTTON_CLICK, () => this.playSfx('menu_click'));

        // Pause toggle (both directions get the same click feedback)
        eventBus.on(GameEvents.GAME_PAUSE,  () => this.playSfx('pause_click'));
        eventBus.on(GameEvents.GAME_RESUME, () => this.playSfx('pause_click'));

        // Player + enemy shots are differentiated by the `enemy` tag on the
        // emitting ball; `special` (the burst ability) gets its own clip.
        eventBus.on(GameEvents.BALL_SHOOT, ({ ball, special }) => {
            if (special) {
                this.playSfx('special', ball.x, ball.y);
                return;
            }
            const key = ball?.hasTag?.('enemy') ? 'enemy_shoot' : 'player_shoot';
            this.playSfx(key, ball.x, ball.y);
        });

        // Generic player death (any cause). The black-hole-specific cue
        // below plays IN ADDITION when the cause is a black hole.
        eventBus.on(GameEvents.PLAYER_DEATH, ({ player }) => {
            this.playSfx('player_death', player.x, player.y);
        });
        eventBus.on(GameEvents.BLACK_HOLE_SWALLOWED, ({ blackHole, target }) => {
            if (target?.hasTag?.('player')) {
                this.playSfx('black_hole_death', blackHole.x, blackHole.y);
            }
        });

        // Pickups
        eventBus.on(GameEvents.STAR_COLLECTED,   () => this.playSfx('star_collected'));
        eventBus.on(GameEvents.PLAYER_ATE_CAKE,  ({ player }) => this.playSfx('cake_eaten', player.x, player.y));

        // Hazard warnings — every "shower incoming" event funnels into the
        // same warning beep so the player learns one sound = "danger".
        const warningEvents = [
            GameEvents.ASTEROID_WARNING,
            GameEvents.BLACK_HOLE_WARNING,
            GameEvents.CAKE_WARNING,
            GameEvents.BOMB_WARNING,
        ];
        for (const ev of warningEvents) {
            eventBus.on(ev, () => this.playSfx('warning'));
        }

        // Per-spawn telegraph (yellow warning circle). Spatialised at the
        // future spawn point so the player can localise the threat by ear.
        eventBus.on(GameEvents.SPAWN_WARNING, ({ x, y }) => {
            this.playSfx('warning', x, y);
        });

        // Notification panel slide-in
        eventBus.on(GameEvents.SHOW_NOTIFICATION, () => this.playSfx('notification'));

        // Final boss ray attack — telegraph fires when the charge-up begins
        eventBus.on(GameEvents.BOSS_RAY_TELEGRAPH, ({ boss }) => {
            this.playSfx('boss_ray', boss.x, boss.y);
        });

        // Ball physics feedback (legacy hooks)
        eventBus.on(GameEvents.BALL_HIT, ({ x, y, strength }) => {
            if (strength > 0.5) this.playSfx('ball_hit', x, y);
        });
        eventBus.on(GameEvents.BALL_FELL_IN_HOLE, ({ ball }) => {
            this.playSfx('ball_in_hole', ball.x, ball.y);
        });
        eventBus.on(GameEvents.PLAYER_SPAWN, ({ player }) => {
            this.playSfx('respawn', player.x, player.y);
        });
    }

    _bindPauseEvents() {
        eventBus.on(GameEvents.GAME_PAUSE,  () => this.pauseMusic());
        eventBus.on(GameEvents.GAME_RESUME, () => this.resumeMusic());
    }

    // -------------------------------------------------------------------------
    // Pause behaviour
    // -------------------------------------------------------------------------

    /**
     * Dip the music bus to silence over `musicPauseFadeSec` seconds. SFX
     * keeps playing so the pause click is still audible.
     */
    pauseMusic() {
        if (this._musicPaused) return;
        this._musicPaused = true;
        this.engine.rampMusicVolume(0, this._musicPauseFadeSec);
    }

    /** Restore the music bus to {@link GameConfig.MUSIC_VOLUME}. */
    resumeMusic() {
        if (!this._musicPaused) return;
        this._musicPaused = false;
        this.engine.rampMusicVolume(GameConfig.MUSIC_VOLUME, this._musicPauseFadeSec);
    }

    // -------------------------------------------------------------------------
    // Music helpers
    // -------------------------------------------------------------------------

    get _musicCrossfadeSec() {
        return this._manifest?.musicCrossfadeSec ?? 2.0;
    }

    get _musicPauseFadeSec() {
        return this._manifest?.musicPauseFadeSec ?? 0.25;
    }

    /**
     * Switch the music track to `key`, crossfading the outgoing track over
     * `crossfadeSec` and the incoming one over the same duration. No-op
     * when the requested key is already playing. Lazy-loads the buffer on
     * first request.
     */
    _playMusicByKey(key, crossfadeSec) {
        if (!key) return;
        if (!this.engine.isReady) {
            // Audio context not unlocked yet — remember the request and
            // play it the moment the user clicks/keys for the first time.
            this._pendingMusicKey = key;
            return;
        }
        if (this._currentMusicKey === key && this._currentMusic) return;

        // Resume from a paused state (e.g. user is mid-pause when level
        // music is requested by the LEVEL_TRANSITION_MID handler) so the
        // new track isn't muted on arrival.
        if (this._musicPaused) this.resumeMusic();

        const playWith = buf => {
            if (!buf) return;
            // Crossfade the outgoing handle out
            if (this._currentMusic) {
                this._currentMusic.fadeOut(crossfadeSec);
            }
            const entry = this._manifest?.sounds?.[key];
            const handle = this.engine.playBuffer(buf, null, null, {
                loop:      true,
                music:     true,
                volume:    entry?.volume ?? 1,
                fadeInSec: crossfadeSec,
            });
            this._currentMusic    = handle;
            this._currentMusicKey = key;
        };

        const buf = this._buffers.get(key);
        if (buf) {
            playWith(buf);
        } else {
            this._lazyLoad(key).then(loaded => {
                // Guard against a faster track-change overtaking us during the
                // fetch (e.g. user races through levels): only honour the play
                // request if it's still the most recently requested key.
                if (loaded && this._mostRecentMusicRequest(key)) {
                    playWith(this._buffers.get(key));
                }
            });
            this._currentMusicKey = key;
        }
    }

    /**
     * True iff `key` is still the latest music key the user asked for.
     * Used to discard stale lazy-load callbacks when the player swaps
     * levels faster than the buffer fetches.
     */
    _mostRecentMusicRequest(key) {
        return this._currentMusicKey === key;
    }

    // -------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------

    async _preloadAll() {
        const entries = Object.entries(this._manifest.sounds);
        await Promise.all(
            entries
                .filter(([key, e]) => !key.startsWith('_') && e?.preload !== false)
                .map(([key, e]) => this._loadSound(key, e.src))
        );
    }

    /**
     * Load a sound on demand and return whether it ended up in the buffer
     * cache. Concurrent calls for the same key share a single fetch via
     * `_loadingKeys`.
     *
     * @param {string} key
     * @returns {Promise<boolean>}  true on success
     */
    async _lazyLoad(key) {
        if (this._buffers.has(key)) return true;
        const entry = this._manifest?.sounds?.[key];
        if (!entry?.src) return false;
        await this._loadSound(key, entry.src);
        return this._buffers.has(key);
    }

    async _loadSound(key, src) {
        if (!this.engine.isReady) return; // context not yet created
        if (this._loadingKeys.has(key)) {
            // Coalesce concurrent loads
            return this._loadingKeys.get(key);
        }
        const promise = (async () => {
            try {
                const res = await fetch(src);
                if (!res.ok) {
                    console.warn(`AudioManager: missing audio file "${src}" (status ${res.status})`);
                    return;
                }
                const raw    = await res.arrayBuffer();
                const buffer = await this.engine.context.decodeAudioData(raw);
                this._buffers.set(key, buffer);
            } catch (err) {
                console.warn(`AudioManager: could not load "${src}":`, err?.message ?? err);
            } finally {
                this._loadingKeys.delete(key);
            }
        })();
        this._loadingKeys.set(key, promise);
        return promise;
    }
}
