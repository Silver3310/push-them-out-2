import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Tracks all scoring state for a single game session.
 *
 * Stars are physical collectible entities the player must touch.
 * Two counters are maintained:
 *   - `starsCollected`         lifetime total across the whole run
 *   - `starsCollectedThisLevel` resets to zero on each level transition
 *                                — this is what the HUD compares against the
 *                                active level's `starsToWin` goal.
 *
 * The level goal is provided by an injected `LevelManager`. When the
 * per-level threshold is reached:
 *   - on the final level → `GAME_VICTORY` is emitted,
 *   - otherwise         → `LEVEL_COMPLETE` is emitted (Game advances the
 *                          LevelManager and resets this manager via
 *                          `startNewLevel()`).
 */
export class ScoreManager {
    /**
     * @param {LevelManager} levelManager - Source of truth for the active
     *     level's star goal and whether the current level is the last.
     */
    constructor(levelManager) {
        this._levelManager = levelManager;
        this.starsCollected         = 0;
        this.starsCollectedThisLevel = 0;
        this.starsLost              = 0; // fell into holes
        this.enemiesKilled          = 0;
        this.playerDeaths           = 0;
    }

    /** Called when the player physically touches a star collectible. */
    recordStarCollected() {
        this.starsCollected++;
        this.starsCollectedThisLevel++;
        eventBus.emit(GameEvents.STAR_COLLECTED, { total: this.starsCollected });
        eventBus.emit(GameEvents.SCORE_CHANGE,   this.getSnapshot());

        const goal = this._levelManager.current.starsToWin;
        if (this.starsCollectedThisLevel < goal) return;

        if (this._levelManager.isLast) {
            eventBus.emit(GameEvents.GAME_VICTORY, this.getSnapshot());
        } else {
            eventBus.emit(GameEvents.LEVEL_COMPLETE, {
                from: this._levelManager.current,
                to:   this._levelManager.peekNext(),
            });
        }
    }

    /** Called when a star falls into a hole and is lost. */
    recordStarLost() {
        this.starsLost++;
        eventBus.emit(GameEvents.STAR_LOST,    { total: this.starsLost });
        eventBus.emit(GameEvents.SCORE_CHANGE, this.getSnapshot());
    }

    /** Called when an enemy is eliminated by a hole. */
    recordEnemyKill() {
        this.enemiesKilled++;
        eventBus.emit(GameEvents.SCORE_CHANGE, this.getSnapshot());
    }

    /** Called on every player death. */
    recordPlayerDeath() {
        this.playerDeaths++;
        eventBus.emit(GameEvents.SCORE_CHANGE, this.getSnapshot());
    }

    /**
     * Reset only the per-level star counter. Called by `Game` when the player
     * has just cleared a level so the HUD shows `0 / nextGoal` for the next.
     */
    startNewLevel() {
        this.starsCollectedThisLevel = 0;
        eventBus.emit(GameEvents.SCORE_CHANGE, this.getSnapshot());
    }

    getSnapshot() {
        return {
            starsCollected:          this.starsCollected,
            starsCollectedThisLevel: this.starsCollectedThisLevel,
            starsLost:               this.starsLost,
            enemiesKilled:           this.enemiesKilled,
            playerDeaths:            this.playerDeaths,
        };
    }

    reset() {
        this.starsCollected         = 0;
        this.starsCollectedThisLevel = 0;
        this.starsLost              = 0;
        this.enemiesKilled          = 0;
        this.playerDeaths           = 0;
    }
}
