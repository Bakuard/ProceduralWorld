import { WebGLRenderer, Assets, Container, Sprite, AnimatedSprite, Ticker } from 'pixi.js';
import {objectTypes} from "./objectTypes";
import {SizeUnitsConverter} from "./sizeUnitsConverter";
import {GridContainer} from "./gridContainer";
import {MapGenerator} from "./mapGenerator";
import {EventManager, keyboardEvents} from "./EventManager";
import {Vector} from "./Vector";

let renderer;
let stage;
let ticker;
let sizeUnitsConverter;
let worldGrid;
let mapGenerator;
let eventManager;
let player;
let objectsSpriteContainer;

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
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createPlayer(pixelX, pixelY, speed) {
    player = { x: pixelX, y: pixelY, speed: speed, velocity: new Vector(), sprite: createPlayerSprite(pixelX, pixelY) };
    eventManager.registerInbox('Player', keyboardEvents.KeyW, keyboardEvents.KeyA, keyboardEvents.KeyS, keyboardEvents.KeyD);
    objectsSpriteContainer.addChild(player.sprite);
    setPlayerAnimation('idle');
}

function setPlayerAnimation(animationName) {
    if(animationName === 'idle' && player.animationName !== animationName) {
        player.sprite.textures = Assets.get(objectTypes.player).animations[animationName];
        player.sprite.animationSpeed = 0.06;
        player.sprite.gotoAndPlay(0);
        player.animationName = animationName;
    } else if(animationName === 'run' && player.animationName !== animationName) {
        player.sprite.textures = Assets.get(objectTypes.player).animations[animationName];
        player.sprite.animationSpeed = 0.15;
        player.sprite.gotoAndPlay(0);
        player.animationName = animationName;
    } else if(player.animationName !== animationName) {
        throw 'Invalid player animation name';
    }
}

function movePlayer(deltaMS) {
    player.velocity.x = eventManager.hasEvent('Player', keyboardEvents.KeyD) - eventManager.hasEvent("Player", keyboardEvents.KeyA);
    player.velocity.y = eventManager.hasEvent('Player', keyboardEvents.KeyS) - eventManager.hasEvent("Player", keyboardEvents.KeyW);
    if(player.velocity.y !== 0 && player.velocity.x !== 0) {
        player.velocity.x *= 0.707106; //sin 45 degree
        player.velocity.y *= 0.707106; //cos 45 degree
    }
    player.velocity.scale(player.speed * (deltaMS / 1000));

    player.x += player.velocity.x;
    player.y += player.velocity.y;
    player.sprite.position.set(player.x, player.y);
    player.sprite.zIndex = player.y;

    if(player.velocity.isZero()) setPlayerAnimation('idle');
    else setPlayerAnimation('run');

    if(player.velocity.x !== 0) player.sprite.scale.set(player.velocity.x >= 0 ? 1 : -1, 1);
}


function createTileSprite(tileLocalInChunkX, tileLocalInChunkY, tileType) {
    const topPerPixel = sizeUnitsConverter.topPixelOfTile(tileLocalInChunkY);
    const leftPerPixel = sizeUnitsConverter.leftPixelOfTile(tileLocalInChunkX);
    const tileSprite = new Sprite(Assets.get(tileType));
    tileSprite.position.set(leftPerPixel, topPerPixel);
    tileSprite.setSize(sizeUnitsConverter.tileWidthInPixels(), sizeUnitsConverter.tileHeightInPixels());
    return tileSprite;
}

function createTreeSprite(treeMeta) {
    const treeSprite = new Sprite(Assets.get(treeMeta.treeType));
    treeSprite.position.set(treeMeta.globalPixelX, treeMeta.globalPixelY);
    treeSprite.anchor.set(0.5, 1);
    treeSprite._zIndex = treeMeta.globalPixelY;
    return treeSprite;
}

function generateChunksFor(pixelX, pixelY) {
    const result = worldGrid.shiftCenterToPixel(pixelX, pixelY);

    objectsSpriteContainer.position.set(worldGrid.border.pixelLeft, worldGrid.border.pixelTop);

    for(let chunk of result.createdChunks) {
        chunk.spriteContainer = new Container();
        chunk.spriteContainer.position.set(chunk.pixelLeft, chunk.pixelTop);

        chunk.forEachTileCoords((tileGlobalX, tileGlobalY, tileLocalInChunkX, tileLocalInChunkY) => {
            mapGenerator.generate(tileGlobalX, tileGlobalY);

            const tileType = mapGenerator.getTileType();
            const tileSprite = createTileSprite(tileLocalInChunkX, tileLocalInChunkY, tileType);
            chunk.spriteContainer.addChild(tileSprite);

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) {
                const treeSprite = createTreeSprite(treeMeta);
                objectsSpriteContainer.addChild(treeSprite);
            }
        });

        stage.addChild(chunk.spriteContainer);
    }
    stage.addChild(objectsSpriteContainer);
}


function update(ticker) {
    movePlayer(ticker.deltaMS);
    player.sprite.update(ticker);
    renderer.render(stage);
}

async function setup() {
    await loadTextures();

    sizeUnitsConverter = new SizeUnitsConverter({ tileWidth: 60, tileHeight: 60, chunkSizeInTile: 10, worldWidthInChunk: 5, worldHeightInChunk: 5 });
    mapGenerator = new MapGenerator(sizeUnitsConverter, { seed: Math.randomIntegerInRange(0, 1_000_000), octaves: 16, persistence: 0.5, frequency: 0.01, frequencyMod: 2, distanceBetweenTreesInTile: 2, treeRandomOffsetInPixel: 30 });
    worldGrid = new GridContainer(sizeUnitsConverter, { chunkLeft: 0, chunkTop: 0 });
    eventManager = new EventManager();

    //Создаем Renderer
    const domContainer = document.querySelector('.canvasContainer');
    renderer = new WebGLRenderer();
    await renderer.init({
        background: '#1099BB',
        width: domContainer.clientWidth,
        height: domContainer.clientHeight
    });
    domContainer.appendChild(renderer.canvas);

    //Инициализируем контейнеры для спрайтов
    objectsSpriteContainer = new Container();
    stage = new Container();
    generateChunksFor(800, 500);
    createPlayer(800, 1500, 170);

    //Подписываемся на внешние события
    window.addEventListener('resize', () => {
        renderer.resize(domContainer.clientWidth, domContainer.clientHeight);
    });
    document.addEventListener('keydown', event => {
        eventManager.pushEvent(event.code, true);
    });
    document.addEventListener('keyup', event => {
        eventManager.clearEventForAll(event.code);
    });

    //Инициализируем и запускаем game loop
    ticker = new Ticker();
    ticker.add((ticker) => update(ticker));
    ticker.start();
}

setup();