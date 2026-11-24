import Matter from 'matter-js';
import {DenseArray} from "./unorderedPool";
import {Vector} from "./vector";

export class CollisionManager {
    constructor() {
        this.collisionDetector = Matter.Detector.create({});
        this.allPhysicsBodies = new DenseArray();
        this.physicsBodiesListWasChanged = false;
        this.handlers = {};
    }

    createCircleCollider(pixelX, pixelY, radius, anchorX, anchorY, owner) {
        const centerOffsetX = (0.5 - anchorX) * radius * 2;
        const centerOffsetY = (0.5 - anchorY) * radius * 2;

        const body = Matter.Bodies.circle(pixelX + centerOffsetX, pixelY + centerOffsetY, radius);
        body.positionAndOffset = { x: pixelX, y: pixelY, offset: new Vector(centerOffsetX, centerOffsetY) };
        body.owner = owner;

        return body;
    }

    createRectCollider(pixelX, pixelY, width, height, anchorX, anchorY, owner) {
        const centerOffsetX = (0.5 - anchorX) * width;
        const centerOffsetY = (0.5 - anchorY) * height;

        const body = Matter.Bodies.rectangle(pixelX + centerOffsetX, pixelY + centerOffsetY, width, height);
        body.positionAndOffset = { x: pixelX, y: pixelY, offset: new Vector(centerOffsetX, centerOffsetY) };
        body.owner = owner;

        return body;
    }

    setPosition(body, x, y) {
        body.positionAndOffset.x = x + body.positionAndOffset.offset.x;
        body.positionAndOffset.y = y + body.positionAndOffset.offset.y;
        Matter.Body.setPosition(body, body.positionAndOffset);
    }

    setPositionAndAngle(body, x, y, angle) {
        Matter.Body.setAngle(body, angle);
        body.positionAndOffset.offset.rotateTo(angle).negate();

        this.setPosition(body, x, y);
    }


    registerBody(body, groupName) {
        const wasAdded = this.allPhysicsBodies.addLast(body);
        if(wasAdded) {
            body.groupName = groupName;
            this.physicsBodiesListWasChanged = true;
        }
    }

    unregisterBody(body) {
        this.physicsBodiesListWasChanged ||= this.allPhysicsBodies.quickRemove(body);
    }

    unregisterAllBodies() {
        this.physicsBodiesListWasChanged ||= this.allPhysicsBodies.getSize() > 0;
        this.allPhysicsBodies.clear();
    }

    forEachRegisteredBody(callback) {
        this.allPhysicsBodies.forEach(callback);
    }


    registerHandler(groupName1, groupName2, callback) {
        if(this.handlers[groupName2]?.[groupName1]) this.handlers[groupName2][groupName1] = null;

        this.handlers[groupName1] ??= {};
        this.handlers[groupName1][groupName2] = callback;
    }

    unregisterAllHandlers() {
        this.handlers = {};
    }


    handleCollisions() {
        if(this.physicsBodiesListWasChanged) {
            Matter.Detector.setBodies(this.collisionDetector, this.allPhysicsBodies.innerArray);
            this.physicsBodiesListWasChanged = false;
        }

        Matter.Detector.collisions(this.collisionDetector).forEach(collision => {
            const { bodyA, bodyB } = collision;

            const handlerAB = this.handlers[bodyA.groupName]?.[bodyB.groupName];
            if(handlerAB) {
                handlerAB(bodyA.owner, bodyB.owner);
                return;
            }

            const handlerBA = this.handlers[bodyB.groupName]?.[bodyA.groupName];
            if(handlerBA) {
                handlerBA(bodyB.owner, bodyA.owner);
            }
        });
    }
}