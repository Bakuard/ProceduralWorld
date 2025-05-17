export const sizeUnitsConverter = {
    tileWidth: 60,
    tileHeight: 60,
    chunkSizePerTile: 5,
    worldWidthPerChunk: 3,
    worldHeightPerChunk: 3,
    getWorldWidthPerPixel() {
        return this.getChunkWidthPerPixel() * this.worldWidthPerChunk;
    },
    getWorldHeightPerPixel() {
        return this.getChunkHeightPerPixel() * this.worldHeightPerChunk;
    },
    getChunkWidthPerPixel() {
        return this.chunkSizePerTile * this.tileWidth;
    },
    getChunkHeightPerPixel() {
        return this.chunkSizePerTile * this.tileHeight;
    },
    getXPerChunkFromPixel(xPerPixel) {
        return Math.floor(xPerPixel / this.getChunkWidthPerPixel());
    },
    getYPerChunkFromPixel(yPerPixel) {
        return Math.floor(yPerPixel / this.getChunkHeightPerPixel());
    },
    getXPerTileFromPixel(xPerPixel) {
        return Math.floor(xPerPixel / this.tileWidth);
    },
    getYPerTileFromPixel(yPerPixel) {
        return Math.floor(yPerPixel / this.tileHeight);
    },
    getXPerTileFromChunk(xPerChunk) {
        return xPerChunk * this.chunkSizePerTile;
    },
    getYPerTileFromChunk(yPerChunk) {
        return yPerChunk * this.chunkSizePerTile;
    },
    getXPerPixelFromChunk(xPerChunk) {
        return xPerChunk * this.getChunkWidthPerPixel();
    },
    getYPerPixelFromChunk(yPerChunk) {
        return yPerChunk * this.getChunkHeightPerPixel();
    },
    getXPerPixelFromTile(xPerTile) {
        return xPerTile * this.tileWidth;
    },
    getYPerPixelFromTile(yPerTile) {
        return yPerTile * this.tileHeight;
    },
    doesTileContainPixel(xPerTile, yPerTile, xPerPixel, yPerPixel) {
        return this.getXPerTileFromPixel(xPerPixel) === xPerTile && this.getYPerTileFromPixel(yPerPixel) === yPerTile;
    }
};