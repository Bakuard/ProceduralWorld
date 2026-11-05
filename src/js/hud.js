export class HUDManager {
    constructor() {
        this.availableEnergy = document.querySelector('.energy-bar-available-energy');
        this.receivedDamage = document.querySelector('.energy-bar-damaged');
        this.tiredness = document.querySelector('.energy-bar-tiredness');
        this.lastAvailabeEnergyPercent = 0;
    }

    setEnergy(currentEnergy, currentEnergyLimit, maxEnergy, receivedDamage) {
        const currentEnergyPercent = Math.round(currentEnergy / maxEnergy * 10000) / 10000 * 100;
        if(this.lastAvailabeEnergyPercent !== currentEnergyPercent) {
            this.availableEnergy.style.width = `${currentEnergyPercent}%`;

            const receivedDamagePercent = Math.round(receivedDamage / maxEnergy * 100);
            this.receivedDamage.style.width = `${receivedDamagePercent}%`;
            this.receivedDamage.classList.toggle('has-damage', receivedDamagePercent > 0);

            const tirednessPercent = 100 - receivedDamagePercent - currentEnergyPercent;
            this.tiredness.style.width = `${tirednessPercent}%`;
        }
        this.lastAvailabeEnergyPercent = currentEnergyPercent;
    }
}