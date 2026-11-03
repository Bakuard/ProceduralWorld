import {objectTypes} from "./objectTypes.js";
import './util.js';

export class GridStore {
    constructor(sizeUnitsConverter, gridContainerConfig) {
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.border = createBorder(sizeUnitsConverter, gridContainerConfig.chunkLeft, gridContainerConfig.chunkTop);
        this.chunks = [];
    }

    getChunkByPixel(pixelX, pixelY) {
        const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
        const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
        return getChunk(this, chunkX, chunkY);
    }

    shiftCenterToPixel(pixelX, pixelY) {
        const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
        const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
        return shiftCenterToChunk(this, chunkX, chunkY);
    }

    isPixelInMap(pixelX, pixelY) {
        return pixelX >= this.border.pixelLeft
            && pixelX < this.border.pixelRight
            && pixelY >= this.border.pixelTop
            && pixelY < this.border.pixelBottom;
    }

    checkDistanceToBorder(pixelX, pixelY, distanceInChunks) {
        const distanceInPixels = distanceInChunks * this.sizeUnitsConverter.chunkWidthInPixels();
        return pixelX - this.border.pixelLeft < distanceInPixels
            || this.border.pixelRight - pixelX < distanceInPixels
            || pixelY - this.border.pixelTop < distanceInPixels
            || this.border.pixelBottom - pixelY < distanceInPixels;
    }

    countByTypeInChunkRadius(objType, centerChunkX, centerChunkY, radiusInChunk) {
        let count = 0;
        for(let x = centerChunkX - radiusInChunk; x <= centerChunkX + radiusInChunk; x++) {
            for(let y = centerChunkY - radiusInChunk; y <= centerChunkY + radiusInChunk; y++) {
                count += getChunk(this, x, y)?.countByTypeInChunk(objType) ?? 0;
            }
        }
        return count;
    }

    localPixelXInGrid(pixelX) {
        return pixelX - this.border.pixelLeft;
    }

    localPixelYInGrid(pixelY) {
        return pixelY - this.border.pixelTop;
    }

    localLeftPixelOfChunkInGrid(chunkX) {
        const globalLeftPixelOfChunk = this.sizeUnitsConverter.leftPixelOfChunk(chunkX);
        return this.localPixelXInGrid(globalLeftPixelOfChunk);
    }

    localTopPixelOfChunkInGrid(chunkY) {
        const globalTopPixelOfChunk = this.sizeUnitsConverter.topPixelOfChunk(chunkY);
        return this.localPixelYInGrid(globalTopPixelOfChunk);
    }
}

function createBorder(sizeUnitsConverter, chunkLeft, chunkTop) {
    const border = {};
    border.chunkTop = chunkTop;
    border.chunkLeft = chunkLeft;
    border.chunkBottom = chunkTop + sizeUnitsConverter.worldHeightInChunk;
    border.chunkRight = chunkLeft + sizeUnitsConverter.worldWidthInChunk;
    border.pixelTop = sizeUnitsConverter.topPixelOfChunk(border.chunkTop);
    border.pixelLeft = sizeUnitsConverter.leftPixelOfChunk(border.chunkLeft);
    border.pixelBottom = sizeUnitsConverter.topPixelOfChunk(border.chunkBottom);
    border.pixelRight = sizeUnitsConverter.leftPixelOfChunk(border.chunkRight);
    return border;
}

function getChunk(grid, chunkX, chunkY) {
    if(!isChunkInMap(grid, chunkX, chunkY)) return null;

    const localChunkX = chunkX - grid.border.chunkLeft;
    const localChunkY = chunkY - grid.border.chunkTop;
    return grid.chunks[localChunkX + localChunkY * grid.sizeUnitsConverter.worldWidthInChunk];
}

function shiftCenterToChunk(grid, chunkX, chunkY) {
    const newChunkLeft = chunkX - Math.floor(grid.sizeUnitsConverter.worldWidthInChunk / 2);
    const newChunkTop = chunkY - Math.floor(grid.sizeUnitsConverter.worldHeightInChunk / 2);

    const allChunks = [], createdChunks = [], removedChunks = [], retainedChunks = [];

    for(let y = 0; y < grid.sizeUnitsConverter.worldHeightInChunk; y++) {
        for(let x = 0; x < grid.sizeUnitsConverter.worldWidthInChunk; x++) {
            let chunk = getChunk(grid, x + newChunkLeft, y + newChunkTop);
            if(!chunk) {
                chunk = new Chunk(grid.sizeUnitsConverter, x + newChunkLeft, y + newChunkTop);
                createdChunks.push(chunk);
            } else {
                retainedChunks.push(chunk);
            }
            allChunks.push(chunk);
        }
    }

    const oldBorder = grid.border;
    grid.border = createBorder(grid.sizeUnitsConverter, newChunkLeft, newChunkTop);

    for(const chunk of grid.chunks)
        if(!isChunkInMap(grid, chunk.chunkX, chunk.chunkY))
            removedChunks.push(chunk);

    grid.chunks = allChunks;

    return { newBorder: grid.border, oldBorder: oldBorder, createdChunks: createdChunks, removedChunks: removedChunks, retainedChunks: retainedChunks };
}

function isChunkInMap(grid, chunkX, chunkY) {
    return chunkY >= grid.border.chunkTop
        && chunkY < grid.border.chunkBottom
        && chunkX >= grid.border.chunkLeft
        && chunkX < grid.border.chunkRight;
}


export class Chunk {
    constructor(sizeUnitsConverter, chunkLeft, chunkTop) {
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.chunkY = chunkTop;
        this.chunkX = chunkLeft;
        this.pixelTop = sizeUnitsConverter.topPixelOfChunk(chunkTop);
        this.pixelLeft = sizeUnitsConverter.leftPixelOfChunk(chunkLeft);
        this.pixelBottom = sizeUnitsConverter.bottomPixelOfChunk(chunkTop);
        this.pixelRight = sizeUnitsConverter.rightPixelOfChunk(chunkLeft);
        this.objectsByType = {};
        this.tiles = [];
    }

    addToChunk(obj, objType) {
        this.objectsByType[objType] ??= [];
        this.objectsByType[objType].push(obj);
    }

    removeFromChunk(obj, objType) {
        this.objectsByType[objType]?.remove(obj);
    }

    countByTypeInChunk(objType) {
        return this.objectsByType[objType]?.length ?? 0;
    }

    getTileContainerByLocalCoords(localTileX, localTileY) {
        const index = localTileX + localTileY * this.sizeUnitsConverter.chunkAreaInTiles();
        this.tiles[index] ??= {};
        return this.tiles[index];
    }

    forEachTileContainer(callback) {
        this.forEachTileCoords((globalTileX, globalTileY, localTileX, localTileY) => {
            const tileContainer = this.getTileContainerByLocalCoords(localTileX, localTileY);
            callback(globalTileX, globalTileY, localTileX, localTileY, tileContainer);
        });
    }

    forEachTileCoords(callback) {
        const tileLeft = this.sizeUnitsConverter.leftTileOfChunk(this.chunkX);
        const tileTop = this.sizeUnitsConverter.topTileOfChunk(this.chunkY);
        for(let y = 0; y < this.sizeUnitsConverter.chunkSizeInTile; y++)
            for (let x = 0; x < this.sizeUnitsConverter.chunkSizeInTile; x++)
                callback(tileLeft + x, tileTop + y, x, y);
    }

    forEachObj(callback) {
        for(const objType of Object.values(objectTypes))
            forEachObjOfChunkWithType(this, objType, callback);
    }
}

function forEachObjOfChunkWithType(chunk, objType, callback) {
    const objects = chunk.objectsByType[objType] ??= [];
    for(let i = objects.length - 1; i >= 0; --i) callback(objects[i], objType);
}