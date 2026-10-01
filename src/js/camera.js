import {Vector} from "./vector";

export class Camera {
    constructor(viewportWidth, viewportHeight, cameraConfig) {
        this.offsetVector = new Vector();
        this.globalPixelX = 0;
        this.globalPixelY = 0;
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

    setPosition(globalPixelX, globalPixelY) {
        this.globalPixelX = globalPixelX;
        this.globalPixelY = globalPixelY;

        const viewportX = globalPixelX + this.offsetVector.x;
        if (viewportX < this.deadZoneLeft) {
            this.offsetVector.x += this.deadZoneLeft - viewportX;
        } else if (viewportX > this.deadZoneRight) {
            this.offsetVector.x += this.deadZoneRight - viewportX;
        }

        const viewportY = globalPixelY + this.offsetVector.y;
        if (viewportY < this.deadZoneTop) {
            this.offsetVector.y += this.deadZoneTop - viewportY;
        } else if (viewportY > this.deadZoneBottom) {
            this.offsetVector.y += this.deadZoneBottom - viewportY;
        }

        return this;
    }

    resize(viewportWidth, viewportHeight) {
        this.deadZoneLeft = viewportWidth * this.deadZoneLeftIndent;
        this.deadZoneRight = viewportWidth - viewportWidth * this.deadZoneRightIndent;
        this.deadZoneTop = viewportHeight * this.deadZoneTopIndent;
        this.deadZoneBottom = viewportHeight - viewportHeight * this.deadZoneBottomIndent;
        this.setPosition(this.globalPixelX, this.globalPixelY);
        return this;
    }

    toViewportPixelX(globalPixelX) {
        return globalPixelX + this.offsetVector.x;
    }

    toViewportPixelY(globalPixelY) {
        return globalPixelY + this.offsetVector.y;
    }
}