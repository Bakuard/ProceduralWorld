import {Assets, Container, defaultFilterVert, Filter, RenderTexture, Sprite} from 'pixi.js';
import {dayPhases} from "./calendar";

export class LightManager {
    static nightShaderCode = 'nightShaderCode';
    static pointLightTexture = 'point_light_texture';

    static async loadShaders() {
        await Assets.load({ alias: LightManager.nightShaderCode, src: 'shaders/night.glsl',  parser: 'text' });
    }

    static async loadTextures() {
        await Assets.load({ alias: LightManager.pointLightTexture, src: 'img/point_light_texture.png' });
    }


    constructor(viewportWidth, viewportHeight, resolution, timeConfig) {
        this.resolution = resolution;
        this.morningPhaseTransitionFraction = timeConfig.morningPhaseTransitionFraction;
        this.afternoonPhaseTransitionFraction = timeConfig.afternoonPhaseTransitionFraction;
        this.eveningPhaseTransitionFraction = timeConfig.eveningPhaseTransitionFraction;
        this.nightPhaseTransitionFraction = timeConfig.nightPhaseTransitionFraction;

        this.lightPointContainer = new Container();
        this.lightPointTexture = RenderTexture.create({
            width: viewportWidth,
            height: viewportHeight,
            resolution: resolution,
            scaleMode: 'linear'
        });
    }

    createLightPointSprite(radius, color) {
        const light = new Sprite(Assets.get(LightManager.pointLightTexture));
        light.anchor.set(0.5, 0.5);
        light.blendMode = 'screen';
        light.width = radius * 2;
        light.height = radius * 2;
        light.tint = color;
        return light;
    }

    registerLightPointSprite(lightPointSprite) {
        this.lightPointContainer.addChild(lightPointSprite);
    }

    unregisterLightPointSprite(lightPointSprite) {
        lightPointSprite.removeFromParent();
    }

    setLightPointPosition(lightPointSprite, x, y, camera) {
        const spriteX = camera.toViewportPixelX(x);
        const spriteY = camera.toViewportPixelY(y);
        lightPointSprite.position.set(spriteX, spriteY);
    }


    resizePointLightingToTexture(viewportWidth, viewportHeight) {
        this.lightPointTexture.resize(viewportWidth, viewportHeight, this.resolution);
    }

    renderPointLightingToTexture(calendar, renderer) {
        if(calendar.isAfternoon()) return;

        renderer.render({
            container: this.lightPointContainer,
            target: this.lightPointTexture,
            clear: true
        });
    }


    prepareGlobalLightShader(targetContainer) {
        this.nightShader = Filter.from({
            gl: {
                fragment: Assets.get(LightManager.nightShaderCode),
                vertex: defaultFilterVert
            },
            resources: {
                timeUniforms: {
                    uIntensity: { value: 0.0, type: 'f32' },
                    uDayPhase: { value: 1, type: 'i32' }
                },
                uLightPointTexture: this.lightPointTexture.source
            },
        });

        const existingFilters = targetContainer.filters ?? [];
        targetContainer.filters = [...existingFilters, this.nightShader];
    }

    updateGlobalLightShader(calendar) {
        const currentDayPhaseProgress = calendar.getCurrentPhaseProgress();
        const timeUniforms = this.nightShader.resources.timeUniforms.uniforms;
        let transitionFraction = 0;
        switch(calendar.getCurrentDayPhase()) {
            case dayPhases.morning:
                timeUniforms.uDayPhase = 1;
                transitionFraction = this.morningPhaseTransitionFraction;
                break;
            case dayPhases.afternoon:
                timeUniforms.uDayPhase = 2;
                transitionFraction = this.afternoonPhaseTransitionFraction;
                break;
            case dayPhases.evening:
                timeUniforms.uDayPhase = 3;
                transitionFraction = this.eveningPhaseTransitionFraction;
                break;
            case dayPhases.night:
                timeUniforms.uDayPhase = 4;
                transitionFraction = this.nightPhaseTransitionFraction;
                break;
        }
        timeUniforms.uIntensity =  Math.max(0, (currentDayPhaseProgress - (1 - transitionFraction)) / transitionFraction);
    }
}