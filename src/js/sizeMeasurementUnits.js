export const sizeUnitsConverter = {
    tileWidth: 60,
    tileHeight: 60,
    chunkSizePerTile: 5,
    worldWidthPerChunk: 7,
    worldHeightPerChunk: 5,
    getWorldWidthPerTile() {
        return this.worldWidthPerChunk * this.chunkSizePerTile;
    },
    getWorldHeightPerTile() {
        return this.worldHeightPerChunk * this.chunkSizePerTile;
    },
    getChunkWidthPerPixel() {
        return this.chunkSizePerTile * this.tileWidth;
    },
    getChunkHeightPerPixel() {
        return this.chunkSizePerTile * this.tileHeight;
    },
    getWorldWidthPerPixel() {
        return this.getChunkWidthPerPixel() * this.worldWidthPerChunk;
    },
    getWorldHeightPerPixel() {
        return this.getChunkHeightPerPixel() * this.worldHeightPerChunk;
    },
    getXPerChunk(xPerPixel) {
        return Math.floor(xPerPixel / this.getChunkWidthPerPixel());
    },
    getYPerChunk(yPerPixel) {
        return Math.floor(yPerPixel / this.getChunkHeightPerPixel());
    },
    getXPerTile(xPerPixel) {
        return Math.floor(xPerPixel / this.tileWidth);
    },
    getYPerTile(yPerPixel) {
        return Math.floor(yPerPixel / this.tileHeight);
    },
    getXPerTileFromChunk(xPerChunk) {
        return xPerChunk * this.chunkSizePerTile;
    },
    getYPerTileFromChunk(yPerChunk) {
        return yPerChunk * this.chunkSizePerTile;
    },
    getXPerPixel(xPerChunk) {
        return xPerChunk * this.getChunkWidthPerPixel();
    },
    getYPerPixel(yPerChunk) {
        return yPerChunk * this.getChunkHeightPerPixel();
    },
    getXPerPixelFromTile(xPerTile) {
        return xPerTile * this.tileWidth;
    },
    getYPerPixelFromTile(yPerTile) {
        return yPerTile * this.tileHeight;
    },
    getDistanceXPerChunk(distanceXPerPixel) {
        return Math.floor(distanceXPerPixel / this.getChunkWidthPerPixel());
    },
    getDistanceYPerChunk(distanceYPerPixel) {
        return Math.floor(distanceYPerPixel / this.getChunkHeightPerPixel());
    },
    doesTileContainPixel(xPerTile, yPerTile, xPerPixel, yPerPixel) {
        return this.getXPerTile(xPerPixel) === xPerTile && this.getYPerTile(yPerPixel) === yPerTile;
    }
};