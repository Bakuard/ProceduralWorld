import {Assets} from "pixi.js";

export class TiledParser {
    constructor() {
        this.cache = {};
    }

    getTileLayerData(mapName, layerName) {
        let result = this.cache[mapName]?.[layerName];
        if(!result) {
            result = extractTileLayerData(mapName, layerName);
            this.cache[mapName] ??= {};
            this.cache[mapName][layerName] = result;
        }
        return result;
    }
}

function validateMap(mapName, rawMap) {
    if(!rawMap || typeof rawMap !== 'object') throw new Error(`Invalid Tiled map format for '${mapName}'`);
    if(rawMap.infinite) throw new Error(`Infinite maps are not supported (map '${mapName}')`);
    if(rawMap.tilesets.some(tileset => tileset.source)) throw new Error(`External tilesets are not supported`);
}

function findTileLayerByPath(mapName, rawMap, layerPath) {
    const pathSegments = layerPath.split('/');

    let currentLayer = rawMap;
    let visible = true;
    for(let segmentName of pathSegments) {
        currentLayer = currentLayer.layers?.find(layer => layer.name === segmentName);
        if(!currentLayer) throw new Error(`Layer '${layerPath}' not found in map '${mapName}'`);
        visible = visible && currentLayer.visible;
    }

    if(currentLayer.type !== 'tilelayer') throw new Error(`Layer '${layerPath}' in map '${mapName}' is not a tilelayer (actual type: '${currentLayer.type}')`);

    return { layer: currentLayer, visible };
}

function findTilesetForGid(rawMap, gid) {
    const tileset = rawMap.tilesets.find(tileset => gid >= tileset.firstgid && gid < tileset.firstgid + tileset.tilecount);
    if(!tileset) throw new Error(`Tileset for gid '${gid}' not found`);
    return tileset;
}

function extractTileMetadata(rawMap, gid) {
    const tileset = findTilesetForGid(rawMap, gid);

    const localTileId = gid - tileset.firstgid;
    const col = localTileId % tileset.columns;
    const row = Math.floor(localTileId / tileset.columns);

    const metadata = {
        tilesetName: tileset.name,
        tileTextureWidth: tileset.tilewidth,
        tileTextureHeight: tileset.tileheight,
        tileTextureLeft: tileset.margin + col * (tileset.tilewidth + tileset.spacing),
        tileTextureTop: tileset.margin + row * (tileset.tileheight + tileset.spacing)
    };

    const customTileEntry = tileset.tiles?.find(tile => tile.id === localTileId);
    for(const prop of customTileEntry?.properties ?? []) {
        if(metadata[prop.name] != null) throw new Error(`Custom property '${prop.name}' of tile gid=${gid} (local id=${localTileId} in tileset '${tileset.name}') conflicts with reserved metadata field`);
        metadata[prop.name] = prop.value;
    }

    return metadata;
}

function extractTileLayerData(mapName, layerName) {
    const rawMap = Assets.get(mapName);
    if(!rawMap) throw new Error(`Map '${mapName}' is not loaded`);

    const { layer, visible } = findTileLayerByPath(mapName, rawMap, layerName);

    const tiles = layer.data.map(gid => gid === 0 ? null : gid);

    const tilesData = {};
    for(const gid of layer.data) {
        if(gid !== 0 && !tilesData[gid]) tilesData[gid] = extractTileMetadata(rawMap, gid);
    }

    return { widthInTile: layer.width, heightInTile: layer.height, visible, tiles, tilesData };
}