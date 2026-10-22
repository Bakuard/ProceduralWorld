#version 300 es
precision mediump float;

const vec3 MORNING_TINT = vec3(1.1, 0.8, 0.9); //оттенок рассвета
const vec3 EVENING_TINT = vec3(1.2, 0.75, 0.6); //оттенок заката
const vec3 NIGHT_TINT = vec3(0.3, 0.65, 1.25); //оттенок ночи

const int MORNING_DAY_PHASE = 1;
const int AFTERNOON_DAY_PHASE = 2;
const int EVENING_DAY_PHASE = 3;
const int NIGHT_DAY_PHASE = 4;

in vec2 vTextureCoord;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float uIntensity;
uniform int uDayPhase;
uniform sampler2D uLightPointTexture;

vec4 nightColor(vec4 color) {
    vec3 nightColor = color.rgb * NIGHT_TINT;
    return vec4(nightColor / (2.3 + nightColor), color.a);
}

vec4 morningColor(vec4 color) {
    return vec4(color.rgb * MORNING_TINT, color.a);
}

vec4 eveningColor(vec4 color) {
    return vec4(color.rgb * EVENING_TINT, color.a);
}

vec4 changeColor(vec4 originalColor, vec4 targetColor, float intensity) {
    originalColor.rgb = mix(originalColor.rgb, targetColor.rgb, intensity);
    originalColor.rgb = clamp(originalColor.rgb, 0.0, 1.0);
    return originalColor;
}

vec4 applyLocalLight(vec4 globalLight, vec4 originalColor) {
	vec4 localLight = texture(uLightPointTexture, vTextureCoord);
	return vec4(mix(globalLight.rgb, originalColor.rgb, localLight.rgb), originalColor.a);
}

void main(void) {
	vec4 original = texture(uTexture, vTextureCoord);
	vec4 globalLight = original;

	if(uDayPhase == MORNING_DAY_PHASE) {
		globalLight = changeColor(morningColor(original), original, uIntensity);
	} else if(uDayPhase == AFTERNOON_DAY_PHASE) {
		globalLight = changeColor(original, eveningColor(original), uIntensity);
	} else if(uDayPhase == EVENING_DAY_PHASE) {
		globalLight = changeColor(eveningColor(original), nightColor(original), uIntensity);
	} else if(uDayPhase == NIGHT_DAY_PHASE) {
		globalLight = changeColor(nightColor(original), morningColor(original), uIntensity);
	}

	fragColor = applyLocalLight(globalLight, original);
}
