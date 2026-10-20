import {WebGLRenderer,  Filter, defaultFilterVert, Assets, Container, Sprite, AnimatedSprite, Ticker, Graphics, Matrix} from 'pixi.js';
import {objectTypes} from './objectTypes';
import {SizeUnitsConverter} from './sizeUnitsConverter';
import {GridStore} from './gridStore';
import {MapGenerator} from './mapGenerator';
import {EventManager, InputEvents} from './eventManager';
import {Vector} from './vector';
import {Camera} from './camera';
import {Calendar, dayPhases} from './calendar';
import {UnorderedPool} from './unorderedPool';
import {IntervalTimer} from './util';
import {CollisionManager} from './collisions';

let Config;
let sizeUnitsConverter;
let gridStore;
let mapGenerator;
let eventManager;
let calendar;
let player;
let allPools;
const slimeStates = Object.freeze({
    idle: 'idle',
    roam: 'roam',
    chase: 'chase',
    attack: 'attack'
});
let spawnSlimeTimer;

let collisionManager;

let minimap;

let renderer;
let stage;
let ticker;
let camera;
let allTileSpritesContainer;
let objectsSpriteContainer;
let debugPhysicsGraphics;
let gameObjects;

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
    let transitionFraction = 0;
    switch(calendar.getCurrentDayPhase()) {
        case dayPhases.morning:
            uniforms.uDayPhase = 1;
            transitionFraction = Config.time.morningPhaseTransitionFraction;
            break;
        case dayPhases.afternoon:
            uniforms.uDayPhase = 2;
            transitionFraction = Config.time.afternoonPhaseTransitionFraction;
            break;
        case dayPhases.evening:
            uniforms.uDayPhase = 3;
            transitionFraction = Config.time.eveningPhaseTransitionFraction;
            break;
        case dayPhases.night:
            uniforms.uDayPhase = 4;
            transitionFraction = Config.time.nightPhaseTransitionFraction;
            break;
    }
    uniforms.uIntensity =  Math.max(0, (currentDayPhaseProgress - (1 - transitionFraction)) / transitionFraction);
}


function setPositionInObjectsSpriteContainer(sprite, x, y) {
    const spriteX = gridStore.localPixelXInGrid(x);
    const spriteY = gridStore.localPixelYInGrid(y);
    sprite.position.set(spriteX, spriteY);
}


function debugDrawAllPhysicsBodies() {
    debugPhysicsGraphics.clear().setStrokeStyle({ width: 2, color: 0x00ff00 });

    collisionManager.forEachBody(body => {
        const width = body.bounds.max.x - body.bounds.min.x;
        const height = body.bounds.max.y - body.bounds.min.y;

        if(body.circleRadius > 0) {
            const centerX = body.bounds.min.x + width / 2;
            const centerY = body.bounds.min.y + height / 2;
            const x = gridStore.localPixelXInGrid(centerX);
            const y = gridStore.localPixelYInGrid(centerY);
            debugPhysicsGraphics.circle(x, y, body.circleRadius).stroke();
        } else {
            const x = gridStore.localPixelXInGrid(body.bounds.min.x);
            const y = gridStore.localPixelYInGrid(body.bounds.min.y);
            debugPhysicsGraphics.rect(x, y, width, height).stroke();
        }
    });
}

function allCollisionHandler(objA, objB, bodyA, bodyB) {
    if(objA.type === objectTypes.slime && objB.type === objectTypes.fireball) {
        handleFireballAndSlimeCollision(objB, objA);
    } else if(objA.type === objectTypes.fireball && objB.type === objectTypes.slime) {
        handleFireballAndSlimeCollision(objA, objB);
    }
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
    player.body = collisionManager.createRectCollider(playerConfig.pixelX, playerConfig.pixelY, Config.player.bodyWidth, Config.player.bodyHeight, 0.5, 1, player);

    eventManager.registerInbox('Player', InputEvents.KeyW, InputEvents.KeyA, InputEvents.KeyS, InputEvents.KeyD, InputEvents.MouseClick);
    objectsSpriteContainer.addChild(player.sprite);
    setPlayerAnimation('idle');
    collisionManager.registerBody(player.body);
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
    setPositionInObjectsSpriteContainer(player.sprite, player.x, player.y);
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
    player.velocity.scaleBy(player.speed * (deltaMS / 1000));

    player.x += player.velocity.x;
    player.y += player.velocity.y;

    collisionManager.setPosition(player.body, player.x, player.y);
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
    const explosion = allPools[objectTypes.explosion].acquire(() => ({ type: objectTypes.explosion, sprite: createExplosionSprite()}));
    setPositionInObjectsSpriteContainer(explosion.sprite, globalPixelX, globalPixelY);
    explosion.sprite.zIndex = globalPixelY;
    explosion.sprite.gotoAndPlay(0);

    objectsSpriteContainer.addChild(explosion.sprite);
    explosion.sprite.onComplete = () => removeExplosion(explosion);
}

function removeExplosion(explosion) {
    explosion.sprite.removeFromParent();
    allPools[objectTypes.explosion].release(explosion);
}

function updateAllExplosionsView() {
    allPools[objectTypes.explosion].forEachUsed(explosion => explosion.sprite.update(ticker));
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

function createFireball(globalPixelX, globalPixelY, globalAimPixelX, globalAimPixelY, lifeTimeInMillis, speed, damage) {
    let fireball = allPools[objectTypes.fireball].acquire(() => {
        const newFireball = {
            type: objectTypes.fireball,
            velocity: new Vector(),
            sprite: createFireballSprite()
        };
        newFireball.body = collisionManager.createCircleCollider(globalPixelX, globalPixelY, Config.fireball.bodyRadius, 1, 0.5, newFireball);
        return newFireball;
    });
    fireball.x = globalPixelX;
    fireball.y = globalPixelY;
    fireball.lifeTimeInMillis = lifeTimeInMillis;
    fireball.speed = speed;
    fireball.damage = damage;
    fireball.velocity.set(globalAimPixelX - globalPixelX, globalAimPixelY - globalPixelY);
    collisionManager.setPosition(fireball.body, globalPixelX, globalPixelY);

    objectsSpriteContainer.addChild(fireball.sprite);
    collisionManager.registerBody(fireball.body);
}

function removeFireball(fireball) {
    fireball.sprite.removeFromParent();
    allPools[objectTypes.fireball].release(fireball);
    collisionManager.unregisterBody(fireball.body);
}

function updateAllFireballsView() {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
        setPositionInObjectsSpriteContainer(fireball.sprite, fireball.x, fireball.y);
        fireball.sprite.zIndex = fireball.y + Config.fireball.zIndexOffset;
        fireball.sprite.rotation = fireball.velocity.getAngleInRadian();

        fireball.sprite.update(ticker);
    });
}

function moveFireball(fireball, deltaMS) {
    fireball.velocity.normalize().scaleBy(fireball.speed * (deltaMS / 1000));
    fireball.x += fireball.velocity.x;
    fireball.y += fireball.velocity.y;

    collisionManager.setPositionAndAngle(fireball.body, fireball.x, fireball.y, fireball.velocity.getAngleInRadian());
}

function updateAllFireballs(deltaMS) {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
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

function createSlime(globalPixelX, globalPixelY, chunk) {
    const slime = allPools[objectTypes.slime].acquire(() => {
        const result = {
            type: objectTypes.slime,
            speed: Config.slime.speed,
            velocity: new Vector(),
            sprite: createSlimeSprite()
        };
        result.body = collisionManager.createRectCollider(globalPixelX, globalPixelY, Config.slime.bodyWidth, Config.slime.bodyHeight, 0.5, 1, result);
        return result;
    });
    slime.x = globalPixelX;
    slime.y = globalPixelY;
    slime.spawnPointX = globalPixelX;
    slime.spawnPointY = globalPixelY;
    slime.aimX = globalPixelX;
    slime.aimY = globalPixelY;
    slime.state = slimeStates.idle;
    slime.idleDurationInMS = Config.slime.idleDurationInSec * 1000;
    slime.roamingDurationInMS = Config.slime.roamingDurationInSec * 1000;
    slime.velocity.set(0, 0);
    collisionManager.setPosition(slime.body, globalPixelX, globalPixelY);
    setSlimeAnimation(slime, 'slime_idle');

    chunk.addToChunk(slime, objectTypes.slime);
    objectsSpriteContainer.addChild(slime.sprite);
    collisionManager.registerBody(slime.body);
}

function removeSlime(slime) {
    slime.sprite.removeFromParent();
    collisionManager.unregisterBody(slime.body);
    allPools[objectTypes.slime].release(slime);
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
    allPools[objectTypes.slime].forEachUsed(slime => {
        setPositionInObjectsSpriteContainer(slime.sprite, slime.x, slime.y);
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
    slime.velocity.normalize().scaleBy(slime.speed * (deltaMS / 1000));
    slime.x += slime.velocity.x;
    slime.y += slime.velocity.y;
    changeChunk(slime, oldX, oldY, slime.x, slime.y);

    collisionManager.setPosition(slime.body, slime.x, slime.y);
}

function updateAllSlimes(deltaMS) {
    allPools[objectTypes.slime].forEachUsed(slime => {
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

        if(!gridStore.isPixelInMap(slime.x, slime.y))
            removeSlime(slime);
    });
}


function createTileSprite(tileType) {
    const tileSprite = new Sprite(Assets.get(tileType));
    tileSprite.setSize(sizeUnitsConverter.tileWidthInPixels(), sizeUnitsConverter.tileHeightInPixels());
    return tileSprite;
}

function createTile(leftPixelOfTile, topPixelOfTile, localTileXInChunk, localTileYInChunk, tileType, chunk) {
    const tile = allPools[tileType].acquire(() => ({
        type: tileType,
        sprite: createTileSprite(tileType)
    }));
    tile.x = leftPixelOfTile;
    tile.y = topPixelOfTile;
    const topTilePixel = sizeUnitsConverter.topPixelOfTile(localTileYInChunk);
    const leftTilePixel = sizeUnitsConverter.leftPixelOfTile(localTileXInChunk);
    tile.sprite.position.set(leftTilePixel, topTilePixel);

    chunk.tileSpritesContainer.addChild(tile.sprite);
    chunk.getTileContainerByLocalCoords(localTileXInChunk, localTileYInChunk).tile = tile;
}

function createTreeSprite(treeMeta) {
    const treeSprite = new Sprite(Assets.get(treeMeta.treeType));
    treeSprite.anchor.set(0.5, 1);
    return treeSprite;
}

function createTree(treeMeta, chunk) {
    const tree = allPools[treeMeta.treeType].acquire(() => ({
        type: treeMeta.treeType,
        sprite: createTreeSprite(treeMeta)
    }));
    tree.x = treeMeta.globalPixelX;
    tree.y = treeMeta.globalPixelY;
    setPositionInObjectsSpriteContainer(tree.sprite, tree.x, tree.y);
    tree.sprite.zIndex = tree.y;

    chunk.addToChunk(tree, tree.type);
    objectsSpriteContainer.addChild(tree.sprite);
}

function generateChunksFor(pixelX, pixelY) {
    const result = gridStore.shiftCenterToPixel(pixelX, pixelY);

    for(let chunk of result.retainedChunks) {
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInGrid(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInGrid(chunk.chunkY);
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
        chunk.tileSpritesContainer.destroy({ children: false });

        chunk.forEachObj((obj, objType) => {
            obj.sprite.removeFromParent();
            collisionManager.unregisterBody(obj.body);
            allPools[obj.type].release(obj);
        });
        chunk.forEachTileContainer((globalTileX, globalTileY, localTileXInChunk, localTileYInChunk, tileContainer) => {
            const tile = tileContainer.tile;
            allPools[tile.type].release(tile);
        });
    }

    for(let chunk of result.createdChunks) {
        chunk.tileSpritesContainer = new Container();
        chunk.tileSpritesContainer.cullable = true;
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInGrid(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInGrid(chunk.chunkY);
        chunk.tileSpritesContainer.position.set(localLeftOfChunk, localTopOfChunk);

        let countGrassTiles = 0;
        chunk.forEachTileCoords((tileGlobalX, tileGlobalY, localTileXInChunk, localTileYInChunk) => {
            mapGenerator.generate(tileGlobalX, tileGlobalY);

            const tileType = mapGenerator.getTileType();
            createTile(
                sizeUnitsConverter.leftPixelOfTile(tileGlobalX),
                sizeUnitsConverter.topPixelOfTile(tileGlobalY),
                localTileXInChunk,
                localTileYInChunk,
                tileType,
                chunk
            );

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) createTree(treeMeta, chunk);

            if(tileType === objectTypes.grassTile) ++countGrassTiles;
        });
        chunk.hasSlimeSpawner = (countGrassTiles / sizeUnitsConverter.chunkAreaInTiles() >= Config.slime.minGrassTilePercentForSpawn)
            && mapGenerator.noise(chunk.chunkX, chunk.chunkY) <= Config.slime.spawnerProbabilityInChunk;

        allTileSpritesContainer.addChild(chunk.tileSpritesContainer);
    }
}


function createMinimap(viewportWidth, viewportHeight, minimapConfig) {
    eventManager.registerInbox('Minimap', InputEvents.KeyM, InputEvents.MouseWheel, InputEvents.MouseDown, InputEvents.MouseUp, InputEvents.MouseMove);

    minimap = {
        container: new Container(),
        staticObjects: new Graphics(),
        viewportWidth,
        viewportHeight,
        scale: minimapConfig.defaultScale,
        scroll: { isScrolling: false, scrollRecentX: 0, scrollRecentY: 0 }
    };

    minimap.container.addChild(minimap.staticObjects);
    minimap.container.visible = false;

    resizeMinimap(viewportWidth, viewportHeight);
}

function resizeMinimap(viewportWidth, viewportHeight) {
    minimap.viewportWidth = viewportWidth;
    minimap.viewportHeight = viewportHeight;
    minimap.sizeInPixel = Math.min(viewportWidth, viewportHeight) * minimap.scale;
    minimap.container.setSize(minimap.sizeInPixel, minimap.sizeInPixel);
    alignMinimapToCenter();
}

function alignMinimapToCenter() {
    minimap.left = (minimap.viewportWidth - minimap.sizeInPixel) / 2;
    minimap.top = (minimap.viewportHeight - minimap.sizeInPixel) / 2;
    minimap.container.position.set(minimap.left, minimap.top);
}

function repaintMinimap() {
    if(!minimap.container.visible) return;

    minimap.staticObjects.clear();

    drawTilesOnMinimap(objectTypes.sandTile, 0xFFFF00);
    drawTilesOnMinimap(objectTypes.waterTile, 0x000080);
    drawTilesOnMinimap(objectTypes.grassTile, 0x41980A);

    drawObjectsOnMinimap(
        objectTypes.littleOak,
        objectTypes.heightOak,
        objectTypes.bigOak,
        objectTypes.deadLittleOak,
        objectTypes.deadHeightOak,
        objectTypes.deadBigOak
    );

    minimap.container.setSize(minimap.sizeInPixel, minimap.sizeInPixel);
}

function drawTilesOnMinimap(tileType, color) {
    allPools[tileType].forEachUsed(tile => {
        const viewX = gridStore.localPixelXInGrid(tile.x);
        const viewY = gridStore.localPixelYInGrid(tile.y);
        minimap.staticObjects.rect(viewX, viewY, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);
    });
    minimap.staticObjects.fill(color);
}

function drawObjectsOnMinimap(...objTypes) {
    const allObjects = [];
    objTypes.forEach(objType => allPools[objType].copyUsedItemsTo(allObjects));
    allObjects.sort((a, b) => a.y - b.y);

    const matrixByObjType = {};
    for(let obj of allObjects) {
        const texture = Assets.get(obj.type);
        const { frame, source } = texture;
        const matrix = matrixByObjType[obj.type] ??= new Matrix(frame.width / source.width, 0, 0, frame.height / source.height, frame.x / source.width, frame.y / source.height).invert();

        const viewX = gridStore.localPixelXInGrid(obj.x) - texture.width * obj.sprite.anchor.x;
        const viewY = gridStore.localPixelYInGrid(obj.y) - texture.height * obj.sprite.anchor.y;
        minimap.staticObjects.rect(viewX, viewY, texture.width, texture.height).fill({ texture, matrix });
    }
}

function switchMinimapVisibility() {
    if(eventManager.hasThenClear('Minimap', InputEvents.KeyM)) {
        minimap.container.visible = !minimap.container.visible;
        repaintMinimap();
        alignMinimapToCenter();
    }
}

function scaleMinimap() {
    if(!minimap.container.visible) return;

    const event = eventManager.getThenClear('Minimap', InputEvents.MouseWheel);
    if(!event) return;

    minimap.scale += event.deltaY > 0 ? -0.1 : 0.1;
    minimap.scale = Math.clamp(minimap.scale, Config.minimap.minScale, Config.minimap.maxScale);
    resizeMinimap(minimap.viewportWidth, minimap.viewportHeight);
}

function scrollMinimap() {
    const mouseDownEvent = eventManager.getThenClear('Minimap', InputEvents.MouseDown);
    if(mouseDownEvent) {
        minimap.scroll.isScrolling = true;
        minimap.scroll.scrollRecentX = mouseDownEvent.clientX;
        minimap.scroll.scrollRecentY = mouseDownEvent.clientY;
    }

    const mouseMoveEvent = eventManager.getThenClear('Minimap', InputEvents.MouseMove);
    if(mouseMoveEvent && minimap.scroll.isScrolling) {
        minimap.left += mouseMoveEvent.clientX - minimap.scroll.scrollRecentX;
        minimap.top += mouseMoveEvent.clientY - minimap.scroll.scrollRecentY;
        minimap.container.position.set(minimap.left, minimap.top);
        minimap.scroll.scrollRecentX = mouseMoveEvent.clientX;
        minimap.scroll.scrollRecentY = mouseMoveEvent.clientY;
    }

    const mouseUpEvent = eventManager.getThenClear('Minimap', InputEvents.MouseUp);
    if(mouseUpEvent) {
        minimap.scroll.isScrolling = false;
    }
}


function updateCamera() {
    camera.followIfOutOfDeadZone(player.x, player.y);
    const stageX = camera.toViewportPixelX(gridStore.border.pixelLeft);
    const stageY = camera.toViewportPixelY(gridStore.border.pixelTop);
    gameObjects.position.set(stageX, stageY);
}


function update(ticker) {
    //Обновляем модель
    calendar.updateCurrentTime(ticker.deltaMS);
    movePlayer(ticker.deltaMS);
    updateAllFireballs(ticker.deltaMS);
    spawnSlimes(ticker.deltaMS);
    updateAllSlimes(ticker.deltaMS);
    playerAttack();

    //Подгружаем и выгружаем часть карты при необходимости
    if(gridStore.checkDistanceToBorder(player.x, player.y, Config.grid.loadDistanceInChunk)) {
        generateChunksFor(player.x, player.y);
        repaintMinimap();
    }

    //Поиск коллизий
    collisionManager.handleCollisions(allCollisionHandler);

    //Отрисовываем игровые объекты
    updateCamera();
    updatePlayerView();
    updateAllFireballsView();
    updateAllExplosionsView();
    updateAllSlimesView();

    //Обновляем шейдеры
    updateShader();

    //Перерисовываем миникарту по необходимости
    switchMinimapVisibility();
    scaleMinimap();
    scrollMinimap();

    //Отрисовываем границы физических тел для дебага физики
    //debugDrawAllPhysicsBodies();

    renderer.render(stage);
}

async function setup() {
    //Загружаем ресурсы
    await loadTextures();
    await loadShaders();
    await loadConfig();

    //Инициализируем основные хранилища данных и модель
    sizeUnitsConverter = new SizeUnitsConverter(Config.sizeUnitsConverter);
    mapGenerator = new MapGenerator(sizeUnitsConverter, Config.mapGenerator);
    gridStore = new GridStore(sizeUnitsConverter, Config.grid);
    eventManager = new EventManager();
    calendar = new Calendar(Config.time);
    allPools = Object.fromEntries(
        Object.values(objectTypes)
            .filter(objType => objType !== objectTypes.player)
            .map(objType => [objType, new UnorderedPool()])
    );
    spawnSlimeTimer = IntervalTimer.ofSeconds(Config.slime.spawnRateInSec);

    //Подготавливаем обработку коллизий
    collisionManager = new CollisionManager();

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
    gameObjects = new Container();
    createMinimap(domContainer.clientWidth, domContainer.clientHeight, Config.minimap);
    allTileSpritesContainer = new Container();
    objectsSpriteContainer = new Container();
    debugPhysicsGraphics = new Graphics();
    gameObjects.addChild(allTileSpritesContainer, objectsSpriteContainer, debugPhysicsGraphics);
    stage.addChild(gameObjects, minimap.container);

    //Создаем игровые объекты вместе с их спрайтами и физическими телами
    createPlayer(Config.player);
    generateChunksFor(player.x, player.y);
    camera.centerOn(player.x, player.y);

    //Подключаем шейдеры
    nightShader = createShader();
    gameObjects.filters = [nightShader];

    //Подписываемся на внешние события
    window.addEventListener('resize', () => {
        camera.resize(domContainer.clientWidth, domContainer.clientHeight);
        renderer.resize(domContainer.clientWidth, domContainer.clientHeight);
        resizeMinimap(domContainer.clientWidth, domContainer.clientHeight);
    });
    document.addEventListener('keydown', event => {
        eventManager.pushEvent(event.code, event);
    });
    document.addEventListener('keyup', event => {
        eventManager.clearEventForAll(event.code);
    });
    document.addEventListener('click', event => {
        if(!minimap.container.visible) eventManager.pushEvent(InputEvents.MouseClick, event);
    });
    document.addEventListener('wheel', event => {
        eventManager.pushEvent(InputEvents.MouseWheel, event);
    });
    document.addEventListener('mousedown', event => {
        eventManager.pushEvent(InputEvents.MouseDown, event);
    });
    document.addEventListener('mouseup', event => {
        eventManager.pushEvent(InputEvents.MouseUp, event);
    });
    document.addEventListener('mousemove', event => {
        eventManager.pushEvent(InputEvents.MouseMove, event);
    });

    //Инициализируем и запускаем game loop
    ticker = new Ticker();
    ticker.add((ticker) => update(ticker));
    ticker.start();
}

setup();