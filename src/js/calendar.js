export const dayPhases = Object.freeze({
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    night: 'night'
});


export function Calendar(calendarConfig) {
    this.morningInMs = calendarConfig.morningInSec * 1000;
    this.afternoonInMs = calendarConfig.afternoonInSec * 1000;
    this.eveningInMs = calendarConfig.eveningInSec * 1000;
    this.nightInMs = calendarConfig.nightInSec * 1000;

    this.totalElapsedTimeInMs = 0;
    this.updateCurrentTime(0);
}

Calendar.prototype.updateCurrentTime = function(deltaTimeInMs) {
    this.totalElapsedTimeInMs += deltaTimeInMs;
    this.msSinceDayStart = this.totalElapsedTimeInMs % getTotalDayDurationInMs(this);
    this.totalDays = Math.floor(this.totalElapsedTimeInMs / getTotalDayDurationInMs(this));

    if(this.msSinceDayStart <= this.morningInMs)
        this.currentPhase = dayPhases.morning;
    else if(this.msSinceDayStart <= getFirstPartOfDayInMs(this))
        this.currentPhase = dayPhases.afternoon;
    else if(this.msSinceDayStart <= getDaylightHoursInMs(this))
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

Calendar.prototype.getCurrentDayPhase = function() {
    return this.currentPhase;
};

Calendar.prototype.getMsSinceDayStart = function() {
    return this.msSinceDayStart;
};

Calendar.prototype.getMsSincePhaseStart = function() {
    if(this.isMorning()) return this.msSinceDayStart;
    else if(this.isAfternoon()) return this.msSinceDayStart - this.morningInMs;
    else if(this.isEvening()) return this.msSinceDayStart - getFirstPartOfDayInMs(this);
    else return this.msSinceDayStart - getDaylightHoursInMs(this);
};

Calendar.prototype.getCurrentPhaseProgress = function() {
    if(this.isMorning()) return this.getMsSincePhaseStart() / this.morningInMs;
    else if(this.isAfternoon()) return this.getMsSincePhaseStart() / this.afternoonInMs;
    else if(this.isEvening()) return this.getMsSincePhaseStart() / this.eveningInMs;
    else return this.getMsSincePhaseStart() / this.nightInMs;
};

Calendar.prototype.getTotalDays = function() {
    return this.totalDays;
};


function getFirstPartOfDayInMs(calendar) {
    return calendar.morningInMs + calendar.afternoonInMs;
}

function getDaylightHoursInMs(calendar) {
    return calendar.morningInMs + calendar.afternoonInMs + calendar.eveningInMs;
}

function getTotalDayDurationInMs(calendar) {
    return calendar.morningInMs + calendar.afternoonInMs + calendar.eveningInMs + calendar.nightInMs;
}
