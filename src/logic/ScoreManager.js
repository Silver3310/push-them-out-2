import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

/**
 * Tracks all scoring state for a single game session.
 *
 * Stars are now physical collectible entities the player must touch.
 * Enemy kills are tracked separately and no longer award stars directly.
 */
export class ScoreManager {
    constructor() {
        this.starsCollected = 0;
        this.starsLost      = 0; // fell into holes
        this.enemiesKilled  = 0;
        this.playerDeaths   = 0;
    }

    /** Called when the player physically touches a star collectible. */
    recordStarCollected() {
        this.starsCollected++;
        eventBus.emit(GameEvents.STAR_COLLECTED, { total: this.starsCollected });
        eventBus.emit(GameEvents.SCORE_CHANGE,   this.getSnapshot());
        if (this.starsCollected >= GameConfig.STARS_TO_WIN) {
            eventBus.emit(GameEvents.GAME_VICTORY, this.getSnapshot());
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

    getSnapshot() {
        return {
            starsCollected: this.starsCollected,
            starsLost:      this.starsLost,
            enemiesKilled:  this.enemiesKilled,
            playerDeaths:   this.playerDeaths,
        };
    }

    reset() {
        this.starsCollected = 0;
        this.starsLost      = 0;
        this.enemiesKilled  = 0;
        this.playerDeaths   = 0;
    }
}
