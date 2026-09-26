import { WebGLRenderer, Assets, Container, Sprite, AnimatedSprite, Ticker } from 'pixi.js';
import {objectTypes} from "./objectTypes";
import {SizeUnitsConverter} from "./sizeUnitsConverter";
import {GridContainer} from "./gridContainer";
import {MapGenerator} from "./mapGenerator";
import {EventManager, keyboardEvents} from "./EventManager";

let renderer;
let stage;
let ticker;
let sizeUnitsConverter;
let worldGrid;
let mapGenerator;
let eventManager;
let playerSprite;

async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'grass_tile.jpg' });
    await Assets.load('trees.json');
    await Assets.load({ alias: objectTypes.player, src: 'character.json' });
}


function createPlayerSprite(pixelX, pixelY) {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations['idle'], false);
    playerSprite.position.set(pixelX, pixelY);
    playerSprite.animationSpeed = 0.06;
    playerSprite.play();
    return playerSprite;
}


function createTileSprite(tileLocalInChunkX, tileLocalInChunkY, tileType) {
    const topPerPixel = sizeUnitsConverter.topPixelOfTile(tileLocalInChunkY);
    const leftPerPixel = sizeUnitsConverter.leftPixelOfTile(tileLocalInChunkX);
    const tileSprite = new Sprite(Assets.get(tileType));
    tileSprite.position.set(leftPerPixel, topPerPixel);
    tileSprite.setSize(sizeUnitsConverter.tileWidthInPixels(), sizeUnitsConverter.tileHeightInPixels());
    return tileSprite;
}

function createTreeSprite(treeMeta, chunk) {
    const treeSprite = new Sprite(Assets.get(treeMeta.treeType));
    treeSprite.position.set(treeMeta.globalPixelX - chunk.pixelLeft, treeMeta.globalPixelY - chunk.pixelTop);
    return treeSprite;
}

function generateChunksFor(pixelX, pixelY) {
    const result = worldGrid.shiftCenterToPixel(pixelX, pixelY);
    for(let i = 0; i < result.createdChunks.length; i++) {
        const chunk = result.createdChunks[i];

        const tilesSpriteContainer = new Container();
        tilesSpriteContainer.position.set(chunk.pixelLeft, chunk.pixelTop);

        const treesSpriteContainer = new Container();
        treesSpriteContainer.position.set(chunk.pixelLeft, chunk.pixelTop);

        chunk.forEachTileCoords((tileGlobalX, tileGlobalY, tileLocalInChunkX, tileLocalInChunkY) => {
            mapGenerator.generate(tileGlobalX, tileGlobalY);

            const tileType = mapGenerator.getTileType();
            const tileSprite = createTileSprite(tileLocalInChunkX, tileLocalInChunkY, tileType);
            tilesSpriteContainer.addChild(tileSprite);

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) {
                const treeSprite = createTreeSprite(treeMeta, chunk);
                treesSpriteContainer.addChild(treeSprite);
            }
        });

        stage.addChildAt(tilesSpriteContainer, i);
        stage.addChild(treesSpriteContainer);
    }
}


function update(ticker) {
    playerSprite.update(ticker);
    renderer.render(stage);
}

async function setup() {
    await loadTextures();

    sizeUnitsConverter = new SizeUnitsConverter({ tileWidth: 60, tileHeight: 60, chunkSizeInTile: 10, worldWidthInChunk: 5, worldHeightInChunk: 5 });
    mapGenerator = new MapGenerator(sizeUnitsConverter, { seed: Math.randomIntegerInRange(0, 1_000_000), octaves: 16, persistence: 0.5, frequency: 0.01, frequencyMod: 2, distanceBetweenTreesInTile: 2, treeRandomOffsetInPixel: 30 });
    worldGrid = new GridContainer(sizeUnitsConverter, { chunkLeft: 0, chunkTop: 0 });
    eventManager = new EventManager();

    const domContainer = document.querySelector('.canvasContainer');
    renderer = new WebGLRenderer();
    await renderer.init({
        background: '#1099BB',
        width: domContainer.clientWidth,
        height: domContainer.clientHeight
    });
    domContainer.appendChild(renderer.canvas);

    stage = new Container();
    generateChunksFor(800, 500);

    playerSprite = createPlayerSprite(800, 800);
    stage.addChild(playerSprite);

    window.addEventListener('resize', () => {
        const newWidth = domContainer.clientWidth;
        const newHeight = domContainer.clientHeight;
        renderer.resize(newWidth, newHeight);
    });

    document.addEventListener('keydown', event => {
        eventManager.setEvent(event.code, true);
    });

    ticker = new Ticker();
    ticker.add((ticker) => update(ticker));
    ticker.start();
}

setup();