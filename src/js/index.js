import { WebGLRenderer, Assets, Container, Sprite, AnimatedSprite, Ticker } from 'pixi.js';
import {objectTypes} from "./objectTypes";
import {SizeUnitsConverter} from "./sizeUnitsConverter";
import {WorldGrid} from "./worldGrid";
import {MapGenerator} from "./mapGenerator";
import {EventManager, keyboardEvents} from "./eventManager";
import {Vector} from "./vector";
import {Camera} from "./camera";

let renderer;
let stage;
let ticker;
let sizeUnitsConverter;
let worldGrid;
let mapGenerator;
let eventManager;
let camera;
let player;
let objectsSpriteContainer;

async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'grass_tile.jpg' });
    await Assets.load('trees.json');
    await Assets.load({ alias: objectTypes.player, src: 'character.json' });
}


function createPlayerSprite() {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations['idle'], false);
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createPlayer(pixelX, pixelY, speed) {
    player = { x: pixelX, y: pixelY, speed: speed, velocity: new Vector(), sprite: createPlayerSprite() };
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

function updatePlayerAnimation() {
    if(player.velocity.isZero()) setPlayerAnimation('idle');
    else setPlayerAnimation('run');

    if(player.velocity.x !== 0) player.sprite.scale.set(player.velocity.x >= 0 ? 1 : -1, 1);

    player.sprite.update(ticker);
}

function movePlayer(deltaMS) {
    player.velocity.x = eventManager.hasEvent('Player', keyboardEvents.KeyD) - eventManager.hasEvent('Player', keyboardEvents.KeyA);
    player.velocity.y = eventManager.hasEvent('Player', keyboardEvents.KeyS) - eventManager.hasEvent('Player', keyboardEvents.KeyW);
    if(player.velocity.y !== 0 && player.velocity.x !== 0) {
        player.velocity.x *= 0.707106; //sin 45 degree
        player.velocity.y *= 0.707106; //cos 45 degree
    }
    player.velocity.scale(player.speed * (deltaMS / 1000));

    player.x += player.velocity.x;
    player.y += player.velocity.y;

    const playerSpriteX = worldGrid.localPixelXInWorld(player.x);
    const playerSpriteY = worldGrid.localPixelYInWorld(player.y);
    player.sprite.position.set(playerSpriteX, playerSpriteY);
    player.sprite.zIndex = player.y;
}


function createTileSprite(localTileXInChunk, localTileYInChunk, tileType) {
    const topTilePixel = sizeUnitsConverter.topPixelOfTile(localTileYInChunk);
    const leftTilePixel = sizeUnitsConverter.leftPixelOfTile(localTileXInChunk);
    const tileSprite = new Sprite(Assets.get(tileType));
    tileSprite.position.set(leftTilePixel, topTilePixel);
    tileSprite.setSize(sizeUnitsConverter.tileWidthInPixels(), sizeUnitsConverter.tileHeightInPixels());
    return tileSprite;
}

function createTreeSprite(treeMeta) {
    const treeSprite = new Sprite(Assets.get(treeMeta.treeType));
    treeSprite.anchor.set(0.5, 1);
    const treeSpriteX = worldGrid.localPixelXInWorld(treeMeta.globalPixelX);
    const treeSpriteY = worldGrid.localPixelYInWorld(treeMeta.globalPixelY);
    treeSprite.position.set(treeSpriteX, treeSpriteY);
    treeSprite.zIndex = treeMeta.globalPixelY;
    return treeSprite;
}

function createTree(treeMeta) {
    return {
        x: treeMeta.globalPixelX,
        y: treeMeta.globalPixelY,
        type: treeMeta.treeType,
        sprite: createTreeSprite(treeMeta)
    };
}

function generateChunksFor(pixelX, pixelY) {
    const result = worldGrid.shiftCenterToPixel(pixelX, pixelY);

    for(let chunk of result.createdChunks) {
        chunk.tileSpriteContainer = new Container();
        chunk.tileSpriteContainer.cullable = true;
        const localLeftOfChunk = worldGrid.localLeftPixelOfChunkInWorld(chunk.chunkX);
        const localTopOfChunk = worldGrid.localTopPixelOfChunkInWorld(chunk.chunkY);
        chunk.tileSpriteContainer.position.set(localLeftOfChunk, localTopOfChunk);

        chunk.forEachTileCoords((tileGlobalX, tileGlobalY, localTileXInChunk, localTileYInChunk) => {
            mapGenerator.generate(tileGlobalX, tileGlobalY);

            const tileType = mapGenerator.getTileType();
            const tileSprite = createTileSprite(localTileXInChunk, localTileYInChunk, tileType);
            chunk.tileSpriteContainer.addChild(tileSprite);

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) {
                const tree = createTree(treeMeta);
                chunk.addToChunk(tree, tree.type);
                objectsSpriteContainer.addChild(tree.sprite);
            }
        });

        stage.addChild(chunk.tileSpriteContainer);
    }

    for(let chunk of result.retainedChunks) {
        const localLeftOfChunk = worldGrid.localLeftPixelOfChunkInWorld(chunk.chunkX);
        const localTopOfChunk = worldGrid.localTopPixelOfChunkInWorld(chunk.chunkY);
        chunk.tileSpriteContainer.position.set(localLeftOfChunk, localTopOfChunk);

        chunk.forEachObj((obj, objType) => {
            const spriteLocalX = worldGrid.localPixelXInWorld(obj.x);
            const spriteLocalY = worldGrid.localPixelYInWorld(obj.y);
            obj.sprite.position.set(spriteLocalX, spriteLocalY);
            obj.sprite.zIndex = obj.y;
        });
    }

    for(let chunk of result.removedChunks) {
        chunk.tileSpriteContainer.removeFromParent();
        chunk.tileSpriteContainer.destroy({ children: true });

        chunk.forEachObj((obj, objType) => {
            obj.sprite.removeFromParent();
            obj.sprite.destroy();
        });
    }

    stage.setChildIndex(objectsSpriteContainer, stage.children.length - 1);
}

function updateCamera() {
    camera.followIfOutOfDeadZone(player.x, player.y);
    const stageX = camera.toViewportPixelX(worldGrid.border.pixelLeft);
    const stageY = camera.toViewportPixelY(worldGrid.border.pixelTop);
    stage.position.set(stageX, stageY);
}

function update(ticker) {
    movePlayer(ticker.deltaMS);
    updatePlayerAnimation();

    if(worldGrid.checkDistanceToBorder(player.x, player.y, 1.3))
        generateChunksFor(player.x, player.y);

    updateCamera();
    renderer.render(stage);
}

async function setup() {
    await loadTextures();

    sizeUnitsConverter = new SizeUnitsConverter({ tileWidth: 60, tileHeight: 60, chunkSizeInTile: 10, worldWidthInChunk: 5, worldHeightInChunk: 5 });
    mapGenerator = new MapGenerator(sizeUnitsConverter, { seed: Math.randomIntegerInRange(0, 1_000_000), octaves: 16, persistence: 0.5, frequency: 0.01, frequencyMod: 2, distanceBetweenTreesInTile: 2, treeRandomOffsetInPixel: 30 });
    worldGrid = new WorldGrid(sizeUnitsConverter, { chunkLeft: 0, chunkTop: 0 });
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
    camera = new Camera(domContainer.clientWidth, domContainer.clientHeight, { deadZoneLeftIndent: 0.4, deadZoneRightIndent: 0.4, deadZoneTopIndent: 0.4, deadZoneBottomIndent: 0.4 });
    stage = new Container();
    objectsSpriteContainer = new Container();
    stage.addChild(objectsSpriteContainer);
    createPlayer(150, 150, 170);
    generateChunksFor(player.x, player.y);
    camera.centerOn(player.x, player.y);

    //Подписываемся на внешние события
    window.addEventListener('resize', () => {
        camera.resize(domContainer.clientWidth, domContainer.clientHeight);
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