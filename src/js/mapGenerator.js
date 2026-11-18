import {objectTypes} from "./objectTypes.js";

export class MapGenerator {
    constructor(sizeUnitsConverter, noiseGenerator, mapGeneratorConfig) {
        this.octaves = mapGeneratorConfig.octaves;
        this.persistence = mapGeneratorConfig.persistence;
        this.frequency = mapGeneratorConfig.frequency;
        this.frequencyMod = mapGeneratorConfig.frequencyMod;
        this.distanceBetweenTreesInTile = mapGeneratorConfig.distanceBetweenTreesInTile;
        this.treeJitter = mapGeneratorConfig.treeJitter;
        this.waterMaxHeight = mapGeneratorConfig.heights.waterMax;
        this.sandMaxHeight = mapGeneratorConfig.heights.sandMax;
        this.grassMaxHeight = mapGeneratorConfig.heights.grassMax;
        this.treeMinHeight = mapGeneratorConfig.heights.treeMin;
        this.treeMaxHeight = mapGeneratorConfig.heights.treeMax;
        this.littleOakMaxNoise = mapGeneratorConfig.treeTypes.littleOakMaxNoise;
        this.bigOakMaxNoise = mapGeneratorConfig.treeTypes.bigOakMaxNoise;
        this.heightOakMaxNoise = mapGeneratorConfig.treeTypes.heightOakMaxNoise;
        this.deadLittleOakMaxNoise = mapGeneratorConfig.treeTypes.deadLittleOakMaxNoise;
        this.deadBigOakMaxNoise = mapGeneratorConfig.treeTypes.deadBigOakMaxNoise;
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.noiseGenerator = noiseGenerator;
    }

    generate(tileX, tileY, outputContainer) {
        outputContainer ??= {};
        outputContainer.height = this.noiseGenerator.multipleOctavesNoise(tileX, tileY, this.octaves, this.persistence, this.frequency, this.frequencyMod);
        outputContainer.tileType = generateTileType(this, outputContainer.height);
        outputContainer.treeMeta = generateTree(this, tileX, tileY, outputContainer.height);
        return outputContainer;
    }
}

function chooseTreeType(mapGenerator, noiseForTree) {
    if(noiseForTree < mapGenerator.littleOakMaxNoise) {
        return objectTypes.littleOak;
    } else if(noiseForTree < mapGenerator.bigOakMaxNoise) {
        return objectTypes.bigOak;
    } else if(noiseForTree < mapGenerator.heightOakMaxNoise) {
        return objectTypes.heightOak;
    } else if(noiseForTree < mapGenerator.deadLittleOakMaxNoise) {
        return objectTypes.deadLittleOak;
    } else if(noiseForTree < mapGenerator.deadBigOakMaxNoise) {
        return objectTypes.deadBigOak;
    } else {
        return objectTypes.deadHeightOak;
    }
}

function generateTree(mapGenerator, tileX, tileY, height) {
    if(tileX % mapGenerator.distanceBetweenTreesInTile !== 0
        || tileY % mapGenerator.distanceBetweenTreesInTile !== 0
        || height < mapGenerator.treeMinHeight
        || height > mapGenerator.treeMaxHeight) return null;

    const noiseForXPos = mapGenerator.noiseGenerator.noise(tileX, tileY, 1) - 0.5;
    const globalPixelX = mapGenerator.sizeUnitsConverter.centerPixelXOfTile(tileX) + mapGenerator.sizeUnitsConverter.tileWidthInPixels() * mapGenerator.distanceBetweenTreesInTile * mapGenerator.treeJitter * noiseForXPos;

    const noiseForYPos = mapGenerator.noiseGenerator.noise(tileX, tileY, 2) - 0.5;
    const globalPixelY = mapGenerator.sizeUnitsConverter.centerPixelYOfTile(tileY) + mapGenerator.sizeUnitsConverter.tileHeightInPixels() * mapGenerator.distanceBetweenTreesInTile * mapGenerator.treeJitter * noiseForYPos;

    const noiseForTreeType = mapGenerator.noiseGenerator.noise(tileX, tileY);
    return { globalPixelX, globalPixelY, treeType: chooseTreeType(mapGenerator, noiseForTreeType) };
}

function generateTileType(mapGenerator, height) {
    if(height < mapGenerator.waterMaxHeight)
        return objectTypes.waterTile;
    else if(height < mapGenerator.sandMaxHeight)
        return objectTypes.sandTile;
    else if(height < mapGenerator.grassMaxHeight)
        return objectTypes.grassTile;
    else
        return objectTypes.rockFloorTile;
}