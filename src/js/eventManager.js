export const InputEvents = Object.freeze({
    KeyW: "KeyW",
    KeyA: "KeyA",
    KeyS: "KeyS",
    KeyD: "KeyD",
    KeyE: "KeyE",
    KeyM: "KeyM",
    MouseClick: "MouseClick"
});

export class EventManager {
    constructor() {
        this.clearAll();
    }

    registerInbox(eventBoxName, ...eventNames) {
        for (const eventName of eventNames) {
            const inputBoxes = (this.eventToInputBoxes[eventName] ??= {});
            inputBoxes[eventBoxName] = null;
        }
    }

    pushEvent(eventName, event) {
        const inputBoxes = (this.eventToInputBoxes[eventName] ??= {});
        Object.keys(inputBoxes).forEach(eventBoxName => inputBoxes[eventBoxName] = event);
    }

    hasEvent(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        return inputBoxes && inputBoxes[eventBoxName] != null;
    }

    hasThenClear(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (!inputBoxes) return false;

        const result = inputBoxes[eventBoxName] != null;
        inputBoxes[eventBoxName] = null;
        return result;
    }

    getEvent(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        return inputBoxes && inputBoxes[eventBoxName];
    }

    getThenClear(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (!inputBoxes) return null;

        const result = inputBoxes[eventBoxName];
        inputBoxes[eventBoxName] = null;
        return result;
    }

    clearEvent(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (inputBoxes) inputBoxes[eventBoxName] = null;
    }

    clearEventForAll(eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        if (inputBoxes) Object.keys(inputBoxes).forEach(eventBoxName => inputBoxes[eventBoxName] = null);
    }

    clearAll() {
        this.eventToInputBoxes = {};
    }
}
