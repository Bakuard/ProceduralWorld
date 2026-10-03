import {WebGLRenderer,  Filter, defaultFilterVert, Assets, Container, Sprite, AnimatedSprite, Ticker} from 'pixi.js';
import {objectTypes} from "./objectTypes";
import {SizeUnitsConverter} from "./sizeUnitsConverter";
import {WorldGrid} from "./worldGrid";
import {MapGenerator} from "./mapGenerator";
import {EventManager, keyboardEvents} from "./eventManager";
import {Vector} from "./vector";
import {Camera} from "./camera";
import {Calendar, dayPhases} from "./calendar";

let Config;
let sizeUnitsConverter;
let worldGrid;
let mapGenerator;
let eventManager;
let calendar;
let player;

let renderer;
let stage;
let ticker;
let camera;
let objectsSpriteContainer;

let nightShaderCode;
let nightShader;

async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'img/water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'img/sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'img/grass_tile.jpg' });
    await Assets.load('img/trees.json');
    await Assets.load({ alias: objectTypes.player, src: 'img/character.json' });
}

async function loadShaders() {
    const response = await fetch('shaders/night.glsl');
    if (!response.ok) throw `Fail to load shader source: ${response.statusText}`;
    nightShaderCode = await response.text();
}

async function loadConfig() {
    const response = await fetch('config/config.json');
    if (!response.ok) throw `Fail to load config.json: ${response.statusText}`;
    Config = await response.json();
}


function createShader() {
    return Filter.from({
        gl: {
            fragment: nightShaderCode,
            vertex: defaultFilterVert
        },
        resources: {
            timeUniforms: {
                uIntensity: { value: 0.0, type: 'f32' },
                uDayPhase: { value: 1, type: 'i32' }
            },
        },
    });
}

function updateShader() {
    const currentDayPhaseProgress = calendar.getCurrentPhaseProgress();
    const uniforms = nightShader.resources.timeUniforms.uniforms;
    switch(calendar.getCurrentDayPhase()) {
        case dayPhases.morning:
            uniforms.uDayPhase = 1;
            uniforms.uIntensity = Math.min(1, currentDayPhaseProgress / Config.time.morningPhaseTransitionFraction);
            break;
        case dayPhases.afternoon:
            uniforms.uDayPhase =2;
            uniforms.uIntensity = Math.min(1, currentDayPhaseProgress / Config.time.afternoonPhaseTransitionFraction);
            break;
        case dayPhases.evening:
            uniforms.uDayPhase =3;
            uniforms.uIntensity = Math.min(1, currentDayPhaseProgress / Config.time.eveningPhaseTransitionFraction);
            break;
        case dayPhases.night:
            uniforms.uDayPhase =4;
            uniforms.uIntensity = Math.min(1, currentDayPhaseProgress / Config.time.nightPhaseTransitionFraction);
            break;
    }
}


function createPlayerSprite(startAnimationName) {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations[startAnimationName], false);
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createPlayer(playerConfig) {
    player = { x: playerConfig.pixelX, y: playerConfig.pixelY, speed: playerConfig.speed, velocity: new Vector(), sprite: createPlayerSprite(playerConfig.startAnimation) };
    eventManager.registerInbox('Player', keyboardEvents.KeyW, keyboardEvents.KeyA, keyboardEvents.KeyS, keyboardEvents.KeyD);
    objectsSpriteContainer.addChild(player.sprite);
    setPlayerAnimation('idle');
}

function setPlayerAnimation(animationName) {
    if(animationName === 'idle') {
        player.sprite.textures = Assets.get(objectTypes.player).animations[animationName];
        player.sprite.animationSpeed = Config.player.animations.idle.animationSpeed;
        player.sprite.gotoAndPlay(0);
        player.animationName = animationName;
    } else if(animationName === 'run') {
        player.sprite.textures = Assets.get(objectTypes.player).animations[animationName];
        player.sprite.animationSpeed = Config.player.animations.run.animationSpeed;
        player.sprite.gotoAndPlay(0);
        player.animationName = animationName;
    } else {
        throw 'Invalid player animation name';
    }
}

function updatePlayerAnimation() {
    if(player.velocity.isZero() && player.animationName !== 'idle') setPlayerAnimation('idle');
    else if(!player.velocity.isZero() && player.animationName !== 'run') setPlayerAnimation('run');

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
    calendar.updateCurrentTime(ticker.deltaMS);
    movePlayer(ticker.deltaMS);
    updatePlayerAnimation();

    if(worldGrid.checkDistanceToBorder(player.x, player.y, Config.grid.loadDistanceInChunk))
        generateChunksFor(player.x, player.y);

    updateCamera();
    updateShader();
    renderer.render(stage);
}

async function setup() {
    await loadTextures();
    await loadShaders();
    await loadConfig();

    sizeUnitsConverter = new SizeUnitsConverter(Config.sizeUnitsConverter);
    mapGenerator = new MapGenerator(sizeUnitsConverter, Config.mapGenerator);
    worldGrid = new WorldGrid(sizeUnitsConverter, Config.grid);
    eventManager = new EventManager();
    calendar = new Calendar(Config.time);

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
    camera = new Camera(domContainer.clientWidth, domContainer.clientHeight, Config.camera);
    stage = new Container();
    objectsSpriteContainer = new Container();
    stage.addChild(objectsSpriteContainer);
    createPlayer(Config.player);
    generateChunksFor(player.x, player.y);
    camera.centerOn(player.x, player.y);

    //Подключаем шейдеры
    nightShader = createShader();
    stage.filters = [nightShader];

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