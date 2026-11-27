export class SizeUnitsConverter {
    constructor(sizeUnitsConverterConfig) {
        this.tileWidth = sizeUnitsConverterConfig.tileWidth;
        this.tileHeight = sizeUnitsConverterConfig.tileHeight;
        this.chunkSizeInTile = sizeUnitsConverterConfig.chunkSizeInTile;
        this.worldWidthInChunk = sizeUnitsConverterConfig.worldWidthInChunk;
        this.worldHeightInChunk = sizeUnitsConverterConfig.worldHeightInChunk;
    }

    worldWidthInPixels() {
        return this.chunkWidthInPixels() * this.worldWidthInChunk;
    }

    worldHeightInPixels() {
        return this.chunkHeightInPixels() * this.worldHeightInChunk;
    }

    chunkWidthInPixels() {
        return this.chunkSizeInTile * this.tileWidth;
    }

    chunkHeightInPixels() {
        return this.chunkSizeInTile * this.tileHeight;
    }

    tileWidthInPixels() {
        return this.tileWidth;
    }

    tileHeightInPixels() {
        return this.tileHeight;
    }


    chunkAreaInTiles() {
        return this.chunkSizeInTile * this.chunkSizeInTile;
    }

    worldAreaInChunks() {
        return this.worldWidthInChunk * this.worldHeightInChunk;
    }


    chunkXFromTileX(tileX) {
        return Math.floor(tileX / this.chunkSizeInTile);
    }

    chunkYFromTileY(tileY) {
        return Math.floor(tileY / this.chunkSizeInTile);
    }

    chunkXFromPixelX(pixelX) {
        return Math.floor(pixelX / this.chunkWidthInPixels());
    }

    chunkYFromPixelY(pixelY) {
        return Math.floor(pixelY / this.chunkHeightInPixels());
    }

    tileXFromPixelX(pixelX) {
        return Math.floor(pixelX / this.tileWidth);
    }

    tileYFromPixelY(pixelY) {
        return Math.floor(pixelY / this.tileHeight);
    }


    leftTileOfChunk(chunkX) {
        return chunkX * this.chunkSizeInTile;
    }

    topTileOfChunk(chunkY) {
        return chunkY * this.chunkSizeInTile;
    }

    leftPixelOfChunk(chunkX) {
        return chunkX * this.chunkWidthInPixels();
    }

    topPixelOfChunk(chunkY) {
        return chunkY * this.chunkHeightInPixels();
    }

    rightPixelOfChunk(chunkX) {
        return this.leftPixelOfChunk(chunkX) + this.chunkWidthInPixels();
    }

    bottomPixelOfChunk(chunkY) {
        return this.topPixelOfChunk(chunkY) + this.chunkHeightInPixels();
    }

    leftPixelOfTile(tileX) {
        return tileX * this.tileWidth;
    }

    topPixelOfTile(tileY) {
        return tileY * this.tileHeight;
    }

    centerPixelXOfTile(tileX) {
        return tileX * this.tileWidth + this.tileWidth / 2;
    }

    centerPixelYOfTile(tileY) {
        return tileY * this.tileHeight + this.tileHeight / 2;
    }


    localTileXInContainingChunk(tileX) {
        const chunkX = this.chunkXFromTileX(tileX);
        return tileX - this.leftTileOfChunk(chunkX);
    }

    localTileYInContainingChunk(tileY) {
        const chunkY = this.chunkYFromTileY(tileY);
        return tileY - this.topTileOfChunk(chunkY);
    }

    localPixelXInContainingChunk(pixelX) {
        const chunkX = this.chunkXFromPixelX(pixelX);
        return pixelX - this.leftPixelOfChunk(chunkX);
    }

    localPixelYInContainingChunk(pixelY) {
        const chunkY = this.chunkYFromPixelY(pixelY);
        return pixelY - this.topPixelOfChunk(chunkY);
    }

    localPixelXInContainingTile(pixelX) {
        const tileX = this.tileXFromPixelX(pixelX);
        return pixelX - this.leftPixelOfTile(tileX);
    }

    localPixelYInContainingTile(pixelY) {
        const tileY = this.tileYFromPixelY(pixelY);
        return pixelY - this.topPixelOfTile(tileY);
    }
}