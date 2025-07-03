export function SizeUnitsConverter(tileWidth, tileHeight, chunkSizeInTile, worldWidthInChunk, worldHeightInChunk) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.chunkSizeInTile = chunkSizeInTile;
    this.worldWidthInChunk = worldWidthInChunk;
    this.worldHeightInChunk = worldHeightInChunk;
};

SizeUnitsConverter.prototype.worldWidthInPixels = function() {
    return this.chunkWidthInPixels() * this.worldWidthInChunk;
};

SizeUnitsConverter.prototype.worldHeightInPixels = function() {
    return this.chunkHeightInPixels() * this.worldHeightInChunk;
};

SizeUnitsConverter.prototype.chunkWidthInPixels = function() {
    return this.chunkSizeInTile * this.tileWidth;
};

SizeUnitsConverter.prototype.chunkHeightInPixels = function() {
    return this.chunkSizeInTile * this.tileHeight;
};

SizeUnitsConverter.prototype.chunkXFromPixelX = function(pixelX) {
    return Math.floor(pixelX / this.chunkWidthInPixels());
};

SizeUnitsConverter.prototype.chunkYFromPixelY = function(pixelY) {
    return Math.floor(pixelY / this.chunkHeightInPixels());
};

SizeUnitsConverter.prototype.chunkAreaInTiles = function() {
    return this.chunkSizeInTile * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.worldAreaInChunks = function() {
    return this.worldWidthInChunk * this.worldHeightInChunk;
};

SizeUnitsConverter.prototype.tileXFromPixelX = function(pixelX) {
    return Math.floor(pixelX / this.tileWidth);
};

SizeUnitsConverter.prototype.tileYFromPixelY = function(pixelY) {
    return Math.floor(pixelY / this.tileHeight);
};

SizeUnitsConverter.prototype.leftTileOfChunk = function(chunkX) {
    return chunkX * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.topTileOfChunk = function(chunkY) {
    return chunkY * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.leftPixelOfChunk = function(chunkX) {
    return chunkX * this.chunkWidthInPixels();
};

SizeUnitsConverter.prototype.topPixelOfChunk = function(chunkY) {
    return chunkY * this.chunkHeightInPixels();
};

SizeUnitsConverter.prototype.leftPixelOfTile = function(tileX) {
    return tileX * this.tileWidth;
};

SizeUnitsConverter.prototype.topPixelOfTile = function(tileY) {
    return tileY * this.tileHeight;
};

SizeUnitsConverter.prototype.centerPixelXOfTile = function(tileX) {
    return tileX * this.tileWidth + this.tileWidth / 2;
};

SizeUnitsConverter.prototype.centerPixelYOfTile = function(tileY) {
    return tileY * this.tileHeight + this.tileHeight / 2;
};