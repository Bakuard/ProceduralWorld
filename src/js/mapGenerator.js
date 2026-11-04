import './util.js';
import {objectTypes} from "./objectTypes.js";

export class MapGenerator {
    constructor(sizeUnitsConverter, noiseGenerator, mapGeneratorConfig) {
        this.octaves = mapGeneratorConfig.octaves;
        this.persistence = mapGeneratorConfig.persistence;
        this.frequency = mapGeneratorConfig.frequency;
        this.frequencyMod = mapGeneratorConfig.frequencyMod;
        this.treeCellSizePerTile = mapGeneratorConfig.distanceBetweenTreesInTile;
        this.offsetVectors = createOffsetVectors(8, mapGeneratorConfig.treeRandomOffsetInPixel);
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.noiseGenerator = noiseGenerator;
    }

    generate(tileX, tileY) {
        this.height = this.noiseGenerator.multipleOctavesNoise(tileX, tileY, this.octaves, this.persistence, this.frequency, this.frequencyMod);
        this.tileType = generateTileType(this.height);
        this.tree = generateTree(this, tileX, tileY);
    }

    getTileType() {
        return this.tileType;
    }

    getTree() {
        return this.tree;
    }
}

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

    const noiseForTree = mapGenerator.noiseGenerator.noise(tileX, tileY);
    const offsetVector = mapGenerator.offsetVectors[randomIntegerInRange(noiseForTree, 0, mapGenerator.offsetVectors.length - 1)];
    const pixelX = mapGenerator.sizeUnitsConverter.centerPixelXOfTile(tileX) + offsetVector.x;
    const pixelY = mapGenerator.sizeUnitsConverter.centerPixelYOfTile(tileY) + offsetVector.y;

    return { globalPixelX: pixelX, globalPixelY: pixelY, treeType: chooseTreeType(noiseForTree) };
}

function generateTileType(height) {
    if(height < 0.45)
        return objectTypes.waterTile;
    else if(height < 0.48)
        return objectTypes.sandTile;
    else
        return objectTypes.grassTile;
}


function randomIntegerInRange(randomValue, min, max) {
    return Math.floor(randomValue * (max - min + 1)) + min;
}