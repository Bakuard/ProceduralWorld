import './util.js';

export class GridStore {
    constructor(sizeUnitsConverter, chunkLeft = 0, chunkTop = 0) {
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.border = createBorder(sizeUnitsConverter, chunkLeft, chunkTop);
        this.chunks = [];
        shiftLeftTopToChunk(this, chunkLeft, chunkTop);
    }

    getChunkByPixel(pixelX, pixelY) {
        const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
        const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
        return getChunk(this, chunkX, chunkY);
    }

    shiftCenterToPixel(pixelX, pixelY) {
        const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
        const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
        const chunkLeft = chunkX - Math.floor(this.sizeUnitsConverter.worldWidthInChunk / 2);
        const chunkTop = chunkY - Math.floor(this.sizeUnitsConverter.worldHeightInChunk / 2);
        return shiftLeftTopToChunk(this, chunkLeft, chunkTop);
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

    forEachChunkInChunkRadius(centerChunkX, centerChunkY, radiusInChunk, callback) {
        for(let x = centerChunkX - radiusInChunk; x <= centerChunkX + radiusInChunk; x++) {
            for(let y = centerChunkY - radiusInChunk; y <= centerChunkY + radiusInChunk; y++) {
                const chunk = getChunk(this, x, y);
                if(chunk) callback(chunk);
            }
        }
    }

    localPixelXFromGlobalPixelX(pixelX) {
        return pixelX - this.border.pixelLeft;
    }

    localPixelYFromGlobalPixelY(pixelY) {
        return pixelY - this.border.pixelTop;
    }

    localLeftPixelOfChunkInGridFromGlobalChunkX(chunkX) {
        const globalLeftPixelOfChunk = this.sizeUnitsConverter.leftPixelOfChunk(chunkX);
        return this.localPixelXFromGlobalPixelX(globalLeftPixelOfChunk);
    }

    localTopPixelOfChunkInGridFromGlobalChunkY(chunkY) {
        const globalTopPixelOfChunk = this.sizeUnitsConverter.topPixelOfChunk(chunkY);
        return this.localPixelYFromGlobalPixelY(globalTopPixelOfChunk);
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

function shiftLeftTopToChunk(grid, newChunkLeft, newChunkTop) {
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
    constructor(sizeUnitsConverter, chunkX, chunkY) {
        this.sizeUnitsConverter = sizeUnitsConverter;
        this.chunkY = chunkY;
        this.chunkX = chunkX;
        this.pixelTop = sizeUnitsConverter.topPixelOfChunk(chunkY);
        this.pixelLeft = sizeUnitsConverter.leftPixelOfChunk(chunkX);
        this.pixelBottom = sizeUnitsConverter.bottomPixelOfChunk(chunkY);
        this.pixelRight = sizeUnitsConverter.rightPixelOfChunk(chunkX);
        this.objectsByType = {};
        this.tiles = [];
    }

    addObj(obj, objType) {
        this.objectsByType[objType] ??= [];
        this.objectsByType[objType].push(obj);
    }

    removeObj(obj, objType) {
        this.objectsByType[objType]?.remove(obj);
    }

    countObjsByTypeInChunk(objType) {
        return this.objectsByType[objType]?.length ?? 0;
    }

    forEachObj(callback) {
        for(const objType of Object.keys(this.objectsByType))
            this.forEachObjWithType(objType, callback);
    }

    forEachObjWithType(objType, callback) {
        const objects = this.objectsByType[objType] ??= [];
        for(let i = objects.length - 1; i >= 0; --i) callback(objects[i], objType);
    }


    getTile(localTileX, localTileY, layerName) {
        const index = getTileContainerIndex(this, localTileX, localTileY);
        return this.tiles[index]?.[layerName];
    }

    setTile(localTileX, localTileY, layerName, tile) {
        const index = getTileContainerIndex(this, localTileX, localTileY);
        this.tiles[index] ??= {};
        this.tiles[index][layerName] = tile;
    }

    forEachTile(callback) {
        this.forEachTileCoords((globalTileX, globalTileY, localTileX, localTileY) => {
            const index = getTileContainerIndex(this, localTileX, localTileY);
            const tileContainer = this.tiles[index];
            for (const layerName of Object.keys(tileContainer ?? {}))
                callback(globalTileX, globalTileY, localTileX, localTileY, layerName, tileContainer[layerName]);
        });
    }

    forEachTileCoords(callback) {
        const tileLeft = this.sizeUnitsConverter.leftTileOfChunk(this.chunkX);
        const tileTop = this.sizeUnitsConverter.topTileOfChunk(this.chunkY);
        for(let y = 0; y < this.sizeUnitsConverter.chunkSizeInTile; y++)
            for (let x = 0; x < this.sizeUnitsConverter.chunkSizeInTile; x++)
                callback(tileLeft + x, tileTop + y, x, y);
    }
}

function getTileContainerIndex(chunk, localTileX, localTileY) {
    return localTileX + localTileY * chunk.sizeUnitsConverter.chunkSizeInTile;
}