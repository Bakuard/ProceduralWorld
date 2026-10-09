export class UnorderedPool {
    constructor() {
        this.usedItems = new DenseArray();
        this.unusedItems = [];
        this.inPool = Symbol('inPool');
    }

    addAsUnused(item) {
        if(!item[this.inPool]) {
            this.unusedItems.push(item);
            item[this.inPool] = true;
        }
    }

    release(item) {
        const itemExist = this.usedItems.quickRemove(item);
        if(itemExist) this.unusedItems.push(item);
        return itemExist;
    }

    acquire() {
        const item = this.unusedItems.pop();
        this.usedItems.addLast(item);
        return item;
    }

    getUsed(index) {
        return this.usedItems.get(index);
    }

    getCountUsedItems() {
        return this.usedItems.getSize();
    }

    getCountAllItems() {
        return this.usedItems.getSize() + this.unusedItems.length;
    }

    forEachUsed(callback) {
        this.usedItems.forEach(callback);
    }
}

class DenseArray {
    constructor() {
        this.array = [];
        this.indexInArray = Symbol('indexInArray');
    }

    addLast(item) {
        if(item) {
            this.setItemIndex(item, this.array.length);
            this.array.push(item);
        }
    }

    quickRemove(item) {
        if(this.array.length > 0 && this.array[this.getItemIndex(item)] === item) {
            const lastItem = this.array.at(-1);
            this.setItemIndex(lastItem, this.getItemIndex(item));
            this.array[this.getItemIndex(item)] = lastItem;
            this.array.pop();
            return true;
        }
        return false;
    }

    get(index) {
        return this.array[index];
    }

    forEach(callback) {
        for(let i = this.array.length - 1; i >= 0; i--) {
            callback(this.array[i], i);
        }
    }

    getSize() {
        return this.array.length;
    }

    getItemIndex(item) {
        return item[this.indexInArray];
    }

    setItemIndex(item, index) {
        item[this.indexInArray] = index;
    }
}