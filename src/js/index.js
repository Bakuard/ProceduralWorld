import {WebGLRenderer,  Filter, defaultFilterVert, Assets, Container, Sprite, AnimatedSprite, Ticker, Graphics} from 'pixi.js';
import {objectTypes} from "./objectTypes";
import {SizeUnitsConverter} from "./sizeUnitsConverter";
import {GridStore} from "./gridStore";
import {MapGenerator} from "./mapGenerator";
import {EventManager, InputEvents} from "./eventManager";
import {Vector} from "./vector";
import {Camera} from "./camera";
import {Calendar, dayPhases} from "./calendar";
import {DenseArray, UnorderedPool} from "./unorderedPool";
import {Timer} from "./util";
import Matter from 'matter-js';

let Config;
let sizeUnitsConverter;
let gridStore;
let mapGenerator;
let eventManager;
let calendar;
let player;
let allFireballs;
let allExplosions;
const slimeStates = Object.freeze({
    idle: 'idle',
    roam: 'roam',
    chase: 'chase',
    attack: 'attack'
});
let spawnSlimeTimer;
let allPhysicsBodies;

let collisionDetector;

let renderer;
let stage;
let ticker;
let camera;
let allTileSpritesContainer;
let objectsSpriteContainer;
let debugPhysicsGraphics;

let nightShaderCode;
let nightShader;

async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'img/water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'img/sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'img/grass_tile.jpg' });
    await Assets.load('img/trees.json');
    await Assets.load({ alias: objectTypes.player, src: 'img/character.json' });
    await Assets.load({ alias: objectTypes.fireball, src: 'img/fireball.json' });
    await Assets.load({ alias: objectTypes.explosion, src: 'img/explosion.json' });
    await Assets.load({ alias: objectTypes.slime, src: 'img/slime.json' });
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


function debugDrawAllPhysicsBodies() {
    debugPhysicsGraphics.clear().setStrokeStyle({ width: 2, color: 0x00ff00 });

    allPhysicsBodies.forEach(body => {
        if(body.circleRadius > 0) {
            const center = Matter.Vertices.centre(body.vertices);
            const x = gridStore.localPixelXInGrid(center.x);
            const y = gridStore.localPixelYInGrid(center.y);
            debugPhysicsGraphics.circle(x, y, body.circleRadius).stroke();
        } else {
            const x = gridStore.localPixelXInGrid(body.bounds.min.x);
            const y = gridStore.localPixelYInGrid(body.bounds.min.y);
            const width = body.bounds.max.x - body.bounds.min.x;
            const height = body.bounds.max.y - body.bounds.min.y;
            debugPhysicsGraphics.rect(x, y, width, height).stroke();
        }
    });
}

function handleCollisions() {
    Matter.Detector.setBodies(collisionDetector, allPhysicsBodies.innerArray);

    Matter.Detector.collisions(collisionDetector).forEach(collision => {
        if(!collision.collided) return;

        const objA = collision.bodyA.owner;
        const objB = collision.bodyB.owner;
        if(objA.type === objectTypes.slime && objB.type === objectTypes.fireball) {
            handleFireballAndSlimeCollision(objB, objA);
        } else if(objA.type === objectTypes.fireball && objB.type === objectTypes.slime) {
            handleFireballAndSlimeCollision(objA, objB);
        }
    });
}

function handleFireballAndSlimeCollision(fireball, slime) {
    removeFireball(fireball);
    createExplosion(fireball.x, fireball.y);
}


function createPlayerSprite(startAnimationName) {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations[startAnimationName], false);
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createPlayerPhysicsBody(globalPixelX, globalPixelY, owner) {
    const body = Matter.Bodies.rectangle(globalPixelX, globalPixelY - Config.player.bodyHeight / 2, Config.player.bodyWidth, Config.player.bodyHeight);
    body.newPosition = { x: globalPixelX, y: globalPixelY };
    Matter.Body.setCentre(body, body.newPosition);
    body.owner = owner;
    return body;
}

function createPlayer(playerConfig) {
    player = {
        type: objectTypes.player,
        x: playerConfig.pixelX,
        y: playerConfig.pixelY,
        speed: playerConfig.speed,
        fireRateInMillis: playerConfig.fireRateInMillis,
        lastFireTime: 0,
        velocity: new Vector(),
        sprite: createPlayerSprite(playerConfig.startAnimation)
    };
    player.body = createPlayerPhysicsBody(playerConfig.pixelX, playerConfig.pixelY, player);

    eventManager.registerInbox('Player', InputEvents.KeyW, InputEvents.KeyA, InputEvents.KeyS, InputEvents.KeyD, InputEvents.MouseClick);
    objectsSpriteContainer.addChild(player.sprite);
    setPlayerAnimation('idle');
    allPhysicsBodies.addLast(player.body);
}

function setPlayerAnimation(animationName) {
    const spritesheet = Assets.get(objectTypes.player);
    const texture = spritesheet.animations[animationName];
    if(texture) {
        const animationConfig = spritesheet.data.animationsConfig[animationName];
        player.sprite.textures = texture;
        player.sprite.animationSpeed = animationConfig.frameRate;
        player.sprite.loop = animationConfig.loop;
        player.sprite.gotoAndPlay(0);
        player.animationName = animationName;
    } else {
        throw 'Invalid player animation name: ' + animationName;
    }
}

function updatePlayerView() {
    const playerSpriteX = gridStore.localPixelXInGrid(player.x);
    const playerSpriteY = gridStore.localPixelYInGrid(player.y);
    player.sprite.position.set(playerSpriteX, playerSpriteY);
    player.sprite.zIndex = player.y;

    if(player.velocity.isZero() && player.animationName !== 'idle') setPlayerAnimation('idle');
    else if(!player.velocity.isZero() && player.animationName !== 'run') setPlayerAnimation('run');

    if(player.velocity.x !== 0) player.sprite.scale.set(player.velocity.x >= 0 ? 1 : -1, 1);

    player.sprite.update(ticker);
}

function movePlayer(deltaMS) {
    player.velocity.x = eventManager.hasEvent('Player', InputEvents.KeyD) - eventManager.hasEvent('Player', InputEvents.KeyA);
    player.velocity.y = eventManager.hasEvent('Player', InputEvents.KeyS) - eventManager.hasEvent('Player', InputEvents.KeyW);
    if(player.velocity.y !== 0 && player.velocity.x !== 0) {
        player.velocity.x *= 0.707106; //sin 45 degree
        player.velocity.y *= 0.707106; //cos 45 degree
    }
    player.velocity.scale(player.speed * (deltaMS / 1000));

    player.x += player.velocity.x;
    player.y += player.velocity.y;

    player.body.newPosition.x = player.x;
    player.body.newPosition.y = player.y;
    Matter.Body.setPosition(player.body, player.body.newPosition);
}

function playerAttack() {
    const mouseClick = eventManager.getThenClear('Player', InputEvents.MouseClick);
    if(mouseClick && calendar.getTotalMS() > player.lastFireTime + player.fireRateInMillis) {
        const aimX = camera.toGlobalPixelX(mouseClick.clientX);
        const aimY = camera.toGlobalPixelY(mouseClick.clientY);
        createFireball(player.x, player.y - player.sprite.height / 2, aimX, aimY, Config.fireball.lifeTimeInMillis, Config.fireball.speed, Config.fireball.damage);

        player.lastFireTime = calendar.getTotalMS();
    }
}


function createExplosionSprite() {
    const spritesheet = Assets.get(objectTypes.explosion);
    const explosionSprite = new AnimatedSprite(spritesheet.animations['explode'], false);
    explosionSprite.animationSpeed = spritesheet.data.animationsConfig['explode'].frameRate;
    explosionSprite.loop = spritesheet.data.animationsConfig['explode'].loop;
    explosionSprite.anchor.set(0.5, 1);
    explosionSprite.scale.set(Config.explosion.spriteScale);
    return explosionSprite;
}

function createExplosion(globalPixelX, globalPixelY) {
    const explosion = allExplosions.acquire(() => ({ type: objectTypes.explosion, sprite: createExplosionSprite()}));
    const spriteX = gridStore.localPixelXInGrid(globalPixelX);
    const spriteY = gridStore.localPixelYInGrid(globalPixelY);
    explosion.sprite.position.set(spriteX, spriteY);
    explosion.sprite.zIndex = globalPixelY;
    explosion.sprite.gotoAndPlay(0);

    objectsSpriteContainer.addChild(explosion.sprite);
    explosion.sprite.onComplete = () => removeExplosion(explosion);
}

function removeExplosion(explosion) {
    explosion.sprite.removeFromParent();
    allExplosions.release(explosion);
}

function updateAllExplosionsView() {
    allExplosions.forEachUsed(explosion => explosion.sprite.update(ticker));
}


function createFireballSprite() {
    const spritesheet = Assets.get(objectTypes.fireball);
    const fireballSprite = new AnimatedSprite(spritesheet.animations['fly'], false);
    fireballSprite.animationSpeed = spritesheet.data.animationsConfig['fly'].frameRate;
    fireballSprite.loop = spritesheet.data.animationsConfig['fly'].loop;
    fireballSprite.play();
    fireballSprite.anchor.set(1, 0.5);
    fireballSprite.scale.set(Config.fireball.spriteScale);
    return fireballSprite;
}

function createFireballPhysicsBody(globalPixelX, globalPixelY, owner) {
    const body = Matter.Bodies.circle(globalPixelX - Config.fireball.bodyRadius, globalPixelY, Config.fireball.bodyRadius);
    body.newPosition = { x: globalPixelX, y: globalPixelY };
    Matter.Body.setCentre(body, body.newPosition);
    body.owner = owner;
    return body;
}

function createFireball(globalPixelX, globalPixelY, globalAimPixelX, globalAimPixelY, lifeTimeInMillis, speed, damage) {
    let fireball = allFireballs.acquire(() => {
        const newFireball = {
            type: objectTypes.fireball,
            velocity: new Vector(),
            sprite: createFireballSprite()
        };
        newFireball.body = createFireballPhysicsBody(globalPixelX, globalPixelY, newFireball);
        return newFireball;
    });
    fireball.x = globalPixelX;
    fireball.y = globalPixelY;
    fireball.lifeTimeInMillis = lifeTimeInMillis;
    fireball.speed = speed;
    fireball.damage = damage;
    fireball.velocity.set(globalAimPixelX - globalPixelX, globalAimPixelY - globalPixelY);

    fireball.body.newPosition.x = globalPixelX;
    fireball.body.newPosition.y = globalPixelY;
    Matter.Body.setPosition(fireball.body, fireball.body.newPosition);

    objectsSpriteContainer.addChild(fireball.sprite);
    allPhysicsBodies.addLast(fireball.body);
}

function removeFireball(fireball) {
    fireball.sprite.removeFromParent();
    allFireballs.release(fireball);
    allPhysicsBodies.quickRemove(fireball.body);
}

function updateAllFireballsView() {
    allFireballs.forEachUsed(fireball => {
        const fireballSpriteX = gridStore.localPixelXInGrid(fireball.x);
        const fireballSpriteY = gridStore.localPixelYInGrid(fireball.y);
        fireball.sprite.position.set(fireballSpriteX, fireballSpriteY);
        fireball.sprite.zIndex = fireball.y + Config.fireball.zIndexOffset;
        fireball.sprite.rotation = fireball.velocity.getAngleInRadian();

        fireball.sprite.update(ticker);
    });
}

function moveFireball(fireball, deltaMS) {
    fireball.velocity.normalize().scale(fireball.speed * (deltaMS / 1000));
    fireball.x += fireball.velocity.x;
    fireball.y += fireball.velocity.y;

    fireball.body.newPosition.x = fireball.x;
    fireball.body.newPosition.y = fireball.y;
    Matter.Body.setPosition(fireball.body, fireball.body.newPosition);
    Matter.Body.setAngle(fireball.body, fireball.velocity.getAngleInRadian());
}

function updateAllFireballs(deltaMS) {
    allFireballs.forEachUsed(fireball => {
        moveFireball(fireball, deltaMS);

        fireball.lifeTimeInMillis -= deltaMS;
        if(fireball.lifeTimeInMillis <= 0) {
            removeFireball(fireball);
            createExplosion(fireball.x, fireball.y);
        }
    });
}


function createSlimeSprite() {
    const slimeSprite = new AnimatedSprite(Assets.get(objectTypes.slime).animations['slime_idle'], false);
    slimeSprite.anchor.set(0.5, 1);
    slimeSprite.scale.set(Config.slime.spriteScale);
    return slimeSprite;
}

function createSlimePhysicsBody(globalPixelX, globalPixelY, owner) {
    const body = Matter.Bodies.rectangle(globalPixelX, globalPixelY - Config.slime.bodyHeight / 2, Config.slime.bodyWidth, Config.slime.bodyHeight);
    body.newPosition = { x: globalPixelX, y: globalPixelY };
    Matter.Body.setCentre(body, body.newPosition);
    body.owner = owner;
    return body;
}

function createSlime(globalPixelX, globalPixelY, chunk) {
    const slime = {
        type: objectTypes.slime,
        x: globalPixelX,
        y: globalPixelY,
        spawnPointX: globalPixelX,
        spawnPointY: globalPixelY,
        aimX: globalPixelX,
        aimY: globalPixelY,
        speed: Config.slime.speed,
        state: slimeStates.idle,
        idleDurationInMS: Config.slime.idleDurationInSec * 1000,
        roamingDurationInMS: Config.slime.roamingDurationInSec * 1000,
        velocity: new Vector(),
        sprite: createSlimeSprite()
    };
    slime.body = createSlimePhysicsBody(globalPixelX, globalPixelY, slime);

    chunk.addToChunk(slime, objectTypes.slime);
    objectsSpriteContainer.addChild(slime.sprite);
    setSlimeAnimation(slime, 'slime_idle');
    allPhysicsBodies.addLast(slime.body);
}

function spawnSlimes(deltaMS) {
    if(calendar.isCurrentPhaseBetween(Config.slime.spawnDayPhaseStart, Config.slime.spawnDayPhaseEnd) && spawnSlimeTimer.tick(deltaMS)) {
        for(let chunk of gridStore.chunks) {
            if(chunk.hasSlimeSpawner && gridStore.countByTypeInChunkRadius(objectTypes.slime, chunk.chunkX, chunk.chunkY, 2) < Config.slime.maxSlimesInArea) {
                const x = Math.randomIntegerInRange(chunk.pixelLeft, chunk.pixelRight);
                const y = Math.randomIntegerInRange(chunk.pixelTop, chunk.pixelBottom);
                createSlime(x, y, chunk);
            }
        }
    }
}

function setSlimeAnimation(slime, animationName) {
    const spritesheet = Assets.get(objectTypes.slime);
    const texture = spritesheet.animations[animationName];
    if(texture) {
        const animationConfig = spritesheet.data.animationsConfig[animationName];
        slime.sprite.textures = texture;
        slime.sprite.animationSpeed = animationConfig.frameRate;
        slime.sprite.loop = animationConfig.loop;
        slime.sprite.gotoAndPlay(0);
        slime.animationName = animationName;
    } else {
        throw 'Invalid slime animation name: ' + animationName;
    }
}

function updateAllSlimesView() {
    gridStore.forEachObjWithType(objectTypes.slime, slime => {
        const spriteX = gridStore.localPixelXInGrid(slime.x);
        const spriteY = gridStore.localPixelYInGrid(slime.y);
        slime.sprite.position.set(spriteX, spriteY);
        slime.sprite.zIndex = slime.y;

        slime.sprite.update(ticker);
    });
}

function choseNextRandomAimIfNeeded(slime) {
    const distanceX = Math.abs(slime.x - slime.aimX);
    const distanceY = Math.abs(slime.y - slime.aimY);
    if(distanceX <= 20 && distanceY <= 20) {
        const nextAimX = Math.randomIntegerInRange(slime.spawnPointX - Config.slime.roamingRadiusInPixels, slime.spawnPointX + Config.slime.roamingRadiusInPixels);
        const nextAimY = Math.randomIntegerInRange(slime.spawnPointY - Config.slime.roamingRadiusInPixels, slime.spawnPointY + Config.slime.roamingRadiusInPixels);
        slime.aimX = Math.clamp(nextAimX, gridStore.border.pixelLeft, gridStore.border.pixelRight);
        slime.aimY = Math.clamp(nextAimY, gridStore.border.pixelTop, gridStore.border.pixelBottom);

        slime.velocity.set(slime.aimX - slime.x, slime.aimY - slime.y);
    }
}

function changeChunk(slime, oldX, oldY, newX, newY) {
    const currentChunk = gridStore.getChunkByPixel(oldX, oldY);
    const nextChunk = gridStore.getChunkByPixel(newX, newY);

    if (currentChunk === nextChunk) return;

    currentChunk?.removeFromChunk(slime, objectTypes.slime);
    nextChunk?.addToChunk(slime, objectTypes.slime);
}

function moveSlime(slime, deltaMS) {
    const oldX = slime.x;
    const oldY = slime.y;
    slime.velocity.normalize().scale(slime.speed * (deltaMS / 1000));
    slime.x += slime.velocity.x;
    slime.y += slime.velocity.y;
    changeChunk(slime, oldX, oldY, slime.x, slime.y);

    slime.body.newPosition.x = slime.x;
    slime.body.newPosition.y = slime.y;
    Matter.Body.setPosition(slime.body, slime.body.newPosition);
}

function updateAllSlimes(deltaMS) {
    gridStore.forEachObjWithType(objectTypes.slime, slime => {
        if(slime.state === slimeStates.idle) {
            slime.idleDurationInMS -= deltaMS;
            if(slime.idleDurationInMS <= 0) {
                slime.state = slimeStates.roam;
                slime.roamingDurationInMS = Config.slime.roamingDurationInSec * 1000;
                setSlimeAnimation(slime, 'slime_run');
            }
        } else if(slime.state === slimeStates.roam) {
            if(Math.inRange(slime.sprite.currentFrame, 6, 8)) {
                moveSlime(slime, deltaMS);
            } else {
                choseNextRandomAimIfNeeded(slime);
            }

            slime.roamingDurationInMS -= deltaMS;
            if(slime.roamingDurationInMS <= 0) {
                slime.state = slimeStates.idle;
                slime.idleDurationInMS = Config.slime.idleDurationInSec * 1000;
                setSlimeAnimation(slime, 'slime_idle');
            }
        } else if(slime.state === slimeStates.chase) {

        } else if(slime.state === slimeStates.attack) {

        }
    });
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
    const treeSpriteX = gridStore.localPixelXInGrid(treeMeta.globalPixelX);
    const treeSpriteY = gridStore.localPixelYInGrid(treeMeta.globalPixelY);
    treeSprite.position.set(treeSpriteX, treeSpriteY);
    treeSprite.zIndex = treeMeta.globalPixelY;
    return treeSprite;
}

function createTree(treeMeta) {
    return {
        type: treeMeta.treeType,
        x: treeMeta.globalPixelX,
        y: treeMeta.globalPixelY,
        sprite: createTreeSprite(treeMeta)
    };
}

function generateChunksFor(pixelX, pixelY) {
    const result = gridStore.shiftCenterToPixel(pixelX, pixelY);

    for(let chunk of result.createdChunks) {
        chunk.tileSpritesContainer = new Container();
        chunk.tileSpritesContainer.cullable = true;
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInWorld(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInWorld(chunk.chunkY);
        chunk.tileSpritesContainer.position.set(localLeftOfChunk, localTopOfChunk);

        let countGrassTiles = 0;
        chunk.forEachTileCoords((tileGlobalX, tileGlobalY, localTileXInChunk, localTileYInChunk) => {
            mapGenerator.generate(tileGlobalX, tileGlobalY);

            const tileType = mapGenerator.getTileType();
            const tileSprite = createTileSprite(localTileXInChunk, localTileYInChunk, tileType);
            chunk.tileSpritesContainer.addChild(tileSprite);

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) {
                const tree = createTree(treeMeta);
                chunk.addToChunk(tree, tree.type);
                objectsSpriteContainer.addChild(tree.sprite);
            }

            if(tileType === objectTypes.grassTile) ++countGrassTiles;
        });
        chunk.hasSlimeSpawner = (countGrassTiles / sizeUnitsConverter.chunkAreaInTiles() >= Config.slime.minGrassTilePercentForSpawn)
                                && mapGenerator.noise(chunk.chunkX, chunk.chunkY) <= Config.slime.spawnerProbabilityInChunk;

        allTileSpritesContainer.addChild(chunk.tileSpritesContainer);
    }

    for(let chunk of result.retainedChunks) {
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInWorld(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInWorld(chunk.chunkY);
        chunk.tileSpritesContainer.position.set(localLeftOfChunk, localTopOfChunk);

        chunk.forEachObj((obj, objType) => {
            const spriteLocalX = gridStore.localPixelXInGrid(obj.x);
            const spriteLocalY = gridStore.localPixelYInGrid(obj.y);
            obj.sprite.position.set(spriteLocalX, spriteLocalY);
            obj.sprite.zIndex = obj.y;
        });
    }

    for(let chunk of result.removedChunks) {
        chunk.tileSpritesContainer.removeFromParent();
        chunk.tileSpritesContainer.destroy({ children: true });

        chunk.forEachObj((obj, objType) => {
            obj.sprite.removeFromParent();
            obj.sprite.destroy();
            allPhysicsBodies.quickRemove(obj.body);
        });
    }
}

function updateCamera() {
    camera.followIfOutOfDeadZone(player.x, player.y);
    const stageX = camera.toViewportPixelX(gridStore.border.pixelLeft);
    const stageY = camera.toViewportPixelY(gridStore.border.pixelTop);
    stage.position.set(stageX, stageY);
}


function update(ticker) {
    calendar.updateCurrentTime(ticker.deltaMS);
    movePlayer(ticker.deltaMS);
    updateAllFireballs(ticker.deltaMS);
    spawnSlimes(ticker.deltaMS);
    updateAllSlimes(ticker.deltaMS);
    playerAttack();

    if(gridStore.checkDistanceToBorder(player.x, player.y, Config.grid.loadDistanceInChunk))
        generateChunksFor(player.x, player.y);

    handleCollisions();

    updateCamera();
    updatePlayerView();
    updateAllFireballsView();
    updateAllExplosionsView();
    updateAllSlimesView();
    updateShader();
    debugDrawAllPhysicsBodies();
    renderer.render(stage);
}

async function setup() {
    //Загружаем ресурсы
    await loadTextures();
    await loadShaders();
    await loadConfig();

    //Инициализируем основные хранилища данных
    sizeUnitsConverter = new SizeUnitsConverter(Config.sizeUnitsConverter);
    mapGenerator = new MapGenerator(sizeUnitsConverter, Config.mapGenerator);
    gridStore = new GridStore(sizeUnitsConverter, Config.grid);
    eventManager = new EventManager();
    calendar = new Calendar(Config.time);
    allFireballs = new UnorderedPool();
    allExplosions = new UnorderedPool();
    spawnSlimeTimer = Timer.ofSeconds(Config.slime.spawnRateInSec);
    allPhysicsBodies = new DenseArray();

    //Создаем и настраиваем обработку коллизий
    collisionDetector = Matter.Detector.create({});

    //Создаем Renderer
    const domContainer = document.querySelector('.canvasContainer');
    renderer = new WebGLRenderer();
    await renderer.init({
        background: '#1099BB',
        width: domContainer.clientWidth,
        height: domContainer.clientHeight
    });
    domContainer.appendChild(renderer.canvas);

    //Создаем контейнеры для спрайтов и отладочную графику для физики
    camera = new Camera(domContainer.clientWidth, domContainer.clientHeight, Config.camera);
    stage = new Container();
    allTileSpritesContainer = new Container();
    objectsSpriteContainer = new Container();
    debugPhysicsGraphics = new Graphics();
    stage.addChild(allTileSpritesContainer);
    stage.addChild(objectsSpriteContainer);
    stage.addChild(debugPhysicsGraphics);

    //Создаем игровые объекты вместе с их спрайтами и физическими телами
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
    document.addEventListener('click', event => {
        eventManager.pushEvent(InputEvents.MouseClick, event);
    });

    //Инициализируем и запускаем game loop
    ticker = new Ticker();
    ticker.add((ticker) => update(ticker));
    ticker.start();
}

setup();