export class UIManager {
    constructor() {
        this.availableEnergy = document.querySelector('.energy-bar-available-energy');
        this.receivedDamage = document.querySelector('.energy-bar-damaged');
        this.tiredness = document.querySelector('.energy-bar-tiredness');
        this.lastEnergyPercent = -1;
        this.lastDamagePercent = -1;

        this.gameOverModal = document.querySelector('#game-over');
        this.gamePauseModal = document.querySelector('#game-pause');
    }

    /* HUD */

    setEnergy(currentEnergy, maxEnergy, receivedDamage) {
        const currentEnergyPercent = Math.round(currentEnergy / maxEnergy * 10000) / 100;
        const receivedDamagePercent = Math.round(receivedDamage / maxEnergy * 100);

        if(this.lastEnergyPercent !== currentEnergyPercent || this.lastDamagePercent !== receivedDamagePercent) {
            this.availableEnergy.style.width = `${currentEnergyPercent}%`;

            this.receivedDamage.style.width = `${receivedDamagePercent}%`;
            this.receivedDamage.classList.toggle('has-damage', receivedDamagePercent > 0);

            const tirednessPercent = Math.max(0, 100 - receivedDamagePercent - currentEnergyPercent);
            this.tiredness.style.width = `${tirednessPercent}%`;

            this.lastEnergyPercent = currentEnergyPercent;
            this.lastDamagePercent = receivedDamagePercent;
        }
    }


    /* UI */

    showGameOverModal(onRestart) {
        this.#showGameModal(this.gameOverModal, onRestart);
    }

    hideGameOverModal() {
        this.#hideGameModal(this.gameOverModal);
    }

    showGamePauseModal(onResume) {
        this.#showGameModal(this.gamePauseModal, onResume);
    }

    hideGamePauseModal() {
        this.#hideGameModal(this.gamePauseModal);
    }


    #showGameModal(modal, callback) {
        modal.abortController?.abort();

        modal.abortController = new AbortController();
        modal.classList.remove('hidden');
        modal.addEventListener('click', event => event.stopPropagation(), { signal: modal.abortController.signal });

        const modalButton = modal.querySelector('.game-modal-btn');
        modalButton.addEventListener('click', event => {
            event.stopPropagation();
            callback();
        }, { once: true, signal: modal.abortController.signal });
    }

    #hideGameModal(modal) {
        modal.classList.add('hidden');
        modal.abortController.abort();
    }
}