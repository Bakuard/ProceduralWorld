import {Vector} from "./vector";

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

        this.resize(viewportWidth, viewportHeight);
    }

    centerOn(targetGlobalPixelX, targetGlobalPixelY) {
        this.targetGlobalPixelX = targetGlobalPixelX;
        this.targetGlobalPixelY = targetGlobalPixelY;
        const viewportCenterX = this.viewportWidth / 2;
        const viewportCenterY = this.viewportHeight / 2;
        this.offsetVector.set(viewportCenterX - targetGlobalPixelX, viewportCenterY - targetGlobalPixelY);
    }

    followIfOutOfDeadZone(targetGlobalPixelX, targetGlobalPixelY) {
        this.targetGlobalPixelX = targetGlobalPixelX;
        this.targetGlobalPixelY = targetGlobalPixelY;

        const viewportX = targetGlobalPixelX + this.offsetVector.x;
        if (viewportX < this.deadZoneLeft) {
            this.offsetVector.x += this.deadZoneLeft - viewportX;
        } else if (viewportX > this.deadZoneRight) {
            this.offsetVector.x += this.deadZoneRight - viewportX;
        }

        const viewportY = targetGlobalPixelY + this.offsetVector.y;
        if (viewportY < this.deadZoneTop) {
            this.offsetVector.y += this.deadZoneTop - viewportY;
        } else if (viewportY > this.deadZoneBottom) {
            this.offsetVector.y += this.deadZoneBottom - viewportY;
        }

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
}