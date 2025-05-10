import {sizeUnitsConverter} from './sizeMeasurementUnits.js';

function randomInRange(randomValue, min, max) {
    return randomValue * (max - min) + min;
}

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

export const mapObjectTypes = {
    waterTile: 'water',
    sandTile: 'sand',
    grassTile: 'grass',
    littleOak: 'littleOak',
    bigOak: 'bigOak',
    heightOak: 'heightOak',
    deadLittleOak: 'deadLittleOak',
    deadBigOak: 'deadBigOak',
    deadHeightOak: 'deadHeightOak'
};

export function MapGenerator(seed, octaves, persistence, frequency, frequencyMod, treeCellSizePerTile) {
    this.seed = seed ?? randomInteger(0, 1_000_000);
    this.octaves = octaves ?? 16;
    this.persistence = persistence ?? 0.5;
    this.frequency = frequency ?? 0.01;
    this.frequencyMod = frequencyMod ?? 2;
    this.treeCellSizePerTile = treeCellSizePerTile ?? 1.8;
    this.treePositionOffset = this.treeCellSizePerTile / 5;

    MapGenerator.prototype.generate ??= function(xPerTile, yPerTile) {
        this.xPerTile = xPerTile;
        this.yPerTile = yPerTile;
        this.height = multipleOctavesNoise(xPerTile, yPerTile, this.seed, this.octaves, this.persistence, this.frequency, this.frequencyMod);

        //Генерируем координаты дерева
        this.tree = null;

        let treeCellX = Math.floor(this.xPerTile / this.treeCellSizePerTile);
        let treeCellY = Math.floor(this.yPerTile / this.treeCellSizePerTile);
        this.generateTree(treeCellX, treeCellY);

        treeCellX = Math.ceil(this.xPerTile / this.treeCellSizePerTile);
        treeCellY = Math.floor(this.yPerTile / this.treeCellSizePerTile);
        this.generateTree(treeCellX, treeCellY);

        treeCellX = Math.floor(this.xPerTile / this.treeCellSizePerTile);
        treeCellY = Math.ceil(this.yPerTile / this.treeCellSizePerTile);
        this.generateTree(treeCellX, treeCellY);

        treeCellX = Math.ceil(this.xPerTile / this.treeCellSizePerTile);
        treeCellY = Math.ceil(this.yPerTile / this.treeCellSizePerTile);
        this.generateTree(treeCellX, treeCellY);
    };
    MapGenerator.prototype.generateTree ??= function(treeCellX, treeCellY) {
        if(this.tree) return;

        const noiseForTree = noise(treeCellX, treeCellY, this.seed);
        const randomOffset = randomInRange(noiseForTree, -this.treePositionOffset, this.treePositionOffset);
        const treeXPerPixel = sizeUnitsConverter.getXPerPixelFromTile((treeCellX + randomOffset) * this.treeCellSizePerTile);
        const treeYPerPixel = sizeUnitsConverter.getYPerPixelFromTile((treeCellY + randomOffset) * this.treeCellSizePerTile);
        if(sizeUnitsConverter.doesTileContainPixel(this.xPerTile, this.yPerTile, treeXPerPixel, treeYPerPixel)
            && this.height >= 0.6 && this.height <= 0.75) {
            this.tree = {
                xPerPixel: treeXPerPixel,
                yPerPixel: treeYPerPixel
            };
        }
    };
    MapGenerator.prototype.getLandscape ??= function() {
        if(this.height < 0.45)
            return mapObjectTypes.waterTile;
        else if(this.height < 0.48)
            return mapObjectTypes.sandTile;
        else
            return mapObjectTypes.grassTile;
    };
    MapGenerator.prototype.getTree ??= function() {
        return this.tree;
    };
};