export class Vector {
    constructor(x = 0, y = 0) {
        this.set(x, y);
    }

    set(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }

    scaleBy(value) {
        this.x *= value;
        this.y *= value;
        return this;
    }

    getLength() {
        return Math.hypot(this.x, this.y);
    }

    isZero() {
        return this.x === 0 && this.y === 0;
    }

    add(vector) {
        this.x += vector.x;
        this.y += vector.y;
        return this;
    }

    normalize() {
        if(this.isZero()) return this;

        const length = this.getLength();
        this.x /= length;
        this.y /= length;
        return this;
    }

    negate() {
        this.set(-this.x, -this.y);
        return this;
    }

    rotateBy(angleInRadians) {
        const x = this.x;
        const y = this.y;
        const cos = Math.cos(angleInRadians);
        const sin = Math.sin(angleInRadians);
        this.set(x * cos - y * sin, x * sin + y * cos);
        return this;
    }

    rotateTo(angleInRadians) {
        const length = this.getLength();
        const cos = Math.cos(angleInRadians);
        const sin = Math.sin(angleInRadians);
        this.set(cos * length, sin * length);
        return this;
    }

    getAngleInRadian() {
        return Math.atan2(this.y, this.x);
    }

    clone() {
        return new Vector(this.x, this.y);
    }
}