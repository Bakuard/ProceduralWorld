export class HUDManager {
    constructor() {
        this.availableEnergy = document.querySelector('.energy-bar-available-energy');
        this.lastAvailabeEnergyPercent = 0;
    }

    setEnergy(currentEnergy, currentEnergyLimit) {
        const percent = Math.round(currentEnergy / currentEnergyLimit * 10000) / 10000;
        if(this.lastAvailabeEnergyPercent !== percent) this.availableEnergy.style.transform = `scaleX(${percent})`;
        this.lastAvailabeEnergyPercent = percent;
    }
}