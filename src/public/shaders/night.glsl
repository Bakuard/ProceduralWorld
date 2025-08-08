#ifdef GL_ES
precision mediump float;
#endif

const vec3 NIGHT_COLOR = vec3(0.1, 0.15, 0.3); // тёмно-синий оттенок ночи

varying vec2 outTexCoord;
uniform sampler2D uMainSampler;
uniform float uIntensity;
uniform bool uIsEnabled;

void main(void) {
	vec4 color = texture2D(uMainSampler, outTexCoord);
	if(uIsEnabled) {
		float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
		vec3 nightTint = mix(vec3(gray), NIGHT_COLOR, uIntensity);
		float highlight = smoothstep(0.6, 1.0, gray) * 0.3;
		vec3 finalColor = nightTint + vec3(highlight);
		color = vec4(finalColor, 1.0);
	}
	gl_FragColor = color;
}