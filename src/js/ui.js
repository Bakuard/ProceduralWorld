export class UIManager {
    constructor() {
        this.availableEnergy = document.querySelector('.energy-bar-available-energy');
        this.receivedDamage = document.querySelector('.energy-bar-damaged');
        this.tiredness = document.querySelector('.energy-bar-tiredness');
        this.lastEnergyPercent = 0;

        this.gameOverModal = document.querySelector('.game-over-overlay');
    }

    /* HUD */

    setEnergy(currentEnergy, maxEnergy, receivedDamage) {
        const currentEnergyPercent = Math.round(currentEnergy / maxEnergy * 10000) / 100;
        if(this.lastEnergyPercent !== currentEnergyPercent) {
            this.availableEnergy.style.width = `${currentEnergyPercent}%`;

            const receivedDamagePercent = Math.round(receivedDamage / maxEnergy * 100);
            this.receivedDamage.style.width = `${receivedDamagePercent}%`;
            this.receivedDamage.classList.toggle('has-damage', receivedDamagePercent > 0);

            const tirednessPercent = 100 - receivedDamagePercent - currentEnergyPercent;
            this.tiredness.style.width = `${tirednessPercent}%`;
        }
        this.lastEnergyPercent = currentEnergyPercent;
    }


    /* UI */

    showGameOverModal(callback) {
        this.gameOverModal.classList.remove('hidden');
        const restartButton = this.gameOverModal.querySelector('.game-over-restart-btn');
        restartButton.addEventListener('click', event => {
            event.stopPropagation();
            callback();
        }, { once: true });
    }

    hideGameOverModal() {
        this.gameOverModal.classList.add('hidden');
    }
}