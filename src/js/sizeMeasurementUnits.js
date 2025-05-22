export function SizeUnitsConverter(tileWidth, tileHeight, chunkSizePerTile, worldWidthPerChunk, worldHeightPerChunk) {
    this.tileWidth = tileWidth;
    this.tileHeight = tileHeight;
    this.chunkSizePerTile = chunkSizePerTile;
    this.worldWidthPerChunk = worldWidthPerChunk;
    this.worldHeightPerChunk = worldHeightPerChunk;
};

SizeUnitsConverter.prototype.getWorldWidthPerPixel = function() {
    return this.getChunkWidthPerPixel() * this.worldWidthPerChunk;
};

SizeUnitsConverter.prototype.getWorldHeightPerPixel = function() {
    return this.getChunkHeightPerPixel() * this.worldHeightPerChunk;
};

SizeUnitsConverter.prototype.getChunkWidthPerPixel = function() {
    return this.chunkSizePerTile * this.tileWidth;
};

SizeUnitsConverter.prototype.getChunkHeightPerPixel = function() {
    return this.chunkSizePerTile * this.tileHeight;
};

SizeUnitsConverter.prototype.getXPerChunkFromPixel = function(xPerPixel) {
    return Math.floor(xPerPixel / this.getChunkWidthPerPixel());
};

SizeUnitsConverter.prototype.getYPerChunkFromPixel = function(yPerPixel) {
    return Math.floor(yPerPixel / this.getChunkHeightPerPixel());
};

SizeUnitsConverter.prototype.getXPerTileFromPixel = function(xPerPixel) {
    return Math.floor(xPerPixel / this.tileWidth);
};

SizeUnitsConverter.prototype.getYPerTileFromPixel = function(yPerPixel) {
    return Math.floor(yPerPixel / this.tileHeight);
};

SizeUnitsConverter.prototype.getXPerTileFromChunk = function(xPerChunk) {
    return xPerChunk * this.chunkSizePerTile;
};

SizeUnitsConverter.prototype.getYPerTileFromChunk = function(yPerChunk) {
    return yPerChunk * this.chunkSizePerTile;
};

SizeUnitsConverter.prototype.getXPerPixelFromChunk = function(xPerChunk) {
    return xPerChunk * this.getChunkWidthPerPixel();
};

SizeUnitsConverter.prototype.getYPerPixelFromChunk = function(yPerChunk) {
    return yPerChunk * this.getChunkHeightPerPixel();
};

SizeUnitsConverter.prototype.getXPerPixelFromTile = function(xPerTile) {
    return xPerTile * this.tileWidth;
};

SizeUnitsConverter.prototype.getYPerPixelFromTile = function(yPerTile) {
    return yPerTile * this.tileHeight;
};

SizeUnitsConverter.prototype.doesTileContainPixel = function(xPerTile, yPerTile, xPerPixel, yPerPixel) {
    return this.getXPerTileFromPixel(xPerPixel) === xPerTile && this.getYPerTileFromPixel(yPerPixel) === yPerTile;
};