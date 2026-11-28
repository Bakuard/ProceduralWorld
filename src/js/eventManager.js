export const InputEvents = Object.freeze({
    KeyW: 'KeyW',
    KeyA: 'KeyA',
    KeyS: 'KeyS',
    KeyD: 'KeyD',
    KeyE: 'KeyE',
    KeyM: 'KeyM',
    PointerTap: 'PointerTap',
    PointerDown: 'PointerDown',
    PointerUp: 'PointerUp',
    PointerMove: 'PointerMove',
    Wheel: 'Wheel',
    Resize: 'Resize'
});

export class DOMEventUtil {
    constructor() {
        this.domEventsAbortController = new AbortController();
    }

    on(domContainer, domEventName, callback) {
        domContainer.addEventListener(domEventName, callback, { signal: this.domEventsAbortController.signal });
    }

    removeAllListeners() {
        this.domEventsAbortController.abort();
        this.domEventsAbortController = new AbortController();
    }
}

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

    pushEvent(eventName, event, ...inboxNames) {
        const inputBoxes = (this.eventToInputBoxes[eventName] ??= {});
        if(inboxNames.length === 0) inboxNames = Object.keys(inputBoxes);
        inboxNames.forEach(eventBoxName => {
            if(Object.hasOwn(inputBoxes, eventBoxName)) inputBoxes[eventBoxName] = event
        });
    }

    hasEvent(eventBoxName, eventName) {
        const inputBoxes = this.eventToInputBoxes[eventName];
        return inputBoxes && inputBoxes[eventBoxName] != null;
    }

    pullEvent(eventBoxName, eventName) {
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
