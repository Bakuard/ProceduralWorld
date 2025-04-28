const seed = randomInteger(0, 1000000);
export const tileTypes = {
  water: 'water',
  sand: 'sand',
  grass: 'grass'
};

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function noise(x, y, seed) {
    let n = x * 374761393 + y * 668265263 + seed * 144665633;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function interpolatedNoise(x, y, seed, frequency) {
    x *= frequency;
    y *= frequency;
    const left = Math.floor(x), top = Math.floor(y);
    const localX = x - left, localY = y - top;
    const topLeftCorner = noise(left, top, seed);
    const topRightCorner = noise(left + 1, top, seed);
    const bottomLeftCorner = noise(left, top + 1, seed);
    const bottomRightCorner = noise(left + 1, top + 1, seed);
    return lerp(lerp(topLeftCorner, topRightCorner, localX), lerp(bottomLeftCorner, bottomRightCorner, localX), localY);
}

function multipleOctavesNoise(x, y, seed, octaves, persistence, frequency, frequencyMod) {
    let result = 0, amplitude = 1, max = 0;
    while(octaves-- > 0) {
        result += interpolatedNoise(x, y, seed, frequency) * amplitude;
        frequency *= frequencyMod;
        max += amplitude;
        amplitude *= persistence;
    }
    return result / max;
}

export function mapGenerator(x, y, octaves = 16, persistence = 0.5, frequency = 0.01, frequencyMod = 2) {
    const noise = multipleOctavesNoise(x, y, seed, octaves, persistence, frequency, frequencyMod);
    if(noise < 0.45)
        return tileTypes.water;
    else if(noise < 0.48)
        return tileTypes.sand;
    else
        return tileTypes.grass;
}