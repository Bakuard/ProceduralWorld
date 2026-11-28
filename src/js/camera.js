import {Vector} from "./vector";
import './util.js';

export class Camera {
    constructor(viewportWidth, viewportHeight, cameraConfig) {
        this.offsetVector = new Vector();
        this.targetGlobalPixelX = 0;
        this.targetGlobalPixelY = 0;
        this.deadZoneLeftIndent = cameraConfig.deadZoneLeftIndent;
        this.deadZoneRightIndent = cameraConfig.deadZoneRightIndent;
        this.deadZoneTopIndent = cameraConfig.deadZoneTopIndent;
        this.deadZoneBottomIndent = cameraConfig.deadZoneBottomIndent;
        this.deadZoneLeft = 0;
        this.deadZoneRight = 0;
        this.deadZoneTop = 0;
        this.deadZoneBottom = 0;
        this.bounds = null;

        this.resize(viewportWidth, viewportHeight);
    }

    setBounds(left, top, width, height) {
        this.bounds = { left, top, width, height, right: left + width, bottom: top + height };
        this.#applyBounds();
        return this;
    }

    removeBounds() {
        this.bounds = null;
        return this;
    }

    centerOn(targetGlobalPixelX, targetGlobalPixelY) {
        this.targetGlobalPixelX = targetGlobalPixelX;
        this.targetGlobalPixelY = targetGlobalPixelY;
        const viewportCenterX = this.viewportWidth / 2;
        const viewportCenterY = this.viewportHeight / 2;
        this.offsetVector.set(viewportCenterX - targetGlobalPixelX, viewportCenterY - targetGlobalPixelY);
        this.#applyBounds();
        return this;
    }

    followIfOutOfDeadZone(targetGlobalPixelX, targetGlobalPixelY) {
        this.targetGlobalPixelX = targetGlobalPixelX;
        this.targetGlobalPixelY = targetGlobalPixelY;

        const viewportX = targetGlobalPixelX + this.offsetVector.x;
        if(viewportX < this.deadZoneLeft) this.offsetVector.x += this.deadZoneLeft - viewportX;
        else if(viewportX > this.deadZoneRight) this.offsetVector.x += this.deadZoneRight - viewportX;

        const viewportY = targetGlobalPixelY + this.offsetVector.y;
        if(viewportY < this.deadZoneTop) this.offsetVector.y += this.deadZoneTop - viewportY;
        else if(viewportY > this.deadZoneBottom) this.offsetVector.y += this.deadZoneBottom - viewportY;

        this.#applyBounds();
        return this;
    }

    resize(viewportWidth, viewportHeight) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
        this.deadZoneLeft = viewportWidth * this.deadZoneLeftIndent;
        this.deadZoneRight = viewportWidth - viewportWidth * this.deadZoneRightIndent;
        this.deadZoneTop = viewportHeight * this.deadZoneTopIndent;
        this.deadZoneBottom = viewportHeight - viewportHeight * this.deadZoneBottomIndent;
        this.followIfOutOfDeadZone(this.targetGlobalPixelX, this.targetGlobalPixelY);
        return this;
    }

    toViewportPixelX(globalPixelX) {
        return globalPixelX + this.offsetVector.x;
    }

    toViewportPixelY(globalPixelY) {
        return globalPixelY + this.offsetVector.y;
    }

    toGlobalPixelX(viewportPixelX) {
        return viewportPixelX - this.offsetVector.x;
    }

    toGlobalPixelY(viewportPixelY) {
        return viewportPixelY - this.offsetVector.y;
    }


    #applyBounds() {
        if(!this.bounds) return;

        if(this.bounds.width <= this.viewportWidth) this.offsetVector.x = (this.viewportWidth - this.bounds.width) / 2 - this.bounds.left;
        else this.offsetVector.x = Math.clamp(this.offsetVector.x, this.viewportWidth - this.bounds.right, -this.bounds.left);

        if(this.bounds.height <= this.viewportHeight) this.offsetVector.y = (this.viewportHeight - this.bounds.height) / 2 - this.bounds.top;
        else this.offsetVector.y = Math.clamp(this.offsetVector.y, this.viewportHeight - this.bounds.bottom, -this.bounds.top);
    }
}