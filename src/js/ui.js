export class UIManager {
    constructor() {
        this.availableEnergy = document.querySelector('.energy-bar-available-energy');
        this.lastAvailabeEnergyPercent = 0;
    }

    setEnergy(currentEnergy, currentEnergyLimit) {
        const percent = currentEnergy / currentEnergyLimit;
        if(this.lastAvailabeEnergyPercent !== percent) this.availableEnergy.style.transform = `scaleX(${percent})`;
        this.lastAvailabeEnergyPercent = percent;
    }
}