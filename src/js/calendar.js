export const dayPhases = Object.freeze({
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    night: 'night'
});

const dayPhasesNumber = Object.freeze({
    morning: 0,
    afternoon: 1,
    evening: 2,
    night: 3
});

export class Calendar {
    constructor(calendarConfig) {
        this.morningInMs = calendarConfig.morningInSec * 1000;
        this.afternoonInMs = calendarConfig.afternoonInSec * 1000;
        this.eveningInMs = calendarConfig.eveningInSec * 1000;
        this.nightInMs = calendarConfig.nightInSec * 1000;

        this.totalElapsedTimeInMs = getElapsedMsBeforeDayPhase(this, calendarConfig.startPhase) + 1 + getDayPhaseDuration(this, this.currentPhase) * calendarConfig.startPhaseProgress;
        this.updateCurrentTime(0);
    }

    updateCurrentTime(deltaTimeInMs) {
        this.totalElapsedTimeInMs += deltaTimeInMs;
        this.msSinceDayStart = this.totalElapsedTimeInMs % getTotalDayDurationInMs(this);
        this.totalDays = Math.floor(this.totalElapsedTimeInMs / getTotalDayDurationInMs(this));

        if(this.msSinceDayStart <= this.morningInMs)
            this.currentPhase = dayPhases.morning;
        else if(this.msSinceDayStart <= getElapsedMsBeforeDayPhase(this, dayPhases.evening))
            this.currentPhase = dayPhases.afternoon;
        else if(this.msSinceDayStart <= getElapsedMsBeforeDayPhase(this, dayPhases.night))
            this.currentPhase = dayPhases.evening;
        else
            this.currentPhase = dayPhases.night;
    }

    isMorning() {
        return this.currentPhase === dayPhases.morning;
    }

    isAfternoon() {
        return this.currentPhase === dayPhases.afternoon;
    }

    isEvening() {
        return this.currentPhase === dayPhases.evening;
    }

    isNight() {
        return this.currentPhase === dayPhases.night;
    }

    isCurrentPhaseBetween(phaseStart, phaseEnd) {
        return dayPhasesNumber[phaseStart] <= dayPhasesNumber[this.currentPhase]
            && dayPhasesNumber[this.currentPhase] <= dayPhasesNumber[phaseEnd];
    }

    getCurrentDayPhase() {
        return this.currentPhase;
    }

    getCurrentPhaseProgress() {
        return getMsSincePhaseStart(this) / getDayPhaseDuration(this, this.currentPhase);
    }

    getTotalDays() {
        return this.totalDays;
    }

    getTotalMS() {
        return this.totalElapsedTimeInMs;
    }
}

function getTotalDayDurationInMs(calendar) {
    return calendar.morningInMs + calendar.afternoonInMs + calendar.eveningInMs + calendar.nightInMs;
}

function getElapsedMsBeforeDayPhase(calendar, dayPhase) {
    if (dayPhase === dayPhases.morning) return 0;
    else if (dayPhase === dayPhases.afternoon) return calendar.morningInMs;
    else if (dayPhase === dayPhases.evening) return calendar.morningInMs + calendar.afternoonInMs;
    else return calendar.morningInMs + calendar.afternoonInMs + calendar.eveningInMs;
}

function getDayPhaseDuration(calendar, dayPhase) {
    if(dayPhase === dayPhases.morning) return calendar.morningInMs;
    else if(dayPhase === dayPhases.afternoon) return calendar.afternoonInMs;
    else if(dayPhase === dayPhases.evening) return calendar.eveningInMs;
    else return calendar.nightInMs;
}

function getMsSincePhaseStart(calendar) {
    return calendar.msSinceDayStart - getElapsedMsBeforeDayPhase(calendar, calendar.currentPhase);
}