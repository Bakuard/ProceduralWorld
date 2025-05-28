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

SizeUnitsConverter.prototype.chunkXFromPixelX = function(xPerPixel) {
    return Math.floor(xPerPixel / this.chunkWidthInPixels());
};

SizeUnitsConverter.prototype.chunkYFromPixelY = function(yPerPixel) {
    return Math.floor(yPerPixel / this.chunkHeightInPixels());
};

SizeUnitsConverter.prototype.chunkAreaInTiles = function() {
    return this.chunkSizeInTile * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.tileXFromPixelX = function(xPerPixel) {
    return Math.floor(xPerPixel / this.tileWidth);
};

SizeUnitsConverter.prototype.tileYFromPixelY = function(yPerPixel) {
    return Math.floor(yPerPixel / this.tileHeight);
};

SizeUnitsConverter.prototype.tileXFromChunkX = function(xPerChunk) {
    return xPerChunk * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.tileYFromChunkY = function(yPerChunk) {
    return yPerChunk * this.chunkSizeInTile;
};

SizeUnitsConverter.prototype.pixelXFromChunkX = function(xPerChunk) {
    return xPerChunk * this.chunkWidthInPixels();
};

SizeUnitsConverter.prototype.pixelYFromChunkY = function(yPerChunk) {
    return yPerChunk * this.chunkHeightInPixels();
};

SizeUnitsConverter.prototype.pixelXFromTileX = function(xPerTile) {
    return xPerTile * this.tileWidth;
};

SizeUnitsConverter.prototype.pixelYFromTileY = function(yPerTile) {
    return yPerTile * this.tileHeight;
};

SizeUnitsConverter.prototype.doesTileContainPixel = function(xPerTile, yPerTile, xPerPixel, yPerPixel) {
    return this.tileXFromPixelX(xPerPixel) === xPerTile && this.tileYFromPixelY(yPerPixel) === yPerTile;
};