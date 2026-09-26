export const keyboardEvents = Object.freeze({
    KeyW: "KeyW",
    KeyA: "KeyA",
    KeyS: "KeyS",
    KeyD: "KeyD",
    KeyE: "KeyE"
});

export class EventManager {
    constructor() {
        this.clearAllEvents();
    }

    registerInbox(eventBoxName, ...eventNames) {
        for (const eventName of eventNames) {
            const inputBoxes = (this.eventToInputBoxes[eventName] ??= {});
            inputBoxes[eventBoxName] = null;
        }
    }

    setEvent(eventName, event) {
        const inputBoxes = (this.eventToInputBoxes[eventName] ??= {});
        Object.keys(inputBoxes).forEach(eventBoxName => inputBoxes[eventBoxName] = event);
    }

    hasEvent(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        return inputBoxes && inputBoxes[eventBoxName] != null;
    }

    clearEventFor(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (inputBoxes) inputBoxes[eventBoxName] = null;
    }

    hasThenClearEventFor(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (!inputBoxes) return false;

        const result = inputBoxes[eventBoxName] != null;
        inputBoxes[eventBoxName] = null;
        return result;
    }

    clearEventForAll(eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (inputBoxes) Object.keys(inputBoxes).forEach(eventBoxName => inputBoxes[eventBoxName] = null);
    }

    clearAllEvents() {
        this.eventToInputBoxes = {};
    }
}
