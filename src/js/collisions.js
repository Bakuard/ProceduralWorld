import Matter from 'matter-js';
import {DenseArray} from "./unorderedPool";
import {Vector} from "./vector";

export class CollisionManager {
    constructor() {
        this.collisionDetector = Matter.Detector.create({});
        this.allPhysicsBodies = new DenseArray();
    }

    createCircleCollider(pixelX, pixelY, radius, anchorX, anchorY, owner) {
        const centerOffsetX = (0.5 - anchorX) * radius * 2;
        const centerOffsetY = (0.5 - anchorY) * radius * 2;

        const body = Matter.Bodies.circle(pixelX + centerOffsetX, pixelY + centerOffsetY, radius);
        body.positionAnnOffset = { x: pixelX, y: pixelY, offset: new Vector(centerOffsetX, centerOffsetY) };
        body.owner = owner;

        return body;
    }

    createRectCollider(pixelX, pixelY, width, height, anchorX, anchorY, owner) {
        const centerOffsetX = (0.5 - anchorX) * width;
        const centerOffsetY = (0.5 - anchorY) * height;

        const body = Matter.Bodies.rectangle(pixelX + centerOffsetX, pixelY + centerOffsetY, width, height);
        body.positionAnnOffset = { x: pixelX, y: pixelY, offset: new Vector(centerOffsetX, centerOffsetY) };
        body.owner = owner;

        return body;
    }

    setPosition(body, x, y) {
        body.positionAnnOffset.x = x + body.positionAnnOffset.offset.x;
        body.positionAnnOffset.y = y + body.positionAnnOffset.offset.y;
        Matter.Body.setPosition(body, body.positionAnnOffset);
    }

    setPositionAndAngle(body, x, y, angle) {
        Matter.Body.setAngle(body, angle);
        body.positionAnnOffset.offset.rotateTo(angle).negate();

        this.setPosition(body, x, y);
    }

    registerBody(body) {
        this.allPhysicsBodies.addLast(body);
    }

    unregisterBody(body) {
        this.allPhysicsBodies.quickRemove(body);
    }

    forEachBody(callback) {
        this.allPhysicsBodies.forEach(callback);
    }

    handleCollisions(callbackHandler) {
        Matter.Detector.setBodies(this.collisionDetector, this.allPhysicsBodies.innerArray);

        Matter.Detector.collisions(this.collisionDetector).forEach(collision => {
            const objA = collision.bodyA.owner;
            const objB = collision.bodyB.owner;
            callbackHandler(objA, objB, collision.bodyA, collision.bodyB);
        });
    }
}