import {Assets} from "pixi.js";

export class TiledParser {
    constructor() {
        this.cache = {};
    }

    getTileLayer(mapName, layerName) {
        return getFromCacheOrExtractLayer(mapName, layerName, this.cache, extractTileLayerData);
    }

    getObjLayer(mapName, layerName) {
        return getFromCacheOrExtractLayer(mapName, layerName, this.cache, extractObjLayerData);
    }

    getObjLayerThenGroup(mapName, layerName, key) {
        const layer = this.getObjLayer(mapName, layerName);
        const objectsMap = {};
        layer.objects.forEach(obj => {
            const mapKey = obj[key];
            const mapValue = objectsMap[mapKey];
            if (mapValue == null) objectsMap[mapKey] = [obj];
            else objectsMap[mapKey].push(obj);
        });
        return { ...layer, objectsMap };
    }
}

function findLayerByPath(rawMap, layerPath, expectedType) {
    const pathSegments = layerPath.split('/');

    let currentLayer = rawMap;
    let visible = true;
    for(let segmentName of pathSegments) {
        currentLayer = currentLayer.layers?.find(layer => layer.name === segmentName);
        if(!currentLayer) throw new Error(`Layer '${layerPath}' not found in map`);
        visible = visible && currentLayer.visible;
    }

    if(currentLayer.type !== expectedType) throw new Error(`Layer '${layerPath}' is not a ${expectedType} (actual type: '${currentLayer.type}')`);

    return { layer: currentLayer, visible };
}

function findTilesetForGid(rawMap, gid) {
    const tileset = rawMap.tilesets.find(tileset => gid >= tileset.firstgid && gid < tileset.firstgid + tileset.tilecount);
    if(!tileset) throw new Error(`Tileset for gid '${gid}' not found`);
    return tileset;
}

function findFrameInTileset(rawMap, gid) {
    const tileset = findTilesetForGid(rawMap, gid);

    const localTileId = gid - tileset.firstgid;
    const col = localTileId % tileset.columns;
    const row = Math.floor(localTileId / tileset.columns);

    return {
        tilesetName: tileset.name,
        tileTextureWidth: tileset.tilewidth,
        tileTextureHeight: tileset.tileheight,
        tileTextureLeft: tileset.margin + col * (tileset.tilewidth + tileset.spacing),
        tileTextureTop: tileset.margin + row * (tileset.tileheight + tileset.spacing)
    };
}

function assignCustomProperties(target, properties) {
    for(const prop of properties ?? []) {
        if(Object.hasOwn(target, prop.name)) throw new Error(`Custom property '${prop.name}' conflicts with reserved metadata field`);
        target[prop.name] = prop.value;
    }
    return target;
}

function getValidatedMap(mapName) {
    const rawMap = Assets.get(mapName);
    if(!rawMap) throw new Error(`Map '${mapName}' is not loaded`);
    if(typeof(rawMap) !== 'object') throw new Error(`Invalid Tiled map format for '${mapName}'`);
    if(rawMap.infinite) throw new Error(`Infinite maps are not supported (map '${mapName}')`);
    if(rawMap.tilesets.some(tileset => tileset.source)) throw new Error(`External tilesets are not supported`);
    return rawMap;
}

function cleanGid(gid) {
    return gid & 0x1FFFFFFF;
}

function extractAllFrames(rawMap, gidArray) {
    const frames = {};
    for(const rawGid of gidArray) {
        const gid = cleanGid(rawGid);
        if(gid !== 0 && !frames[gid]) frames[gid] = findFrameInTileset(rawMap, gid);
    }
    return frames;
}

function extractTileLayerData(mapName, layerName) {
    const rawMap = getValidatedMap(mapName);
    const { layer, visible } = findLayerByPath(rawMap, layerName, 'tilelayer');

    const cleanedGids = layer.data.map(cleanGid);

    return {
        mapWidthInTile: rawMap.width,
        mapHeightInTile: rawMap.height,
        tileWidthInPixel: rawMap.tilewidth,
        tileHeightInPixel: rawMap.tileheight,
        widthInTile: layer.width,
        heightInTile: layer.height,
        visible,
        tiles: cleanedGids.map(gid => gid === 0 ? null : gid),
        frames: extractAllFrames(rawMap, cleanedGids)
    };
}

function extractObjectData(rawObj) {
    const isTiledObject = rawObj.gid != null;

    const objData = {
        gid: isTiledObject ? cleanGid(rawObj.gid) : null,
        name: rawObj.name,
        type: rawObj.type,
        left: rawObj.x,
        top: isTiledObject ? rawObj.y - rawObj.height : rawObj.y,
        width: rawObj.width,
        height: rawObj.height,
        rotation: rawObj.rotation,
        visible: rawObj.visible
    };

    return assignCustomProperties(objData, rawObj.properties);
}

function extractObjLayerData(mapName, layerName) {
    const rawMap = getValidatedMap(mapName);
    const { layer, visible } = findLayerByPath(rawMap, layerName, 'objectgroup');

    const objects = layer.objects?.map(rawObj => extractObjectData(rawObj)) ?? [];

    return {
        mapWidthInTile: rawMap.width,
        mapHeightInTile: rawMap.height,
        tileWidthInPixel: rawMap.tilewidth,
        tileHeightInPixel: rawMap.tileheight,
        visible,
        objects,
        frames: extractAllFrames(rawMap, objects.filter(obj => obj.gid).map(obj => obj.gid))
    };
}

function getFromCacheOrExtractLayer(mapName, layerName, cache, extractor) {
    let result = cache[mapName]?.[layerName];
    if(!result) {
        result = extractor(mapName, layerName);
        cache[mapName] ??= {};
        cache[mapName][layerName] = result;
    }
    return result;
}