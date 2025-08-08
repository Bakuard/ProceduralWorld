export const dayPhases = Object.freeze({
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    night: 'night'
});


export function Calendar(morningInSec, afternoonInSec, eveningInSec, nightInSec) {
    this.morningInMs = morningInSec * 1000;
    this.afternoonInMs = afternoonInSec * 1000;
    this.eveningInMs = eveningInSec * 1000;
    this.nightInMs = nightInSec * 1000;

    setCurrentTime(this, 0);

    this.previousState = Object.setPrototypeOf({}, Calendar.prototype);
    copyState(this, this.previousState);
}

Calendar.prototype.update = function(totalElapsedTimeInMs) {
    copyState(this, this.previousState);
    setCurrentTime(this, totalElapsedTimeInMs);
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

Calendar.prototype.hasPhaseChanged = function() {
    return this.currentPhase != this.previousState.currentPhase;
};

Calendar.prototype.getTotalDays = function() {
    return this.totalDays;
};

Calendar.prototype.hasDayChanged = function() {
    return this.totalDays != this.previousState.totalDays;
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

function setCurrentTime(calendar, totalElapsedTimeInMs) {
    calendar.msSinceDayStart = totalElapsedTimeInMs % getTotalDayDurationInMs(calendar);
    calendar.totalDays = Math.floor(totalElapsedTimeInMs / getTotalDayDurationInMs(calendar));

    if(calendar.msSinceDayStart <= calendar.morningInMs)
        calendar.currentPhase = dayPhases.morning;
    else if(calendar.msSinceDayStart <= getFirstPartOfDayInMs(calendar))
        calendar.currentPhase = dayPhases.afternoon;
    else if(calendar.msSinceDayStart <= getDaylightHoursInMs(calendar))
        calendar.currentPhase = dayPhases.evening;
    else
        calendar.currentPhase = dayPhases.night;
}

function copyState(calendar, otherCalendar) {
    otherCalendar.morningInMs = calendar.morningInMs;
    otherCalendar.afternoonInMs = calendar.afternoonInMs;
    otherCalendar.eveningInMs = calendar.eveningInMs;
    otherCalendar.nightInMs = calendar.nightInMs;

    otherCalendar.msSinceDayStart = calendar.msSinceDayStart;
    otherCalendar.totalDays = calendar.totalDays;
    otherCalendar.currentPhase = calendar.currentPhase;
}
