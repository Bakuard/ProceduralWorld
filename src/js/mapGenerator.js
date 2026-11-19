import {objectTypes} from "./objectTypes.js";

export class MapGenerator {
    constructor(sizeUnitsConverter, noiseGenerator, mapGeneratorConfig) {
        this.octaves = mapGeneratorConfig.octaves;
        this.persistence = mapGeneratorConfig.persistence;
        this.frequency = mapGeneratorConfig.frequency;
        this.frequencyMod = mapGeneratorConfig.frequencyMod;
        this.distanceBetweenTreesInTile = mapGeneratorConfig.distanceBetweenTreesInTile;
        this.treeJitter = mapGeneratorConfig.treeJitter;
        this.waterMaxHeight = mapGeneratorConfig.terrainHeights.waterMax;
        this.sandMaxHeight = mapGeneratorConfig.terrainHeights.sandMax;
        this.grassMaxHeight = mapGeneratorConfig.terrainHeights.grassMax;
        this.treeMinHeight = mapGeneratorConfig.trees.minHeight;
        this.treeMaxHeight = mapGeneratorConfig.trees.maxHeight;
        this.littleOakMaxNoise = mapGeneratorConfig.trees.littleOakMaxNoise;
        this.bigOakMaxNoise = mapGeneratorConfig.trees.bigOakMaxNoise;
        this.heightOakMaxNoise = mapGeneratorConfig.trees.heightOakMaxNoise;
        this.deadLittleOakMaxNoise = mapGeneratorConfig.trees.deadLittleOakMaxNoise;
        this.deadBigOakMaxNoise = mapGeneratorConfig.trees.deadBigOakMaxNoise;
        this.dungeonsCellSizeInChunk = mapGeneratorConfig.dungeons.cellSizeInChunk;
        this.dungeonsAttemptNumber = mapGeneratorConfig.dungeons.attemptNumber;
        this.dungeonsMinHeight = mapGeneratorConfig.dungeons.minHeight;
        this.dungeonsMaxHeight = mapGeneratorConfig.dungeons.maxHeight;
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.noiseGenerator = noiseGenerator;
    }

    generateChunk(chunkX, chunkY, outputContainer) {
        outputContainer ??= {};
        outputContainer.tiles ??= [];
        outputContainer.trees ??= [];
        outputContainer.tiles.length = 0;
        outputContainer.trees.length = 0;

        const tileLeft = this.sizeUnitsConverter.leftTileOfChunk(chunkX);
        const tileTop = this.sizeUnitsConverter.topTileOfChunk(chunkY);
        const chunkSizeInTile = this.sizeUnitsConverter.chunkSizeInTile;

        for(let localTileY = 0; localTileY < chunkSizeInTile; localTileY++) {
            for(let localTileX = 0; localTileX < chunkSizeInTile; localTileX++) {
                const globalTileX = tileLeft + localTileX;
                const globalTileY = tileTop + localTileY;
                const height = generateHeight(this, globalTileX, globalTileY);
                const tileType = generateTileType(this, height);
                const treeMeta = generateTree(this, globalTileX, globalTileY, height);

                outputContainer.tiles.push({ tileType, globalTileX, globalTileY, localTileX, localTileY });

                if(treeMeta) outputContainer.trees.push(treeMeta);
            }
        }
        outputContainer.dungeonEntrance = generateDungeonEntrance(this, chunkX, chunkY);

        return outputContainer;
    }

    findNearestTileWithType(startTileX, startTileY, maxSteps, step, tileType) {
        return findNearest(
            startTileX,
            startTileY,
            maxSteps,
            step,
            (tileX, tileY) => generateTileType(this, generateHeight(this, tileX, tileY)) === tileType ? { tileX, tileY } : null
        );
    }

    findNearestDungeonWithType(startChunkX, startChunkY, maxRadiusInCells, dungeonType) {
        const startCellX = Math.floor(startChunkX / this.dungeonsCellSizeInChunk);
        const startCellY = Math.floor(startChunkY / this.dungeonsCellSizeInChunk);

        return findNearest(
            startCellX,
            startCellY,
            maxRadiusInCells,
            1,
            (cellX, cellY) => {
                const { candidateChunkX, candidateChunkY } = chooseDungeonChunkCandidate(this, cellX, cellY);
                const dungeonEntrance = generateDungeonEntranceInChunk(this, cellX, cellY, candidateChunkX, candidateChunkY);
                return dungeonEntrance?.dungeonType === dungeonType ? dungeonEntrance : null;
            }
        );
    }
}

function generateHeight(mapGenerator, tileX, tileY) {
    return mapGenerator.noiseGenerator.multipleOctavesNoise(tileX, tileY, mapGenerator.octaves, mapGenerator.persistence, mapGenerator.frequency, mapGenerator.frequencyMod);
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

function chooseDungeonChunkCandidate(mapGenerator, cellX, cellY) {
    const leftChunk = mapGenerator.dungeonsCellSizeInChunk * cellX;
    const topChunk = mapGenerator.dungeonsCellSizeInChunk * cellY;
    const noiseX = mapGenerator.noiseGenerator.noise(cellX, cellY);
    const noiseY = mapGenerator.noiseGenerator.noise(cellX, cellY, 1);
    const candidateChunkX = mapNormalizedToInteger(noiseX, leftChunk, leftChunk + mapGenerator.dungeonsCellSizeInChunk);
    const candidateChunkY = mapNormalizedToInteger(noiseY, topChunk, topChunk + mapGenerator.dungeonsCellSizeInChunk);
    return { candidateChunkX, candidateChunkY };
}

function generateDungeonEntrance(mapGenerator, chunkX, chunkY) {
    const cellX = Math.floor(chunkX / mapGenerator.dungeonsCellSizeInChunk);
    const cellY = Math.floor(chunkY / mapGenerator.dungeonsCellSizeInChunk);
    const { candidateChunkX, candidateChunkY } = chooseDungeonChunkCandidate(mapGenerator, cellX, cellY);

    if(candidateChunkX !== chunkX || candidateChunkY !== chunkY) return null;

    return generateDungeonEntranceInChunk(mapGenerator, cellX, cellY, candidateChunkX, candidateChunkY);
}

function generateDungeonEntranceInChunk(mapGenerator, cellX, cellY, candidateChunkX, candidateChunkY) {
    const leftTile = mapGenerator.sizeUnitsConverter.leftTileOfChunk(candidateChunkX);
    const topTile = mapGenerator.sizeUnitsConverter.topTileOfChunk(candidateChunkY);

    for(let i = 0; i < mapGenerator.dungeonsAttemptNumber; ++i) {
        const noiseX = mapGenerator.noiseGenerator.noise(cellX, cellY, 2 + i * 2);
        const noiseY = mapGenerator.noiseGenerator.noise(cellX, cellY, 3 + i * 2);
        const candidateTileX = mapNormalizedToInteger(noiseX, leftTile, leftTile + mapGenerator.sizeUnitsConverter.chunkSizeInTile);
        const candidateTileY = mapNormalizedToInteger(noiseY, topTile, topTile + mapGenerator.sizeUnitsConverter.chunkSizeInTile);

        const height = generateHeight(mapGenerator, candidateTileX, candidateTileY);
        if(height >= mapGenerator.dungeonsMinHeight && height <= mapGenerator.dungeonsMaxHeight) {
            const globalPixelX = mapGenerator.sizeUnitsConverter.centerPixelXOfTile(candidateTileX);
            const globalPixelY = mapGenerator.sizeUnitsConverter.centerPixelYOfTile(candidateTileY);
            return { globalPixelX, globalPixelY, dungeonType: objectTypes.tomb };
        }
    }

    return null;
}


function mapNormalizedToInteger(normalized, min, max) {
    return Math.floor(normalized * (max - min)) + min;
}

function findNearest(startUnitX, startUnitY, maxSteps, step, mapper) {
    let result = mapper(startUnitX, startUnitY);
    if(result != null) return result;

    const directions = [
        { dx: step, dy: step },
        { dx: step, dy: -step },
        { dx: -step, dy: -step },
        { dx: -step, dy: step }
    ];

    for(let radius = 1; radius <= maxSteps; radius++) {
        let x = startUnitX - radius * step;
        let y = startUnitY;

        for (const { dx, dy } of directions) {
            for (let i = 0; i < radius; i++) {
                result = mapper(x, y);
                if(result != null) return result;
                x += dx;
                y += dy;
            }
        }
    }

    return null;
}