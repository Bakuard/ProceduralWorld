import {objectTypes} from "./objectTypes.js";
import './util.js';

export function GridContainer(sizeUnitsConverter, chunkLeft, chunkTop) {
    this.sizeUnitsConverter = sizeUnitsConverter;
    this.border = createBorder(sizeUnitsConverter, chunkLeft, chunkTop);
    this.chunks = [];
};

GridContainer.prototype.getChunkByPixel = function(pixelX, pixelY) {
    const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
    const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
    return getChunk(this, chunkX, chunkY);
};

GridContainer.prototype.shiftCenterToPixel = function(pixelX, pixelY) {
    const chunkX = this.sizeUnitsConverter.chunkXFromPixelX(pixelX);
    const chunkY = this.sizeUnitsConverter.chunkYFromPixelY(pixelY)
    return shiftCenterToChunk(this, chunkX, chunkY);
};

GridContainer.prototype.isChunkInMap = function(chunkX, chunkY) {
    return chunkY >= this.border.chunkTop
        && chunkY < this.border.chunkBottom
        && chunkX >= this.border.chunkLeft
        && chunkX < this.border.chunkRight;
};

GridContainer.prototype.isPixelInMap = function(pixelX, pixelY) {
    return pixelX >= this.border.pixelLeft
        && pixelX < this.border.pixelRight
        && pixelY >= this.border.pixelTop
        && pixelY < this.border.pixelBottom;
};

GridContainer.prototype.checkDistanceToBorder = function(pixelX, pixelY, allowedDistanceInPixels) {
    return pixelX - this.border.pixelLeft < allowedDistanceInPixels
        || this.border.pixelRight - pixelX < allowedDistanceInPixels
        || pixelY - this.border.pixelTop < allowedDistanceInPixels
        || this.border.pixelBottom - pixelY < allowedDistanceInPixels;
};

GridContainer.prototype.forEachObjWithType = function(objType, callback) {
    for(const chunk of this.chunks)
        forEachObjOfChunkWithType(chunk, objType, callback);
};

GridContainer.prototype.fillArrayWithType = function(objType, array) {
    this.forEachObjWithType(objType, obj => array.push(obj));
    return array;
};

GridContainer.prototype.getAllObjectsGroupedByType = function() {
    const result = {};
    for(const objType of Object.values(objectTypes))
        result[objType] = this.fillArrayWithType(objType, []);
    return result;
};

GridContainer.prototype.forEachObjectInArea = function(objType, pixelLeft, pixelTop, pixelRight, pixelBottom, callback) {
    const filter = obj => obj.x >= pixelLeft && obj.x <= pixelRight && obj.y >= pixelTop && obj.y <= pixelBottom && callback(obj);

    const chunkLeft = this.sizeUnitsConverter.chunkXFromPixelX(pixelLeft);
    const chunkRight = this.sizeUnitsConverter.chunkXFromPixelX(pixelRight);
    const chunkTop = this.sizeUnitsConverter.chunkYFromPixelY(pixelTop);
    const chunkBottom = this.sizeUnitsConverter.chunkYFromPixelY(pixelBottom);
    for(let y = chunkTop; y < chunkBottom; y++)
        for(let x = chunkLeft; x < chunkRight; x++) {
            const chunk = getChunk(this, x, y);
            if(chunk) forEachObjOfChunkWithType(chunk, objType, filter);
        }
};

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
};

function getChunk(grid, chunkX, chunkY) {
    if(!grid.isChunkInMap(chunkX, chunkY)) return null;

    const localChunkX = chunkX - grid.border.chunkLeft;
    const localChunkY = chunkY - grid.border.chunkTop;
    return grid.chunks[localChunkX + localChunkY * grid.sizeUnitsConverter.worldWidthInChunk];
};

function shiftCenterToChunk(grid, chunkX, chunkY) {
    const newChunkLeft = chunkX - Math.floor(grid.sizeUnitsConverter.worldWidthInChunk / 2);
    const newChunkTop = chunkY - Math.floor(grid.sizeUnitsConverter.worldHeightInChunk / 2);

    const newChunks = [], createdChunks = [], destroyedChunks = [];

    for(let y = 0; y < grid.sizeUnitsConverter.worldHeightInChunk; y++) {
        for(let x = 0; x < grid.sizeUnitsConverter.worldWidthInChunk; x++) {
            let chunk = getChunk(grid, x + newChunkLeft, y + newChunkTop);
            if(!chunk) {
                chunk = new Chunk(grid.sizeUnitsConverter, x + newChunkLeft, y + newChunkTop);
                createdChunks.push(chunk);
            }
            newChunks.push(chunk);
        }
    }

    const oldBorder = grid.border;
    grid.border = createBorder(grid.sizeUnitsConverter, newChunkLeft, newChunkTop);

    for(const chunk of grid.chunks)
        if(!grid.isChunkInMap(chunk.chunkX, chunk.chunkY))
            destroyedChunks.push(chunk);

    grid.chunks = newChunks;

    return { newBorder: grid.border, oldBorder: oldBorder, createdChunks: createdChunks, destroyedChunks: destroyedChunks };
};


function Chunk(sizeUnitsConverter, chunkLeft, chunkTop) {
    this.sizeUnitsConverter = sizeUnitsConverter;
    this.chunkY = chunkTop;
    this.chunkX = chunkLeft;
    this.pixelTop = sizeUnitsConverter.topPixelOfChunk(chunkTop);
    this.pixelLeft = sizeUnitsConverter.leftPixelOfChunk(chunkLeft);
    this.pixelBottom = sizeUnitsConverter.topPixelOfChunk(chunkTop) + sizeUnitsConverter.chunkHeightInPixels();
    this.pixelRight = sizeUnitsConverter.leftPixelOfChunk(chunkLeft) + sizeUnitsConverter.chunkWidthInPixels();
    this.objectsByType = {};
};

Chunk.prototype.addToChunk = function(obj, objType) {
    this.objectsByType[objType] ??= [];
    this.objectsByType[objType].push(obj);
};

Chunk.prototype.removeFromChunk = function(obj, objType) {
    this.objectsByType[objType]?.remove(obj);
};

Chunk.prototype.countByTypeInChunk = function(objType) {
    return this.objectsByType[objType]?.length ?? 0;
};

Chunk.prototype.forEachTile = function(callback) {
    const tileLeft = this.sizeUnitsConverter.leftTileOfChunk(this.chunkX);
    const tileTop = this.sizeUnitsConverter.topTileOfChunk(this.chunkY);
    for(let y = 0; y < this.sizeUnitsConverter.chunkSizeInTile; y++)
        for (let x = 0; x < this.sizeUnitsConverter.chunkSizeInTile; x++)
            callback(tileLeft + x, tileTop + y);
};

Chunk.prototype.forEachObj = function(callback) {
    for(const objType of Object.values(objectTypes))
        forEachObjOfChunkWithType(this, objType, callback);
};

function forEachObjOfChunkWithType(chunk, objType, callback) {
    const objects = chunk.objectsByType[objType] ??= [];
    for(let i = objects.length - 1; i >= 0; --i) callback(objects[i]);
};
