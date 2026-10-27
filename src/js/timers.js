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
        return this.elapsedMs / 1000;
    }

    getDurationMs() {
        return this.durationMs;
    }

    resetElapsed() {
        this.elapsedMs = 0;
    }
}

export class TimestampIntervalTimer {
    static ofSeconds(seconds) {
        return new TimestampIntervalTimer(seconds * 1000);
    }

    static ofMillis(millis) {
        return new TimestampIntervalTimer(millis);
    }

    constructor(durationMs) {
        this.durationMs = durationMs;
        this.lastTimestamp = 0;
    }

    check(gameTotalMs) {
        return gameTotalMs - this.lastTimestamp >= this.durationMs;
    }

    checkThenReset(gameTotalMs) {
        if(this.check(gameTotalMs)) {
            this.lastTimestamp = gameTotalMs;
            return true;
        }
        return false;
    }

    getElapsedSeconds(gameTotalMs) {
        return (gameTotalMs - this.lastTimestamp) / 1000;
    }

    getDurationMs() {
        return this.durationMs;
    }

    reset(gameTotalMs) {
        this.lastTimestamp = gameTotalMs;
    }
}