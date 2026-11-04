import './util.js';

export class NoiseGenerator {
    constructor(seed) {
        this.seed = seed ?? Math.randomIntegerInRange(0, 1_000_000);
    }

    noise(x, y) {
        let n = x * 374761393 + y * 668265263 + this.seed * 144665633;
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        n = n ^ (n >>> 16);
        return (n >>> 0) / 4294967296;
    }

    multipleOctavesNoise(x, y, octaves, persistence, frequency, frequencyMod) {
        let result = 0, amplitude = 1, max = 0;
        while(octaves-- > 0) {
            result += this.#interpolatedNoise(x, y, this.seed, frequency) * amplitude;
            frequency *= frequencyMod;
            max += amplitude;
            amplitude *= persistence;
        }
        return result / max;
    }


    #interpolatedNoise(x, y, seed, frequency) {
        x *= frequency;
        y *= frequency;
        const left = Math.floor(x), top = Math.floor(y);
        const localX = x - left, localY = y - top;
        const topLeftCorner = this.noise(left, top, seed);
        const topRightCorner = this.noise(left + 1, top, seed);
        const bottomLeftCorner = this.noise(left, top + 1, seed);
        const bottomRightCorner = this.noise(left + 1, top + 1, seed);
        return this.#lerp(this.#lerp(topLeftCorner, topRightCorner, localX), this.#lerp(bottomLeftCorner, bottomRightCorner, localX), localY);
    }

    #lerp(a, b, t) {
        return a + (b - a) * t;
    }
}