Object.defineProperty(Array.prototype, 'remove', {
    value: function(obj) {
        const index = this.indexOf(obj);
        if (index > -1) this.splice(index, 1);
    },
    enumerable: false,
    writable: true,
    configurable: true
});

Math.inRange = function(value, min, max) {
    return value >= min && value <= max;
}

Math.randomIntegerInRange = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

Math.clamp = function(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

export class Timer {
    static ofSeconds(seconds) {
        return new Timer(seconds * 1000);
    }

    constructor(totalMS) {
        this.totalMS = totalMS;
        this.currentTimeMS = 0;
    }

    tick(deltaTimeMS) {
        this.currentTimeMS += deltaTimeMS;
        if (this.currentTimeMS >= this.totalMS) {
            this.currentTimeMS = this.currentTimeMS - this.totalMS;
            return true;
        }
        return false;
    }

    getTotalSeconds() {
        return this.totalMS / 1000;
    }
}