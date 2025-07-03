import {objectTypes} from "./objectTypes.js";

function randomIntegerInRange(randomValue, min, max) {
    return Math.floor(randomValue * (max - min + 1)) + min;
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


export function MapGenerator(sizeUnitsConverter, seed, octaves, persistence, frequency, frequencyMod, distanceBetweenTreesInTile, treeOffsetInPixel) {
    this.seed = seed ?? randomIntegerInRange(Math.random(), 0, 1_000_000);
    this.octaves = octaves ?? 16;
    this.persistence = persistence ?? 0.5;
    this.frequency = frequency ?? 0.01;
    this.frequencyMod = frequencyMod ?? 2;
    this.treeCellSizePerTile = distanceBetweenTreesInTile ?? 2;
    this.offsetVectors = createOffsetVectors(8, treeOffsetInPixel ?? sizeUnitsConverter.tileWidth * 0.5);
    this.sizeUnitsConverter = sizeUnitsConverter;
};

function chooseTreeType(noiseForTree) {
    if(noiseForTree < 0.6) {
        return objectTypes.littleOak;
    } else if(noiseForTree < 0.8) {
        return objectTypes.bigOak
    } else if(noiseForTree < 0.95) {
        return objectTypes.heightOak;
    } else if(noiseForTree < 0.97) {
        return objectTypes.deadLittleOak;
    } else if(noiseForTree < 0.99) {
        return objectTypes.deadBigOak;
    } else {
        return objectTypes.deadHeightOak;
    }
}

function createOffsetVectors(count, vectorLength) {
    const vectors = [];
    const step = (2 * Math.PI) / count;

    for (let i = 0; i < count; i++) {
        const angle = i * step;
        const x = Math.cos(angle);
        const y = Math.sin(angle);
        vectors.push({
            x: x * vectorLength,
            y: y * vectorLength
        });
    }

    return vectors;
}

function generateTree(mapGenerator, tileX, tileY) {
    if(tileX % mapGenerator.treeCellSizePerTile !== 0
        || tileY % mapGenerator.treeCellSizePerTile !== 0
        || mapGenerator.height < 0.6
        || mapGenerator.height > 0.75) return null;

    const noiseForTree = mapGenerator.noise(tileX, tileY);
    const offsetVector = mapGenerator.offsetVectors[randomIntegerInRange(noiseForTree, 0, mapGenerator.offsetVectors.length - 1)];
    const pixelX = mapGenerator.sizeUnitsConverter.centerPixelXOfTile(tileX) + offsetVector.x;
    const pixelY = mapGenerator.sizeUnitsConverter.centerPixelYOfTile(tileY) + offsetVector.y;

    return { pixelX: pixelX, pixelY: pixelY, treeType: chooseTreeType(noiseForTree) };
}

function generateTileType(height) {
    if(height < 0.45)
        return objectTypes.waterTile;
    else if(height < 0.48)
        return objectTypes.sandTile;
    else
        return objectTypes.grassTile;
}

MapGenerator.prototype.generate = function(tileX, tileY) {
    this.height = multipleOctavesNoise(tileX, tileY, this.seed, this.octaves, this.persistence, this.frequency, this.frequencyMod);
    this.tileType = generateTileType(this.height);
    this.tree = generateTree(this, tileX, tileY);
};

MapGenerator.prototype.getTileType = function() {
    return this.tileType;
};

MapGenerator.prototype.getTree = function() {
    return this.tree;
};

MapGenerator.prototype.noise = function(x, y) {
    return noise(x, y, this.seed);
}