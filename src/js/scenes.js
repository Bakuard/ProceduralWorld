import {Ticker} from 'pixi.js';

export class SceneManager {
    constructor() {
        this.currentScene = null;
        this.nextScene = null;
        this.ticker = new Ticker();
        this.ticker.add(this.#updateCurrentScene, this);
        this.ticker.add(this.#switchScene, this, -1);
    }

    startScene(newScene) {
        if(!this.currentScene) {
            this.currentScene = newScene;
            this.currentScene.start();
            this.ticker.start();
        }
    }

    stopCurrentScene() {
        if(this.currentScene) {
            this.ticker.stop();
            this.currentScene.stop();
            this.currentScene = null;
        }
    }

    pauseCurrentScene() {
        if (this.isCurrentSceneRunning()) this.ticker.stop();
    }

    resumeCurrentScene() {
        if (this.isCurrentScenePaused()) this.ticker.start();
    }

    requestSceneSwitch(newScene) {
        this.nextScene = newScene;
    }

    isCurrentSceneExists() {
        return this.currentScene != null;
    }

    isCurrentSceneRunning() {
        return this.currentScene && this.ticker.started;
    }

    isCurrentScenePaused() {
        return this.currentScene && !this.ticker.started;
    }

    destroy() {
        this.stopCurrentScene();
        this.ticker.destroy();
    }


    #updateCurrentScene(ticker) {
        this.currentScene?.update(ticker);
    }

    #switchScene() {
        if(this.nextScene) {
            const newScene = this.nextScene;
            this.nextScene = null;
            this.stopCurrentScene();
            this.startScene(newScene);
        }
    }
}
