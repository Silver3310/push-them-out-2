import { GameConfig } from '../core/GameConfig.js';
import { eventBus }   from '../events/EventBus.js';
import { GameEvents } from '../events/GameEvents.js';

export class ScoreManager {
    constructor() {
        this.stars         = 0;
        this.enemiesKilled = 0;
        this.playerDeaths  = 0;
    }

    recordEnemyKill() {
        this.enemiesKilled++;
        this._addStar();
    }

    recordPlayerDeath() {
        this.playerDeaths++;
        eventBus.emit(GameEvents.SCORE_CHANGE, this.getSnapshot());
    }

    getSnapshot() {
        return {
            stars:         this.stars,
            enemiesKilled: this.enemiesKilled,
            playerDeaths:  this.playerDeaths,
        };
    }

    reset() {
        this.stars         = 0;
        this.enemiesKilled = 0;
        this.playerDeaths  = 0;
    }

    _addStar() {
        this.stars++;
        eventBus.emit(GameEvents.STAR_COLLECTED, { total: this.stars });
        eventBus.emit(GameEvents.SCORE_CHANGE,   this.getSnapshot());
        if (this.stars >= GameConfig.STARS_TO_WIN) {
            eventBus.emit(GameEvents.GAME_VICTORY, this.getSnapshot());
        }
    }
}