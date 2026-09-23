Array.prototype.remove = function(obj) {
    const index = this.indexOf(obj);
    if(index > -1) this.splice(index, 1);
};

Math.inRange = function(value, min, max) {
    return value >= min && value <= max;
}

Math.randomIntegerInRange = function(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}