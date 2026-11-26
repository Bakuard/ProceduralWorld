import {WebGLRenderer, Assets, Container, Sprite, AnimatedSprite, Ticker, Graphics, Matrix} from 'pixi.js';
import {objectTypes} from './objectTypes';
import {SizeUnitsConverter} from './sizeUnitsConverter';
import {GridStore} from './gridStore';
import {MapGenerator} from './mapGenerator';
import {DOMEventUtil, EventManager, InputEvents} from './eventManager';
import {Vector} from './vector';
import {Camera} from './camera';
import {Calendar} from './calendar';
import {UnorderedPool} from './unorderedPool';
import {IntervalTimer, TimestampIntervalTimer} from './timers';
import {CollisionManager} from './collisions';
import {LightManager} from "./lighting";
import {UIManager} from "./ui";
import {NoiseGenerator} from "./noise";
import './util.js';
import {TiledParser} from "./tiledParser";

let globalGameData = {
    config: {},
    allPools: {},
    tiledParser: null,
    uiManager: null,
    lightManager: null,
    collisionManager: null,

    ticker: null,

    view: {
        domContainer: null,
        renderer: null,
        stage: null,
        allTileSpritesContainer: null,
        objectsSpriteContainer: null,
        debugPhysicsGraphics: null,
        gameObjects: null
    }
}

let sessionData = {
    calendar: null,
    player: null,
    noiseGenerator: null,
    eventManager: null,
    domEventUtil: null,
    camera: null,
    currentScene: null
}


const slimeStates = Object.freeze({
    idle: 'idle',
    roam: 'roam',
    chase: 'chase',
    attack: 'attack'
});


function setSpritePosition(sprite, x, y, camera, container = null, zIndexOffset = 0) {
    const parent = sprite.parent ?? container;
    const viewportX = camera.toViewportPixelX(x);
    const viewportY = camera.toViewportPixelY(y);
    parent.toLocal({ x: viewportX, y: viewportY }, undefined, sprite.position);
    sprite.zIndex = y + zIndexOffset;
}

function setAnimation(obj, animationName, onComplete = null) {
    if(obj.animationName === animationName && obj.sprite.playing) return;

    const spritesheet = Assets.get(obj.type);
    const texture = spritesheet.animations[animationName];
    if(texture) {
        const animationConfig = spritesheet.data.animationsConfig[animationName];
        obj.sprite.textures = texture;
        obj.sprite.animationSpeed = animationConfig.frameRate;
        obj.sprite.loop = animationConfig.loop;
        obj.sprite.onComplete = onComplete;
        obj.animationName = animationName;

        obj.sprite.gotoAndPlay(0);
    } else {
        throw `Invalid ${obj.type} animation name: ${animationName}`;
    }
}


function removeGameObj(obj, allPools, lightManager, collisionManager) {
    obj.sprite?.removeFromParent();
    obj.sprite?.stop?.();
    lightManager.unregisterLightPointSprite(obj.lightPoint);
    collisionManager.unregisterBody(obj.body);
    allPools[obj.type]?.release(obj);
}


function debugDrawAllPhysicsBodies(debugPhysicsGraphics, collisionManager, gridStore) {
    debugPhysicsGraphics.clear().setStrokeStyle({ width: 2, color: 0x00ff00 });

    collisionManager.forEachRegisteredBody(body => {
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

function handleFireballAndSlimeCollision(fireball, slime, allPools, gridStore, camera, objectsSpriteContainer, lightManager, collisionManager, config) {
    removeGameObj(fireball, allPools, lightManager, collisionManager);
    createExplosion(fireball.x, fireball.y, allPools, camera, objectsSpriteContainer, lightManager, collisionManager, config);

    if(fireball.owner) {
        slime.currentHealth -= fireball.damage;

        const currentChunk = gridStore.getChunkByPixel(slime.x, slime.y);
        gridStore.forEachChunkInChunkRadius(currentChunk.chunkX, currentChunk.chunkY, 1, chunk => {
            chunk.forEachObjWithType(objectTypes.slime, slimeInChunk => {
                slimeInChunk.aim = fireball.owner;
                if(slimeInChunk.state === slimeStates.idle || slimeInChunk.state === slimeStates.roam) slimeInChunk.state = slimeStates.chase;
                setAnimation(slimeInChunk, 'slime_run');
            });
        });
    }
}


function createPlayerSprite(startAnimationName) {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations[startAnimationName], false);
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createEnergyBar(config) {
    return {
        maxEnergy: config.player.energy.maxEnergy,
        currentEnergyLimit: config.player.energy.maxEnergy,
        currentEnergy: config.player.energy.maxEnergy,
        receivedDamaged: 0,
        recoveryTimerPauseInMs: 0
    };
}

function createPlayer(globalPixelX, globalPixelY, collisionManager, eventManager, objectsSpriteContainer, config) {
    const player = {
        type: objectTypes.player,
        x: globalPixelX,
        y: globalPixelY,
        speed: config.player.speed,
        fireTimer: TimestampIntervalTimer.ofMillis(config.player.fireRateInMillis),
        velocity: new Vector(),
        sprite: createPlayerSprite(config.player.startAnimation),
        energy: createEnergyBar(config)
    };
    player.body = collisionManager.createRectCollider(globalPixelX, globalPixelY, config.player.bodyWidth, config.player.bodyHeight, 0.5, 1, player);

    eventManager.registerInbox('Player', InputEvents.KeyW, InputEvents.KeyA, InputEvents.KeyS, InputEvents.KeyD, InputEvents.MouseClick);
    objectsSpriteContainer.addChild(player.sprite);
    setAnimation(player, 'idle');
    return player;
}

function placePlayerInScene(player, pixelX, pixelY, collisionManager) {
    player.x = pixelX;
    player.y = pixelY;
    player.velocity.set(0, 0);
    collisionManager.setPosition(player.body, pixelX, pixelY);
    collisionManager.registerBody(player.body, objectTypes.player);
    setAnimation(player, 'idle');
}

function destroyPlayer(player, collisionManager) {
    collisionManager.unregisterBody(player.body);
    player.sprite?.removeFromParent();
    player.sprite?.stop?.();
    player.sprite?.destroy();
}

function updatePlayerView(player, camera, ticker) {
    setSpritePosition(player.sprite, player.x, player.y, camera);

    if(player.velocity.isZero()) setAnimation(player, 'idle');
    else if(!player.velocity.isZero()) setAnimation(player, 'run');

    if(player.velocity.x !== 0) player.sprite.scale.set(player.velocity.x >= 0 ? 1 : -1, 1);

    player.sprite.update(ticker);
}

function calculatePlayerVelocity(player, eventManager, deltaMS) {
    player.velocity.x = eventManager.hasEvent('Player', InputEvents.KeyD) - eventManager.hasEvent('Player', InputEvents.KeyA);
    player.velocity.y = eventManager.hasEvent('Player', InputEvents.KeyS) - eventManager.hasEvent('Player', InputEvents.KeyW);
    if(player.velocity.y !== 0 && player.velocity.x !== 0) {
        player.velocity.x *= 0.707106; //sin 45 degree
        player.velocity.y *= 0.707106; //cos 45 degree
    }
    player.velocity.scaleBy(player.speed * (deltaMS / 1000));
}

function consumeEnergyWhileMoving(player, config, deltaMS) {
    const energyLossAmount = config.player.energy.runningEnergyLossPerSec * (deltaMS / 1000);
    if(player.energy.currentEnergy < energyLossAmount) return false;

    player.energy.currentEnergy -= energyLossAmount;
    resetRecoverEnergyTimer(player, config);
    return true;
}

function movePlayer(player, eventManager, collisionManager, config, deltaMS) {
    calculatePlayerVelocity(player, eventManager, deltaMS);

    if(player.velocity.isZero()) return;

    if(!consumeEnergyWhileMoving(player, config, deltaMS)) {
        player.velocity.set(0, 0);
        return;
    }

    player.x += player.velocity.x;
    player.y += player.velocity.y;
    collisionManager.setPosition(player.body, player.x, player.y);
}

function consumeEnergyWhileAttack(player, config) {
    if(player.energy.currentEnergy < config.player.energy.attackEnergyLossAmount) return false;

    player.energy.currentEnergy -= config.player.energy.attackEnergyLossAmount;
    resetRecoverEnergyTimer(player, config);
    return true;
}

function playerAttack(player, eventManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, collisionManager, config) {
    const mouseClick = eventManager.pullEvent('Player', InputEvents.MouseClick);
    if(mouseClick && player.fireTimer.checkThenReset(calendar.getTotalMs()) && consumeEnergyWhileAttack(player, config)) {
        const aimX = camera.toGlobalPixelX(mouseClick.clientX);
        const aimY = camera.toGlobalPixelY(mouseClick.clientY);
        createFireball(player.x, player.y - player.sprite.height / 2, aimX, aimY, config.fireball.lifeTimeInMillis, config.fireball.speed, config.fireball.damage, player, allPools, objectsSpriteContainer, lightManager, collisionManager, config);
    }
}

function resetRecoverEnergyTimer(player, config) {
    const currentEnergyPercent = player.energy.currentEnergy / player.energy.maxEnergy;
    player.energy.recoveryTimerPauseInMs = currentEnergyPercent > 0.01 ?
        config.player.energy.recoverEnergyPauseInSec * 1000 : config.player.energy.recoverEnergyPenaltyInSec * 1000;
}

function recoverEnergy(player, config, deltaMS) {
    if(player.energy.recoveryTimerPauseInMs === 0 && player.energy.currentEnergy < player.energy.currentEnergyLimit) {
        const updatedEnergyAmount = player.energy.currentEnergy + config.player.energy.recoverEnergyRatePerSec * (deltaMS / 1000);
        player.energy.currentEnergy = Math.min(updatedEnergyAmount, player.energy.currentEnergyLimit);
    }
    player.energy.recoveryTimerPauseInMs = Math.max(0, player.energy.recoveryTimerPauseInMs - deltaMS);
}

function damagePlayer(player, damage) {
    player.energy.receivedDamaged = Math.min(player.energy.maxEnergy, player.energy.receivedDamaged + damage);
    player.energy.currentEnergyLimit = Math.max(0, player.energy.currentEnergyLimit - damage);
    player.energy.currentEnergy = Math.max(0, player.energy.currentEnergy - damage);
}

function updatePlayer(player, eventManager, collisionManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, config, deltaMS) {
    movePlayer(player, eventManager, collisionManager, config, deltaMS);
    playerAttack(player, eventManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, collisionManager, config);
    recoverEnergy(player, config, deltaMS);
}

function checkGameOver(player, uiManager) {
    if(player.energy.receivedDamaged === player.energy.maxEnergy) {
        stopCurrentScene();
        removeSession();

        uiManager.showGameOverModal(() => {
            uiManager.hideGameOverModal();
            createSession();
            startCurrentScene();
        });
    }
}


function createExplosionSprite(config) {
    const explosionSprite = new AnimatedSprite(Assets.get(objectTypes.explosion).animations['explode'], false);
    explosionSprite.anchor.set(0.5, 1);
    explosionSprite.scale.set(config.explosion.spriteScale);
    return explosionSprite;
}

function createExplosion(globalPixelX, globalPixelY, allPools, camera, objectsSpriteContainer, lightManager, collisionManager, config) {
    const explosion = allPools[objectTypes.explosion].acquire(() => (
        {
            type: objectTypes.explosion,
            sprite: createExplosionSprite(config),
            lightPoint: lightManager.createLightPointSprite(config.explosion.lightPoint.radius, config.explosion.lightPoint.color)
        }
    ));
    explosion.x = globalPixelX;
    explosion.y = globalPixelY;
    setSpritePosition(explosion.sprite, globalPixelX, globalPixelY, camera, objectsSpriteContainer);
    setAnimation(explosion, 'explode', () => removeGameObj(explosion, allPools, lightManager, collisionManager));

    objectsSpriteContainer.addChild(explosion.sprite);
    lightManager.registerLightPointSprite(explosion.lightPoint);
}

function updateAllExplosionsView(allPools, lightManager, camera, ticker) {
    allPools[objectTypes.explosion].forEachUsed(explosion => {
        lightManager.setLightPointPosition(explosion.lightPoint, explosion.x, explosion.y, camera);
        explosion.sprite.update(ticker);
    });
}


function createFireballSprite(config) {
    const fireballSprite = new AnimatedSprite(Assets.get(objectTypes.fireball).animations['fly'], false);
    fireballSprite.anchor.set(1, 0.5);
    fireballSprite.scale.set(config.fireball.spriteScale);
    return fireballSprite;
}

function createFireball(globalPixelX, globalPixelY, globalAimPixelX, globalAimPixelY, lifeTimeInMillis, speed, damage, owner, allPools, objectsSpriteContainer, lightManager, collisionManager, config) {
    let fireball = allPools[objectTypes.fireball].acquire(() => {
        const newFireball = {
            type: objectTypes.fireball,
            velocity: new Vector(),
            sprite: createFireballSprite(config),
            lightPoint: lightManager.createLightPointSprite(config.fireball.lightPoint.radius, config.fireball.lightPoint.color)
        };
        newFireball.body = collisionManager.createCircleCollider(globalPixelX, globalPixelY, config.fireball.bodyRadius, 1, 0.5, newFireball);
        return newFireball;
    });
    fireball.x = globalPixelX;
    fireball.y = globalPixelY;
    fireball.lifeTimeInMillis = lifeTimeInMillis;
    fireball.speed = speed;
    fireball.damage = damage;
    fireball.owner = owner;
    fireball.velocity.set(globalAimPixelX - globalPixelX, globalAimPixelY - globalPixelY);
    collisionManager.setPosition(fireball.body, globalPixelX, globalPixelY);
    setAnimation(fireball, 'fly');

    objectsSpriteContainer.addChild(fireball.sprite);
    lightManager.registerLightPointSprite(fireball.lightPoint);
    collisionManager.registerBody(fireball.body, objectTypes.fireball);
}

function updateAllFireballsView(allPools, lightManager, camera, config, ticker) {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
        setSpritePosition(fireball.sprite, fireball.x, fireball.y, camera, null, config.fireball.zIndexOffset);
        lightManager.setLightPointPosition(fireball.lightPoint, fireball.x, fireball.y, camera);
        fireball.sprite.rotation = fireball.velocity.getAngleInRadian();

        fireball.sprite.update(ticker);
    });
}

function moveFireball(fireball, collisionManager, deltaMS) {
    fireball.velocity.normalize().scaleBy(fireball.speed * (deltaMS / 1000));
    fireball.x += fireball.velocity.x;
    fireball.y += fireball.velocity.y;

    collisionManager.setPositionAndAngle(fireball.body, fireball.x, fireball.y, fireball.velocity.getAngleInRadian());
}

function updateAllFireballs(allPools, camera, objectsSpriteContainer, lightManager, collisionManager, config, deltaMS) {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
        moveFireball(fireball, collisionManager, deltaMS);

        fireball.lifeTimeInMillis -= deltaMS;
        if(fireball.lifeTimeInMillis <= 0) {
            removeGameObj(fireball, allPools, lightManager, collisionManager);
            createExplosion(fireball.x, fireball.y, allPools, camera, objectsSpriteContainer, lightManager, collisionManager, config);
        }
    });
}


function createSlimeSprite(config) {
    const slimeSprite = new AnimatedSprite(Assets.get(objectTypes.slime).animations['slime_idle'], false);
    slimeSprite.anchor.set(0.5, 1);
    slimeSprite.scale.set(config.slime.spriteScale);
    return slimeSprite;
}

function createSlime(globalPixelX, globalPixelY, chunk, allPools, objectsSpriteContainer, collisionManager, config) {
    const slime = allPools[objectTypes.slime].acquire(() => {
        const result = {
            type: objectTypes.slime,
            speed: config.slime.speed,
            velocity: new Vector(),
            sprite: createSlimeSprite(config)
        };
        result.body = collisionManager.createRectCollider(globalPixelX, globalPixelY, config.slime.bodyWidth, config.slime.bodyHeight, 0.5, 1, result);
        return result;
    });
    slime.x = globalPixelX;
    slime.y = globalPixelY;
    slime.spawnPointX = globalPixelX;
    slime.spawnPointY = globalPixelY;
    slime.aim = { x: globalPixelX, y: globalPixelY };
    slime.state = slimeStates.idle;
    slime.currentHealth = config.slime.maxHealth;
    slime.attackTimer = IntervalTimer.ofSeconds(config.slime.attackRateInSec);
    slime.damage = config.slime.damage;
    slime.idleDurationInMS = config.slime.idleDurationInSec * 1000;
    slime.roamingDurationInMS = config.slime.roamingDurationInSec * 1000;
    slime.velocity.set(0, 0);
    collisionManager.setPosition(slime.body, globalPixelX, globalPixelY);
    setAnimation(slime, 'slime_idle');

    chunk.addToChunk(slime, objectTypes.slime);
    objectsSpriteContainer.addChild(slime.sprite);
    collisionManager.registerBody(slime.body, objectTypes.slime);
}

function removeSlime(slime, allPools, gridStore, lightManager, collisionManager) {
    removeGameObj(slime, allPools, lightManager, collisionManager);
    gridStore.getChunkByPixel(slime.x, slime.y)?.removeFromChunk(slime, objectTypes.slime);
}

function countSlimesInArea(chunkX, chunkY, gridStore) {
    let slimeCount = 0;
    gridStore.forEachChunkInChunkRadius(chunkX, chunkY, 2, chunk => slimeCount += chunk.countByTypeInChunk(objectTypes.slime));
    return slimeCount;
}

function spawnSlimes(calendar, spawnSlimeTimer, gridStore, allPools, objectsSpriteContainer, collisionManager, config, deltaMS) {
    if(calendar.isCurrentPhaseBetween(config.slime.spawnDayPhaseStart, config.slime.spawnDayPhaseEnd) && spawnSlimeTimer.tick(deltaMS)) {
        for(let chunk of gridStore.chunks) {
            if(!chunk.hasSlimeSpawner || countSlimesInArea(chunk.chunkX, chunk.chunkY, gridStore) >= config.slime.maxSlimesInArea) continue;

            const x = Math.randomIntegerInRange(chunk.pixelLeft, chunk.pixelRight - 1);
            const y = Math.randomIntegerInRange(chunk.pixelTop, chunk.pixelBottom - 1);
            createSlime(x, y, chunk, allPools, objectsSpriteContainer, collisionManager, config);
        }
    }
}

function updateAllSlimesView(allPools, camera, ticker) {
    allPools[objectTypes.slime].forEachUsed(slime => {
        setSpritePosition(slime.sprite, slime.x, slime.y, camera);
        slime.sprite.update(ticker);
    });
}

function isSlimeNearAim(slime) {
    const distanceX = Math.abs(slime.x - slime.aim.x);
    const distanceY = Math.abs(slime.y - slime.aim.y);
    return distanceX <= 20 && distanceY <= 20;
}

function choseNextRandomAimIfNeeded(slime, gridStore, config) {
    if(isSlimeNearAim(slime)) {
        let nextAimX = Math.randomIntegerInRange(slime.spawnPointX - config.slime.roamingRadiusInPixels, slime.spawnPointX + config.slime.roamingRadiusInPixels);
        let nextAimY = Math.randomIntegerInRange(slime.spawnPointY - config.slime.roamingRadiusInPixels, slime.spawnPointY + config.slime.roamingRadiusInPixels);
        nextAimX = Math.clamp(nextAimX, gridStore.border.pixelLeft, gridStore.border.pixelRight - 1);
        nextAimY = Math.clamp(nextAimY, gridStore.border.pixelTop, gridStore.border.pixelBottom - 1);
        slime.aim = { x: nextAimX, y: nextAimY };
    }
}

function changeChunk(slime, oldX, oldY, newX, newY, gridStore) {
    const currentChunk = gridStore.getChunkByPixel(oldX, oldY);
    const nextChunk = gridStore.getChunkByPixel(newX, newY);

    if (currentChunk === nextChunk) return;

    currentChunk?.removeFromChunk(slime, objectTypes.slime);
    nextChunk?.addToChunk(slime, objectTypes.slime);
}

function moveSlime(slime, gridStore, collisionManager, deltaMS) {
    const oldX = slime.x;
    const oldY = slime.y;
    slime.velocity.set(slime.aim.x - slime.x, slime.aim.y - slime.y).normalize().scaleBy(slime.speed * (deltaMS / 1000));
    slime.x += slime.velocity.x;
    slime.y += slime.velocity.y;
    changeChunk(slime, oldX, oldY, slime.x, slime.y, gridStore);

    collisionManager.setPosition(slime.body, slime.x, slime.y);
}

function updateAllSlimes(allPools, gridStore, lightManager, collisionManager, player, config, deltaMS) {
    allPools[objectTypes.slime].forEachUsed(slime => {
        if(slime.currentHealth <= 0 || !gridStore.isPixelInMap(slime.x, slime.y)) {
            removeSlime(slime, allPools, gridStore, lightManager, collisionManager);
        } else if(slime.state === slimeStates.idle) {
            slime.idleDurationInMS -= deltaMS;
            if(slime.idleDurationInMS <= 0) {
                slime.state = slimeStates.roam;
                slime.roamingDurationInMS = config.slime.roamingDurationInSec * 1000;
                setAnimation(slime, 'slime_run');
            }
        } else if(slime.state === slimeStates.roam) {
            if(Math.inRange(slime.sprite.currentFrame, 6, 8)) {
                moveSlime(slime, gridStore, collisionManager, deltaMS);
            } else {
                choseNextRandomAimIfNeeded(slime, gridStore, config);
            }

            slime.roamingDurationInMS -= deltaMS;
            if(slime.roamingDurationInMS <= 0) {
                slime.state = slimeStates.idle;
                slime.idleDurationInMS = config.slime.idleDurationInSec * 1000;
                setAnimation(slime, 'slime_idle');
            }
        } else if(slime.state === slimeStates.chase) {
            if(Math.inRange(slime.sprite.currentFrame, 6, 8)) moveSlime(slime, gridStore, collisionManager, deltaMS);
            else if(isSlimeNearAim(slime)) slime.state = slimeStates.attack;
        } else if(slime.state === slimeStates.attack) {
            if(slime.attackTimer.tick(deltaMS)) damagePlayer(player, slime.damage);
            else if(!isSlimeNearAim(slime)) slime.state = slimeStates.chase;
        }
    });
}


function createTileSprite(tileType, sizeUnitsConverter) {
    const tileSprite = new Sprite(Assets.get(tileType));
    tileSprite.setSize(sizeUnitsConverter.tileWidthInPixels(), sizeUnitsConverter.tileHeightInPixels());
    return tileSprite;
}

function createTile(leftPixelOfTile, topPixelOfTile, localTileXInChunk, localTileYInChunk, tileType, chunk, allPools, sizeUnitsConverter) {
    const tile = allPools[tileType].acquire(() => ({
        type: tileType,
        sprite: createTileSprite(tileType, sizeUnitsConverter)
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

function createTree(treeMeta, chunk, allPools, camera, objectsSpriteContainer) {
    const tree = allPools[treeMeta.treeType].acquire(() => ({
        type: treeMeta.treeType,
        sprite: createTreeSprite(treeMeta)
    }));
    tree.x = treeMeta.globalPixelX;
    tree.y = treeMeta.globalPixelY;
    setSpritePosition(tree.sprite, tree.x, tree.y, camera, objectsSpriteContainer);

    chunk.addToChunk(tree, tree.type);
    objectsSpriteContainer.addChild(tree.sprite);
}

function createDungeonEntranceSprite(dungeonEntranceMeta) {
    const tombEntranceSprite = new Sprite(Assets.get(dungeonEntranceMeta.dungeonType));
    tombEntranceSprite.anchor.set(0.5, 1);
    return tombEntranceSprite;
}

function createDungeonEntrance(dungeonEntranceMeta, chunk, allPools, camera, objectsSpriteContainer) {
    const dungeonEntrance = allPools[objectTypes.tomb].acquire(() => ({
        type: dungeonEntranceMeta.dungeonType,
        sprite: createDungeonEntranceSprite(dungeonEntranceMeta)
    }));
    dungeonEntrance.x = dungeonEntranceMeta.globalPixelX;
    dungeonEntrance.y = dungeonEntranceMeta.globalPixelY;
    setSpritePosition(dungeonEntrance.sprite, dungeonEntrance.x, dungeonEntrance.y, camera, objectsSpriteContainer);

    chunk.addToChunk(dungeonEntrance, dungeonEntrance.type);
    objectsSpriteContainer.addChild(dungeonEntrance.sprite);
}

function removeChunksWithAllObjs(removedChunks, allPools, lightManager, collisionManager) {
    for(let chunk of removedChunks) {
        chunk.tileSpritesContainer.removeFromParent();
        chunk.tileSpritesContainer.destroy({ children: false });

        chunk.forEachObj((obj, objType) => removeGameObj(obj, allPools, lightManager, collisionManager));
        chunk.forEachTileContainer((globalTileX, globalTileY, localTileXInChunk, localTileYInChunk, tileContainer) => {
            const tile = tileContainer.tile;
            allPools[tile.type].release(tile);
        });
    }
}

function generateChunksFor(pixelX, pixelY, player, gridStore, lightManager, collisionManager, allPools, mapGenerator, sizeUnitsConverter, noiseGenerator, camera, gameObjects, allTileSpritesContainer, objectsSpriteContainer, config) {
    const result = gridStore.shiftCenterToPixel(pixelX, pixelY);
    updateCamera(camera, player, result.newBorder, gameObjects);

    for(let chunk of result.retainedChunks) {
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInGrid(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInGrid(chunk.chunkY);
        chunk.tileSpritesContainer.position.set(localLeftOfChunk, localTopOfChunk);

        chunk.forEachObj((obj, objType) => setSpritePosition(obj.sprite, obj.x, obj.y, camera));
    }

    removeChunksWithAllObjs(result.removedChunks, allPools, lightManager, collisionManager);

    const mapGenerationOutput = {};
    for(let chunk of result.createdChunks) {
        chunk.tileSpritesContainer = new Container();
        chunk.tileSpritesContainer.cullable = true;
        const localLeftOfChunk = gridStore.localLeftPixelOfChunkInGrid(chunk.chunkX);
        const localTopOfChunk = gridStore.localTopPixelOfChunkInGrid(chunk.chunkY);
        chunk.tileSpritesContainer.position.set(localLeftOfChunk, localTopOfChunk);

        const { tiles, trees, dungeonEntrance } = mapGenerator.generateChunk(chunk.chunkX, chunk.chunkY, mapGenerationOutput);

        let countGrassTiles = 0;
        for (const tile of tiles) {
            const leftPixel = sizeUnitsConverter.leftPixelOfTile(tile.globalTileX);
            const topPixel = sizeUnitsConverter.topPixelOfTile(tile.globalTileY);
            createTile(leftPixel, topPixel, tile.localTileX, tile.localTileY, tile.tileType, chunk, allPools, sizeUnitsConverter);

            if(tile.tileType === objectTypes.grassTile) ++countGrassTiles;
        }
        for(const treeMeta of trees) createTree(treeMeta, chunk, allPools, camera, objectsSpriteContainer);
        if(dungeonEntrance && dungeonEntrance.dungeonType === objectTypes.tomb) createDungeonEntrance(dungeonEntrance, chunk, allPools, camera, objectsSpriteContainer);

        chunk.hasSlimeSpawner = (countGrassTiles / sizeUnitsConverter.chunkAreaInTiles() >= config.slime.minGrassTilePercentForSpawn)
            && noiseGenerator.noise(chunk.chunkX, chunk.chunkY) <= config.slime.spawnerProbabilityInChunk;

        allTileSpritesContainer.addChild(chunk.tileSpritesContainer);
    }
}


function createMinimap(eventManager, viewportWidth, viewportHeight, container, minimapConfig) {
    eventManager.registerInbox('Minimap', InputEvents.KeyM, InputEvents.MouseWheel, InputEvents.MouseDown, InputEvents.MouseUp, InputEvents.MouseMove);

    const minimap = {
        container: new Container(),
        staticObjects: new Graphics(),
        viewportWidth,
        viewportHeight,
        scale: minimapConfig.defaultScale,
        minScale: minimapConfig.minScale,
        maxScale: minimapConfig.maxScale,
        scroll: { isScrolling: false, scrollRecentX: 0, scrollRecentY: 0 }
    };

    minimap.container.addChild(minimap.staticObjects);
    minimap.container.visible = false;
    resizeMinimap(minimap, viewportWidth, viewportHeight);
    container.addChild(minimap.container);

    return minimap;
}

function destroyMinimap(minimap) {
    minimap.container?.destroy({ children: true });
}

function resizeMinimap(minimap, viewportWidth, viewportHeight) {
    if(!minimap?.container || minimap.container.destroyed) return;
    minimap.viewportWidth = viewportWidth;
    minimap.viewportHeight = viewportHeight;
    const prevSizeInPixel = minimap.sizeInPixel;
    minimap.sizeInPixel = Math.min(viewportWidth, viewportHeight) * minimap.scale;
    minimap.container.setSize(minimap.sizeInPixel, minimap.sizeInPixel);
    keepMinimapCenter(minimap, prevSizeInPixel);
}

function alignMinimapToCenter(minimap) {
    minimap.left = (minimap.viewportWidth - minimap.sizeInPixel) / 2;
    minimap.top = (minimap.viewportHeight - minimap.sizeInPixel) / 2;
    minimap.container.position.set(minimap.left, minimap.top);
}

function keepMinimapCenter(minimap, prevSizeInPixel) {
    if(prevSizeInPixel != null) {
        const sizeDelta = minimap.sizeInPixel - prevSizeInPixel;
        minimap.left -= sizeDelta / 2;
        minimap.top -= sizeDelta / 2;
        minimap.container.position.set(minimap.left, minimap.top);
    }
}

function repaintMinimap(minimap, allPools, gridStore, sizeUnitsConverter) {
    if(!minimap.container.visible) return;

    minimap.staticObjects.clear();

    drawTilesOnMinimap(minimap, allPools, gridStore, sizeUnitsConverter, objectTypes.sandTile, 0xFFFF00);
    drawTilesOnMinimap(minimap, allPools, gridStore, sizeUnitsConverter, objectTypes.waterTile, 0x000080);
    drawTilesOnMinimap(minimap, allPools, gridStore, sizeUnitsConverter, objectTypes.grassTile, 0x41980A);
    drawTilesOnMinimap(minimap, allPools, gridStore, sizeUnitsConverter, objectTypes.rockFloorTile, 0x4C3732);

    drawObjectsOnMinimap(
        minimap, allPools, gridStore,
        objectTypes.littleOak,
        objectTypes.heightOak,
        objectTypes.bigOak,
        objectTypes.deadLittleOak,
        objectTypes.deadHeightOak,
        objectTypes.deadBigOak,
        objectTypes.tomb
    );

    minimap.container.setSize(minimap.sizeInPixel, minimap.sizeInPixel);
}

function drawTilesOnMinimap(minimap, allPools, gridStore, sizeUnitsConverter, tileType, color) {
    allPools[tileType].forEachUsed(tile => {
        const viewX = gridStore.localPixelXInGrid(tile.x);
        const viewY = gridStore.localPixelYInGrid(tile.y);
        minimap.staticObjects.rect(viewX, viewY, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);
    });
    minimap.staticObjects.fill(color);
}

function drawObjectsOnMinimap(minimap, allPools, gridStore, ...objTypes) {
    const allObjects = [];
    objTypes.forEach(objType => allPools[objType].copyUsedItemsTo(allObjects));
    allObjects.sort((a, b) => a.y - b.y);

    const matrixByObjType = {};
    for(let obj of allObjects) {
        const texture = Assets.get(obj.type);

        const viewX = gridStore.localPixelXInGrid(obj.x) - texture.width * obj.sprite.anchor.x;
        const viewY = gridStore.localPixelYInGrid(obj.y) - texture.height * obj.sprite.anchor.y;

        const { frame, source } = texture;
        const matrix = matrixByObjType[obj.type] ??= new Matrix(frame.width / source.width, 0, 0, frame.height / source.height, frame.x / source.width, frame.y / source.height).invert();
        minimap.staticObjects.rect(viewX, viewY, texture.width, texture.height).fill({ texture, matrix });
    }
}

function switchMinimapVisibility(minimap, allPools, gridStore, sizeUnitsConverter, eventManager) {
    if(eventManager.pullEvent('Minimap', InputEvents.KeyM)) {
        minimap.container.visible = !minimap.container.visible;
        if(!minimap.container.visible) return;

        repaintMinimap(minimap, allPools, gridStore, sizeUnitsConverter);
        alignMinimapToCenter(minimap);
    }
}

function scaleMinimap(minimap, eventManager) {
    if(!minimap.container.visible) return;

    const event = eventManager.pullEvent('Minimap', InputEvents.MouseWheel);
    if(!event) return;

    minimap.scale += event.deltaY > 0 ? -0.1 : 0.1;
    minimap.scale = Math.clamp(minimap.scale, minimap.minScale, minimap.maxScale);
    resizeMinimap(minimap, minimap.viewportWidth, minimap.viewportHeight);
}

function scrollMinimap(minimap, eventManager, renderer) {
    const mouseDownEvent = eventManager.pullEvent('Minimap', InputEvents.MouseDown);
    if(mouseDownEvent && checkCLickOnMinimap(minimap, renderer, mouseDownEvent)) {
        minimap.scroll.isScrolling = true;
        minimap.scroll.scrollRecentX = mouseDownEvent.clientX;
        minimap.scroll.scrollRecentY = mouseDownEvent.clientY;
    }

    const mouseMoveEvent = eventManager.pullEvent('Minimap', InputEvents.MouseMove);
    if(mouseMoveEvent && minimap.scroll.isScrolling) {
        minimap.left += mouseMoveEvent.clientX - minimap.scroll.scrollRecentX;
        minimap.top += mouseMoveEvent.clientY - minimap.scroll.scrollRecentY;
        minimap.container.position.set(minimap.left, minimap.top);
        minimap.scroll.scrollRecentX = mouseMoveEvent.clientX;
        minimap.scroll.scrollRecentY = mouseMoveEvent.clientY;
    }

    const mouseUpEvent = eventManager.pullEvent('Minimap', InputEvents.MouseUp);
    if(mouseUpEvent) {
        minimap.scroll.isScrolling = false;
    }
}

function checkCLickOnMinimap(minimap, renderer, mouseEvent) {
    if(!minimap?.container?.visible) return false;

    const point = { x: 0, y: 0 };
    renderer.events.mapPositionToPoint(point, mouseEvent.clientX, mouseEvent.clientY);
    return minimap.container.getBounds().containsPoint(point.x, point.y);
}

function updateMinimapView(minimap, allPools, gridStore, sizeUnitsConverter, eventManager, renderer) {
    switchMinimapVisibility(minimap, allPools, gridStore, sizeUnitsConverter, eventManager);
    scaleMinimap(minimap, eventManager);
    scrollMinimap(minimap, eventManager, renderer);
}


function updateCamera(camera, player, gridStoreBorder, gameObjects) {
    camera.followIfOutOfDeadZone(player.x, player.y);
    const stageX = camera.toViewportPixelX(gridStoreBorder.pixelLeft);
    const stageY = camera.toViewportPixelY(gridStoreBorder.pixelTop);
    gameObjects.position.set(stageX, stageY);
}


function updateHUD(uiManager, player) {
    uiManager.setEnergy(player.energy.currentEnergy, player.energy.maxEnergy, player.energy.receivedDamaged);
}


async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'img/water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'img/sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'img/grass_tile.jpg' });
    await Assets.load({ alias: objectTypes.rockFloorTile, src: 'img/rock_tile.png' });
    await Assets.load('img/trees.json');
    await Assets.load({ alias: objectTypes.tomb, src: 'img/tomb-entrance.png' });
    await Assets.load({ alias: objectTypes.player, src: 'img/character.json' });
    await Assets.load({ alias: objectTypes.fireball, src: 'img/fireball.json' });
    await Assets.load({ alias: objectTypes.explosion, src: 'img/explosion.json' });
    await Assets.load({ alias: objectTypes.slime, src: 'img/slime.json' });
    await LightManager.loadTextures();
}

async function loadConfig() {
    await Assets.load({alias: 'config', src: 'config/config.json'});
}

async function loadTiledMaps() {
    await Assets.load({ alias: 'tombMap', src: 'tiled/tomb.json' });
}

async function loadAssets() {
    await loadTextures();
    await loadConfig();
    await LightManager.loadShaders();
    await loadTiledMaps();

    globalGameData.config = Assets.get('config');
}


async function createRenderer(domContainer) {
    const renderer = new WebGLRenderer();
    await renderer.init({
        background: '#1099BB',
        width: domContainer.clientWidth,
        height: domContainer.clientHeight
    });
    domContainer.appendChild(renderer.canvas);
    return renderer;
}

function createPools() {
    return Object.fromEntries(
        Object.values(objectTypes)
            .filter(objType => objType !== objectTypes.player)
            .map(objType => [objType, new UnorderedPool()])
    );
}

function createSceneGraph() {
    globalGameData.view.stage = new Container();
    globalGameData.view.gameObjects = new Container();
    globalGameData.view.allTileSpritesContainer = new Container();
    globalGameData.view.objectsSpriteContainer = new Container();
    globalGameData.view.debugPhysicsGraphics = new Graphics();
    globalGameData.view.gameObjects.addChild(globalGameData.view.allTileSpritesContainer, globalGameData.view.objectsSpriteContainer, globalGameData.view.debugPhysicsGraphics);
    globalGameData.view.stage.addChild(globalGameData.view.gameObjects);
}

async function initGlobalGameData() {
    //Подготавливаем контекст WebGL
    globalGameData.view.domContainer = document.querySelector('.game-canvas-container');
    globalGameData.view.renderer = await createRenderer(globalGameData.view.domContainer);

    globalGameData.uiManager = new UIManager();
    globalGameData.allPools = createPools();
    globalGameData.collisionManager = new CollisionManager();
    globalGameData.tiledParser = new TiledParser();
    globalGameData.ticker = new Ticker();

    createSceneGraph();

    globalGameData.lightManager = new LightManager(globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight, 0.5, globalGameData.config.time);
    globalGameData.lightManager.prepareGlobalLighting(globalGameData.view.gameObjects)
}


function subscribeOnDomEvents() {
    sessionData.domEventUtil.on(window, 'resize', () => {
        sessionData.camera.resize(globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight);
        globalGameData.view.renderer.resize(globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight);
        resizeMinimap(sessionData.currentScene.minimap, globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight);
        globalGameData.lightManager.resizePointLightingTexture(globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight);
    });
    sessionData.domEventUtil.on(document, 'keydown', event => {
        if(event.key === 'Escape') {
            if(event.repeat) return;
            if (globalGameData.ticker.started) pauseCurrentScene();
            else resumeCurrentScene();
        } else {
            sessionData.eventManager.pushEvent(event.code, event);
        }
    });
    sessionData.domEventUtil.on(document, 'keyup', event => {
        sessionData.eventManager.clearEventForAll(event.code);
    });
    sessionData.domEventUtil.on(document, 'click', event => {
        if(!checkCLickOnMinimap(sessionData.currentScene.minimap, globalGameData.view.renderer, event)) sessionData.eventManager.pushEvent(InputEvents.MouseClick, event);
    });
    sessionData.domEventUtil.on(document, 'wheel', event => {
        sessionData.eventManager.pushEvent(InputEvents.MouseWheel, event);
    });
    sessionData.domEventUtil.on(document, 'mousedown', event => {
        sessionData.eventManager.pushEvent(InputEvents.MouseDown, event);
    });
    sessionData.domEventUtil.on(document, 'mouseup', event => {
        sessionData.eventManager.pushEvent(InputEvents.MouseUp, event);
    });
    sessionData.domEventUtil.on(document, 'mousemove', event => {
        sessionData.eventManager.pushEvent(InputEvents.MouseMove, event);
    });
}

function createSession() {
    sessionData.calendar = new Calendar(globalGameData.config.time);
    sessionData.noiseGenerator = new NoiseGenerator(globalGameData.config.mapGenerator.seed);
    sessionData.eventManager = new EventManager();
    sessionData.domEventUtil = new DOMEventUtil();
    sessionData.camera = new Camera(globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight, globalGameData.config.camera);
    sessionData.player = createPlayer(0, 0, globalGameData.collisionManager, sessionData.eventManager, globalGameData.view.objectsSpriteContainer, globalGameData.config);

    subscribeOnDomEvents();

    sessionData.currentScene = new MainScene();
    globalGameData.ticker.add(updateCurrentScene);
    globalGameData.ticker.add(switchScene, null, -1);
    sessionData.eventManager.registerInbox('SceneSwitcher', 'SwitchScene');
}

function removeSession() {
    sessionData.domEventUtil.removeAllListeners();
    sessionData.eventManager.clearAll();
    destroyPlayer(sessionData.player, globalGameData.collisionManager);
    globalGameData.ticker.remove(updateCurrentScene);
    globalGameData.ticker.remove(switchScene);
}


function stopCurrentScene() {
    if(sessionData.currentScene) {
        globalGameData.ticker.stop();
        sessionData.currentScene.stop(globalGameData, sessionData);
    }
}

function startCurrentScene() {
    if(sessionData.currentScene) {
        sessionData.currentScene.start(globalGameData, sessionData);
        globalGameData.ticker.start();
    }
}

function pauseCurrentScene() {
    if (!globalGameData.ticker.started) return;
    globalGameData.ticker.stop();
    globalGameData.uiManager.showGamePauseModal(() => resumeCurrentScene());
}

function resumeCurrentScene() {
    if (globalGameData.ticker.started) return;
    globalGameData.uiManager.hideGamePauseModal();
    globalGameData.ticker.start();
}

function updateCurrentScene(ticker) {
    sessionData.currentScene.update(globalGameData, sessionData, ticker)
}

function requestSceneSwitch(newScene) {
    sessionData.eventManager.pushEvent('SwitchScene', newScene);
}

function switchScene() {
    const newScene = sessionData.eventManager.pullEvent('SceneSwitcher', 'SwitchScene');
    if(newScene) {
        stopCurrentScene();
        sessionData.currentScene = newScene;
        startCurrentScene();
    }
}


class MainScene {
    constructor() {
        this.sizeUnitsConverter = null;
        this.mapGenerator = null;
        this.gridStore = null;
        this.spawnSlimeTimer = null;
        this.minimap = null;
    }

    start(globalGameData, sessionData) {
        //Инициализируем основные хранилища данных и модель сцены
        this.sizeUnitsConverter = new SizeUnitsConverter(globalGameData.config.mainScene.sizeUnitsConverter);
        this.mapGenerator = new MapGenerator(this.sizeUnitsConverter, sessionData.noiseGenerator, globalGameData.config.mapGenerator);
        this.gridStore = new GridStore(this.sizeUnitsConverter, globalGameData.config.mainScene.grid);
        this.spawnSlimeTimer = IntervalTimer.ofSeconds(globalGameData.config.slime.spawnRateInSec);
        this.minimap = createMinimap(sessionData.eventManager, globalGameData.view.domContainer.clientWidth, globalGameData.view.domContainer.clientHeight, globalGameData.view.stage, globalGameData.config.minimap);

        //Находим точку спавна игрока
        const spawnTileCoords = this.mapGenerator.findNearestTileWithType(globalGameData.config.mapGenerator.spawnPoint.startTileX, globalGameData.config.mapGenerator.spawnPoint.startTileY, globalGameData.config.mapGenerator.spawnPoint.maxRadiusInTile, globalGameData.config.mapGenerator.spawnPoint.step, objectTypes.grassTile)
            ?? { tileX: globalGameData.config.mapGenerator.spawnPoint.startTileX, tileY: globalGameData.config.mapGenerator.spawnPoint.startTileY };
        const spawnPlayerCoords = {
            x: this.sizeUnitsConverter.centerPixelXOfTile(spawnTileCoords.tileX),
            y: this.sizeUnitsConverter.centerPixelYOfTile(spawnTileCoords.tileY)
        };

        //Размещаем игрока и создаем игровые объекты сцены
        placePlayerInScene(sessionData.player, spawnPlayerCoords.x, spawnPlayerCoords.y, globalGameData.collisionManager);
        sessionData.camera.centerOn(spawnPlayerCoords.x, spawnPlayerCoords.y);
        generateChunksFor(spawnPlayerCoords.x, spawnPlayerCoords.y, sessionData.player, this.gridStore, globalGameData.lightManager, globalGameData.collisionManager, globalGameData.allPools, this.mapGenerator, this.sizeUnitsConverter, sessionData.noiseGenerator, sessionData.camera, globalGameData.view.gameObjects, globalGameData.view.allTileSpritesContainer, globalGameData.view.objectsSpriteContainer, globalGameData.config);

        //Включаем освещение
        globalGameData.lightManager.enableLighting();

        //Регистрируем обработку коллизий
        globalGameData.collisionManager.registerHandler(objectTypes.fireball, objectTypes.slime, (fireball, slime) => {
            handleFireballAndSlimeCollision(fireball, slime, globalGameData.allPools, this.gridStore, sessionData.camera, globalGameData.view.objectsSpriteContainer, globalGameData.lightManager, globalGameData.collisionManager, globalGameData.config);
        });
    }

    update(globalGameData, sessionData, ticker) {
        //Обновляем модель
        sessionData.calendar.addMs(ticker.deltaMS);
        updatePlayer(sessionData.player, sessionData.eventManager, globalGameData.collisionManager, sessionData.calendar, sessionData.camera, globalGameData.allPools, globalGameData.view.objectsSpriteContainer, globalGameData.lightManager, globalGameData.config, ticker.deltaMS);
        updateAllFireballs(globalGameData.allPools, sessionData.camera, globalGameData.view.objectsSpriteContainer, globalGameData.lightManager, globalGameData.collisionManager, globalGameData.config, ticker.deltaMS);
        spawnSlimes(sessionData.calendar, this.spawnSlimeTimer, this.gridStore, globalGameData.allPools, globalGameData.view.objectsSpriteContainer, globalGameData.collisionManager, globalGameData.config, ticker.deltaMS);
        updateAllSlimes(globalGameData.allPools, this.gridStore, globalGameData.lightManager, globalGameData.collisionManager, sessionData.player, globalGameData.config, ticker.deltaMS);

        //Подгружаем и выгружаем часть карты при необходимости
        if(this.gridStore.checkDistanceToBorder(sessionData.player.x, sessionData.player.y, globalGameData.config.mainScene.grid.loadDistanceInChunk)) {
            generateChunksFor(sessionData.player.x, sessionData.player.y, sessionData.player, this.gridStore, globalGameData.lightManager, globalGameData.collisionManager, globalGameData.allPools, this.mapGenerator, this.sizeUnitsConverter, sessionData.noiseGenerator, sessionData.camera, globalGameData.view.gameObjects, globalGameData.view.allTileSpritesContainer, globalGameData.view.objectsSpriteContainer, globalGameData.config);
            repaintMinimap(this.minimap, globalGameData.allPools, this.gridStore, this.sizeUnitsConverter);
        }

        //Поиск коллизий
        globalGameData.collisionManager.handleCollisions();

        //Обновляем внешний вид игровых объектов
        updateCamera(sessionData.camera, sessionData.player, this.gridStore.border, globalGameData.view.gameObjects);
        updatePlayerView(sessionData.player, sessionData.camera, ticker);
        updateAllFireballsView(globalGameData.allPools, globalGameData.lightManager, sessionData.camera, globalGameData.config, ticker);
        updateAllExplosionsView(globalGameData.allPools, globalGameData.lightManager, sessionData.camera, ticker);
        updateAllSlimesView(globalGameData.allPools, sessionData.camera, ticker);

        //Обновляем освещение
        globalGameData.lightManager.updateLighting(sessionData.calendar, globalGameData.view.renderer);

        //Обновляем внешний вид миникарту по необходимости
        updateMinimapView(this.minimap, globalGameData.allPools, this.gridStore, this.sizeUnitsConverter, sessionData.eventManager, globalGameData.view.renderer);

        //Обновляем видимые границы вокруг физических тел для дебага физики
        //debugDrawAllPhysicsBodies(globalGameData.view.debugPhysicsGraphics, globalGameData.collisionManager, this.gridStore);

        //Отрисовываем игровой мир
        globalGameData.view.renderer.render(globalGameData.view.stage);

        //Отрисовываем UI
        updateHUD(globalGameData.uiManager, sessionData.player);

        checkGameOver(sessionData.player, globalGameData.uiManager);
    }

    stop(globalGameData, sessionData) {
        removeChunksWithAllObjs(this.gridStore.chunks, globalGameData.allPools, globalGameData.lightManager, globalGameData.collisionManager);
        globalGameData.allPools[objectTypes.fireball].forEachUsed(fireball => removeGameObj(fireball, globalGameData.allPools, globalGameData.lightManager, globalGameData.collisionManager));
        globalGameData.allPools[objectTypes.explosion].forEachUsed(fireball => removeGameObj(fireball, globalGameData.allPools, globalGameData.lightManager, globalGameData.collisionManager));
        destroyMinimap(this.minimap);

        globalGameData.lightManager.disableLighting();
        globalGameData.collisionManager.unregisterAllBodies();
        globalGameData.collisionManager.unregisterAllHandlers();
    }
}

class TombScene {
    constructor() {
        this.sizeUnitsConverter = null;
        this.gridStore = null;
    }

    start(globalGameData, sessionData) {
        this.sizeUnitsConverter = new SizeUnitsConverter(globalGameData.config.tombScene.sizeUnitsConverter);
        this.gridStore = new GridStore(this.sizeUnitsConverter, globalGameData.config.tombScene.grid);


    }

    update(globalGameData, sessionData, ticker) {
        sessionData.calendar.addMs(ticker.deltaMS);
        globalGameData.view.renderer.render(globalGameData.view.stage);
        updateHUD(globalGameData.uiManager, sessionData.player);
        checkGameOver(sessionData.player, globalGameData.uiManager);
    }

    stop(globalGameData, sessionData) {}
}


loadAssets()
    .then(() => initGlobalGameData())
    .then(() => createSession())
    .then(() => startCurrentScene());