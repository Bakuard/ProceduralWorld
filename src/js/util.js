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

export class IntervalTimer {
    static ofSeconds(seconds) {
        return new IntervalTimer(seconds * 1000);
    }

    static ofMillis(millis) {
        return new IntervalTimer(millis);
    }

    constructor(durationMs) {
        this.durationMs = durationMs;
        this.elapsedMs = 0;
    }

    tick(deltaTimeMS) {
        this.elapsedMs += deltaTimeMS;
        if (this.elapsedMs >= this.durationMs) {
            this.elapsedMs = this.elapsedMs - this.durationMs;
            return true;
        }
        return false;
    }

    getElapsedSeconds() {
        return this.durationMs / 1000;
    }

    getDurationMs() {
        return this.durationMs;
    }
}