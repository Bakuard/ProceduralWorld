export class DenseArrayStore {
    constructor() {
        this.array = [];
    }

    addLast(item) {
        item.indexInArray = this.array.length;
        this.array.push(item);
    }

    quickRemove(item) {
        if(this.array.length > 0 && this.array[item.indexInArray] === item) {
            const lastItem = this.array.at(-1);
            lastItem.indexInArray = item.indexInArray;
            this.array[item.indexInArray] = lastItem;
            this.array.pop();
            return true;
        }
        return false;
    }

    get(index) {
        return this.array[index];
    }

    forEach(callback) {
        this.array.forEach(callback);
    }

    getSize() {
        return this.array.length;
    }
}