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

export function Calendar(calendarConfig) {
    this.morningInMs = calendarConfig.morningInSec * 1000;
    this.afternoonInMs = calendarConfig.afternoonInSec * 1000;
    this.eveningInMs = calendarConfig.eveningInSec * 1000;
    this.nightInMs = calendarConfig.nightInSec * 1000;

    this.totalElapsedTimeInMs = getElapsedMsBeforeDayPhase(this, calendarConfig.startPhase) + 1 + getDayPhaseDuration(this, this.currentPhase) * calendarConfig.startPhaseProgress;
    this.updateCurrentTime(0);
}

Calendar.prototype.updateCurrentTime = function(deltaTimeInMs) {
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
};

Calendar.prototype.isMorning = function() {
    return this.currentPhase === dayPhases.morning;
};

Calendar.prototype.isAfternoon = function() {
    return this.currentPhase === dayPhases.afternoon;
};

Calendar.prototype.isEvening = function() {
    return this.currentPhase === dayPhases.evening;
};

Calendar.prototype.isNight = function() {
    return this.currentPhase === dayPhases.night;
};

Calendar.prototype.isCurrentPhaseBetween = function(phaseStart, phaseEnd) {
    return dayPhasesNumber[phaseStart] <= dayPhasesNumber[this.currentPhase]
        && dayPhasesNumber[this.currentPhase] <= dayPhasesNumber[phaseEnd];
};

Calendar.prototype.getCurrentDayPhase = function() {
    return this.currentPhase;
};

Calendar.prototype.getMsSinceDayStart = function() {
    return this.msSinceDayStart;
};

Calendar.prototype.getMsSincePhaseStart = function() {
    return this.msSinceDayStart - getElapsedMsBeforeDayPhase(this, this.currentPhase);
};

Calendar.prototype.getCurrentPhaseProgress = function() {
    return this.getMsSincePhaseStart() / getDayPhaseDuration(this, this.currentPhase);
};

Calendar.prototype.getTotalDays = function() {
    return this.totalDays;
};

Calendar.prototype.getTotalMS = function() {
    return this.totalElapsedTimeInMs;
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
