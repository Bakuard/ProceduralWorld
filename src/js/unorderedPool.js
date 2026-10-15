export class UnorderedPool {
    constructor() {
        this.usedItems = new DenseArray();
        this.unusedItems = [];
    }

    acquire(factoryCallback) {
        const item = this.unusedItems.pop() ?? factoryCallback();
        this.usedItems.addLast(item);
        return item;
    }

    release(item) {
        const itemExist = this.usedItems.quickRemove(item);
        if(itemExist) this.unusedItems.push(item);
        return itemExist;
    }

    getUsed(index) {
        return this.usedItems.get(index);
    }

    getCountUsedItems() {
        return this.usedItems.getSize();
    }

    getCountUnusedItems() {
        return this.unusedItems.length;
    }

    getCountAllItems() {
        return this.usedItems.getSize() + this.unusedItems.length;
    }

    forEachUsed(callback) {
        this.usedItems.forEach(callback);
    }
}

export class DenseArray {
    constructor() {
        this.innerArray = [];
        this.indexInArray = Symbol('indexInArray');
    }

    addLast(item) {
        if(item && !this.contain(item)) {
            this.#setItemIndex(item, this.innerArray.length);
            this.innerArray.push(item);
            return true;
        }
        return false;
    }

    quickRemove(item) {
        if(item && this.contain(item)) {
            const itemIndex = this.#getItemIndex(item);
            const lastItem = this.innerArray.at(-1);
            this.#setItemIndex(lastItem, itemIndex);
            this.innerArray[itemIndex] = lastItem;
            this.innerArray.pop();
            return true;
        }
        return false;
    }

    get(index) {
        return this.innerArray[index];
    }

    forEach(callback) {
        for(let i = this.innerArray.length - 1; i >= 0; i--) {
            callback(this.innerArray[i], i);
        }
    }

    getSize() {
        return this.innerArray.length;
    }

    contain(item) {
        return this.innerArray[this.#getItemIndex(item)] === item;
    }


    #getItemIndex(item) {
        return item[this.indexInArray];
    }

    #setItemIndex(item, index) {
        item[this.indexInArray] = index;
    }
}