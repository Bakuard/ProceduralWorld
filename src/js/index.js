import {WebGLRenderer,  Assets, Container, Sprite, AnimatedSprite, Ticker, Graphics, Matrix} from 'pixi.js';
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

let Config;
let sizeUnitsConverter;
let gridStore;
let noiseGenerator;
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
let domEventUtil;

let lightManager;

let uiManager;

function setSpritePositionInObjectsContainer(sprite, x, y, gridStore) {
    const spriteX = gridStore.localPixelXInGrid(x);
    const spriteY = gridStore.localPixelYInGrid(y);
    sprite.position.set(spriteX, spriteY);
}


function debugDrawAllPhysicsBodies(debugPhysicsGraphics, collisionManager, gridStore) {
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

function allCollisionHandler(objA, objB, bodyA, bodyB, allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager) {
    if(objA.type === objectTypes.slime && objB.type === objectTypes.fireball) {
        handleFireballAndSlimeCollision(objB, objA, allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager);
    } else if(objA.type === objectTypes.fireball && objB.type === objectTypes.slime) {
        handleFireballAndSlimeCollision(objA, objB, allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager);
    }
}

function handleFireballAndSlimeCollision(fireball, slime, allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager) {
    removeFireball(fireball, allPools, lightManager, collisionManager);
    createExplosion(fireball.x, fireball.y, allPools, gridStore, objectsSpriteContainer, lightManager);

    if(fireball.owner) {
        slime.currentHealth -= fireball.damage;

        const currentChunk = gridStore.getChunkByPixel(slime.x, slime.y);
        gridStore.forEachChunkInChunkRadius(currentChunk.chunkX, currentChunk.chunkY, 1, chunk => {
            chunk.forEachObjWithType(objectTypes.slime, slimeInChunk => {
                slimeInChunk.aim = fireball.owner;
                if(slimeInChunk.state === slimeStates.idle || slimeInChunk.state === slimeStates.roam) slimeInChunk.state = slimeStates.chase;
                setSlimeAnimation(slimeInChunk, 'slime_run');
            });
        });
    }
}


function createPlayerSprite(startAnimationName) {
    const playerSprite = new AnimatedSprite(Assets.get(objectTypes.player).animations[startAnimationName], false);
    playerSprite.anchor.set(0.5, 1);
    return playerSprite;
}

function createEnergyBar() {
    return {
        maxEnergy: Config.player.energy.maxEnergy,
        currentEnergyLimit: Config.player.energy.maxEnergy,
        currentEnergy: Config.player.energy.maxEnergy,
        receivedDamaged: 0,
        recoveryTimerPauseInMs: 0
    };
}

function createPlayer(pixelX, pixelY, collisionManager, eventManager, objectsSpriteContainer) {
    const player = {
        type: objectTypes.player,
        x: pixelX,
        y: pixelY,
        speed: Config.player.speed,
        fireTimer: TimestampIntervalTimer.ofMillis(Config.player.fireRateInMillis),
        velocity: new Vector(),
        sprite: createPlayerSprite(Config.player.startAnimation),
        energy: createEnergyBar()
    };
    player.body = collisionManager.createRectCollider(pixelX, pixelY, Config.player.bodyWidth, Config.player.bodyHeight, 0.5, 1, player);

    eventManager.registerInbox('Player', InputEvents.KeyW, InputEvents.KeyA, InputEvents.KeyS, InputEvents.KeyD, InputEvents.MouseClick);
    objectsSpriteContainer.addChild(player.sprite);
    setPlayerAnimation(player, 'idle');
    collisionManager.registerBody(player.body);
    return player;
}

function setPlayerAnimation(player, animationName) {
    if(player.animationName === animationName) return;

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

function updatePlayerView(player, gridStore, ticker) {
    setSpritePositionInObjectsContainer(player.sprite, player.x, player.y, gridStore);
    player.sprite.zIndex = player.y;

    if(player.velocity.isZero()) setPlayerAnimation(player, 'idle');
    else if(!player.velocity.isZero()) setPlayerAnimation(player, 'run');

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

function consumeEnergyWhileMoving(player, deltaMS) {
    const energyLossAmount = Config.player.energy.runningEnergyLossPerSec * (deltaMS / 1000);
    if(player.energy.currentEnergy < energyLossAmount) return false;

    player.energy.currentEnergy -= energyLossAmount;
    player.energy.recoveryTimerPauseInMs = Config.player.energy.recoverEnergyPauseInSec * 1000;
    resetRecoverEnergyTimer(player);
    return true;
}

function movePlayer(player, eventManager, collisionManager, deltaMS) {
    calculatePlayerVelocity(player, eventManager, deltaMS);

    if(player.velocity.isZero()) return;

    if(!consumeEnergyWhileMoving(player, deltaMS)) {
        player.velocity.set(0, 0);
        return;
    }

    player.x += player.velocity.x;
    player.y += player.velocity.y;
    collisionManager.setPosition(player.body, player.x, player.y);
}

function consumeEnergyWhileAttack(player) {
    if(player.energy.currentEnergy < Config.player.energy.attackEnergyLossAmount) return false;

    player.energy.currentEnergy -= Config.player.energy.attackEnergyLossAmount;
    resetRecoverEnergyTimer(player);
    return true;
}

function playerAttack(player, eventManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, collisionManager) {
    const mouseClick = eventManager.pullEvent('Player', InputEvents.MouseClick);
    if(mouseClick && player.fireTimer.checkThenReset(calendar.getTotalMS()) && consumeEnergyWhileAttack(player)) {
        const aimX = camera.toGlobalPixelX(mouseClick.clientX);
        const aimY = camera.toGlobalPixelY(mouseClick.clientY);
        createFireball(player.x, player.y - player.sprite.height / 2, aimX, aimY, Config.fireball.lifeTimeInMillis, Config.fireball.speed, Config.fireball.damage, player, allPools, objectsSpriteContainer, lightManager, collisionManager);
    }
}

function resetRecoverEnergyTimer(player) {
    const currentEnergyPercent = player.energy.currentEnergy / player.energy.maxEnergy;
    player.energy.recoveryTimerPauseInMs = currentEnergyPercent > 0.01 ?
        Config.player.energy.recoverEnergyPauseInSec * 1000 : Config.player.energy.recoverEnergyPenaltyInSec * 1000;
}

function recoverEnergy(player, deltaMS) {
    if(player.energy.recoveryTimerPauseInMs === 0 && player.energy.currentEnergy < player.energy.currentEnergyLimit) {
        const updatedEnergyAmount = player.energy.currentEnergy + Config.player.energy.recoverEnergyRatePerSec * (deltaMS / 1000);
        player.energy.currentEnergy = Math.min(updatedEnergyAmount, player.energy.currentEnergyLimit);
    }
    player.energy.recoveryTimerPauseInMs = Math.max(0, player.energy.recoveryTimerPauseInMs - deltaMS);
}

function damagePlayer(player, damage) {
    player.energy.receivedDamaged = Math.min(player.energy.maxEnergy, player.energy.receivedDamaged + damage);
    player.energy.currentEnergyLimit = Math.max(0, player.energy.currentEnergyLimit - damage);
    player.energy.currentEnergy = Math.max(0, player.energy.currentEnergy - damage);
}

function updatePlayer(player, eventManager, collisionManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, deltaMS) {
    movePlayer(player, eventManager, collisionManager, deltaMS);
    playerAttack(player, eventManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, collisionManager);
    recoverEnergy(player, deltaMS);
}

function checkGameOver(player, uiManager) {
    if(player.energy.receivedDamaged === player.energy.maxEnergy) {
        stopGame();
        uiManager.showGameOverModal(() => {
            uiManager.hideGameOverModal();
            startNewGame();
        });
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

function createExplosion(globalPixelX, globalPixelY, allPools, gridStore, objectsSpriteContainer, lightManager) {
    const explosion = allPools[objectTypes.explosion].acquire(() => (
        {
            type: objectTypes.explosion,
            sprite: createExplosionSprite(),
            lightPoint: lightManager.createLightPointSprite(Config.explosion.lightPoint.radius, Config.explosion.lightPoint.color)
        }
    ));
    explosion.x = globalPixelX;
    explosion.y = globalPixelY;
    setSpritePositionInObjectsContainer(explosion.sprite, globalPixelX, globalPixelY, gridStore);
    explosion.sprite.zIndex = globalPixelY;
    explosion.sprite.gotoAndPlay(0);

    objectsSpriteContainer.addChild(explosion.sprite);
    lightManager.registerLightPointSprite(explosion.lightPoint);
    explosion.sprite.onComplete = () => removeExplosion(explosion, allPools, lightManager);
}

function removeExplosion(explosion, allPools, lightManager) {
    explosion.sprite.removeFromParent();
    lightManager.unregisterLightPointSprite(explosion.lightPoint);
    allPools[objectTypes.explosion].release(explosion);
}

function updateAllExplosionsView(allPools, lightManager, camera, ticker) {
    allPools[objectTypes.explosion].forEachUsed(explosion => {
        lightManager.setLightPointPosition(explosion.lightPoint, explosion.x, explosion.y, camera);
        explosion.sprite.update(ticker);
    });
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

function createFireball(globalPixelX, globalPixelY, globalAimPixelX, globalAimPixelY, lifeTimeInMillis, speed, damage, owner, allPools, objectsSpriteContainer, lightManager, collisionManager) {
    let fireball = allPools[objectTypes.fireball].acquire(() => {
        const newFireball = {
            type: objectTypes.fireball,
            velocity: new Vector(),
            sprite: createFireballSprite(),
            lightPoint: lightManager.createLightPointSprite(Config.fireball.lightPoint.radius, Config.fireball.lightPoint.color)
        };
        newFireball.body = collisionManager.createCircleCollider(globalPixelX, globalPixelY, Config.fireball.bodyRadius, 1, 0.5, newFireball);
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

    objectsSpriteContainer.addChild(fireball.sprite);
    lightManager.registerLightPointSprite(fireball.lightPoint);
    collisionManager.registerBody(fireball.body);
}

function removeFireball(fireball, allPools, lightManager, collisionManager) {
    fireball.sprite.removeFromParent();
    lightManager.unregisterLightPointSprite(fireball.lightPoint);
    allPools[objectTypes.fireball].release(fireball);
    collisionManager.unregisterBody(fireball.body);
}

function updateAllFireballsView(allPools, gridStore, lightManager, camera, ticker) {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
        setSpritePositionInObjectsContainer(fireball.sprite, fireball.x, fireball.y, gridStore);
        lightManager.setLightPointPosition(fireball.lightPoint, fireball.x, fireball.y, camera);
        fireball.sprite.zIndex = fireball.y + Config.fireball.zIndexOffset;
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

function updateAllFireballs(allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager, deltaMS) {
    allPools[objectTypes.fireball].forEachUsed(fireball => {
        moveFireball(fireball, collisionManager, deltaMS);

        fireball.lifeTimeInMillis -= deltaMS;
        if(fireball.lifeTimeInMillis <= 0) {
            removeFireball(fireball, allPools, lightManager, collisionManager);
            createExplosion(fireball.x, fireball.y, allPools, gridStore, objectsSpriteContainer, lightManager);
        }
    });
}


function createSlimeSprite() {
    const slimeSprite = new AnimatedSprite(Assets.get(objectTypes.slime).animations['slime_idle'], false);
    slimeSprite.anchor.set(0.5, 1);
    slimeSprite.scale.set(Config.slime.spriteScale);
    return slimeSprite;
}

function createSlime(globalPixelX, globalPixelY, chunk, allPools, objectsSpriteContainer, collisionManager) {
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
    slime.aim = { x: globalPixelX, y: globalPixelY };
    slime.state = slimeStates.idle;
    slime.currentHealth = Config.slime.maxHealth;
    slime.attackTimer = IntervalTimer.ofSeconds(Config.slime.attackRateInSec);
    slime.damage = Config.slime.damage;
    slime.idleDurationInMS = Config.slime.idleDurationInSec * 1000;
    slime.roamingDurationInMS = Config.slime.roamingDurationInSec * 1000;
    slime.velocity.set(0, 0);
    collisionManager.setPosition(slime.body, globalPixelX, globalPixelY);
    setSlimeAnimation(slime, 'slime_idle');

    chunk.addToChunk(slime, objectTypes.slime);
    objectsSpriteContainer.addChild(slime.sprite);
    collisionManager.registerBody(slime.body);
}

function removeSlime(slime, allPools, gridStore, collisionManager) {
    slime.sprite.removeFromParent();
    collisionManager.unregisterBody(slime.body);
    gridStore.getChunkByPixel(slime.x, slime.y)?.removeFromChunk(slime, objectTypes.slime);
    allPools[objectTypes.slime].release(slime);
}

function countSlimesInArea(chunkX, chunkY, gridStore) {
    let slimeCount = 0;
    gridStore.forEachChunkInChunkRadius(chunkX, chunkY, 2, chunk => slimeCount += chunk.countByTypeInChunk(objectTypes.slime));
    return slimeCount;
}

function spawnSlimes(calendar, spawnSlimeTimer, gridStore, allPools, objectsSpriteContainer, collisionManager, deltaMS) {
    if(calendar.isCurrentPhaseBetween(Config.slime.spawnDayPhaseStart, Config.slime.spawnDayPhaseEnd) && spawnSlimeTimer.tick(deltaMS)) {
        for(let chunk of gridStore.chunks) {
            if(!chunk.hasSlimeSpawner || countSlimesInArea(chunk.chunkX, chunk.chunkY, gridStore) >= Config.slime.maxSlimesInArea) continue;

            const x = Math.randomIntegerInRange(chunk.pixelLeft, chunk.pixelRight);
            const y = Math.randomIntegerInRange(chunk.pixelTop, chunk.pixelBottom);
            createSlime(x, y, chunk, allPools, objectsSpriteContainer, collisionManager);
        }
    }
}

function setSlimeAnimation(slime, animationName) {
    if(slime.animationName === animationName) return;

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

function updateAllSlimesView(allPools, gridStore, ticker) {
    allPools[objectTypes.slime].forEachUsed(slime => {
        setSpritePositionInObjectsContainer(slime.sprite, slime.x, slime.y, gridStore);
        slime.sprite.zIndex = slime.y;

        slime.sprite.update(ticker);
    });
}

function isSlimeNearAim(slime) {
    const distanceX = Math.abs(slime.x - slime.aim.x);
    const distanceY = Math.abs(slime.y - slime.aim.y);
    return distanceX <= 20 && distanceY <= 20;
}

function choseNextRandomAimIfNeeded(slime, gridStore) {
    if(isSlimeNearAim(slime)) {
        let nextAimX = Math.randomIntegerInRange(slime.spawnPointX - Config.slime.roamingRadiusInPixels, slime.spawnPointX + Config.slime.roamingRadiusInPixels);
        let nextAimY = Math.randomIntegerInRange(slime.spawnPointY - Config.slime.roamingRadiusInPixels, slime.spawnPointY + Config.slime.roamingRadiusInPixels);
        nextAimX = Math.clamp(nextAimX, gridStore.border.pixelLeft, gridStore.border.pixelRight);
        nextAimY = Math.clamp(nextAimY, gridStore.border.pixelTop, gridStore.border.pixelBottom);
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

function updateAllSlimes(allPools, gridStore, collisionManager, player, deltaMS) {
    allPools[objectTypes.slime].forEachUsed(slime => {
        if(slime.currentHealth <= 0 || !gridStore.isPixelInMap(slime.x, slime.y)) {
            removeSlime(slime, allPools, gridStore, collisionManager);
        } else if(slime.state === slimeStates.idle) {
            slime.idleDurationInMS -= deltaMS;
            if(slime.idleDurationInMS <= 0) {
                slime.state = slimeStates.roam;
                slime.roamingDurationInMS = Config.slime.roamingDurationInSec * 1000;
                setSlimeAnimation(slime, 'slime_run');
            }
        } else if(slime.state === slimeStates.roam) {
            if(Math.inRange(slime.sprite.currentFrame, 6, 8)) {
                moveSlime(slime, gridStore, collisionManager, deltaMS);
            } else {
                choseNextRandomAimIfNeeded(slime, gridStore);
            }

            slime.roamingDurationInMS -= deltaMS;
            if(slime.roamingDurationInMS <= 0) {
                slime.state = slimeStates.idle;
                slime.idleDurationInMS = Config.slime.idleDurationInSec * 1000;
                setSlimeAnimation(slime, 'slime_idle');
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

function createTree(treeMeta, chunk, allPools, gridStore, objectsSpriteContainer) {
    const tree = allPools[treeMeta.treeType].acquire(() => ({
        type: treeMeta.treeType,
        sprite: createTreeSprite(treeMeta)
    }));
    tree.x = treeMeta.globalPixelX;
    tree.y = treeMeta.globalPixelY;
    setSpritePositionInObjectsContainer(tree.sprite, tree.x, tree.y, gridStore);
    tree.sprite.zIndex = tree.y;

    chunk.addToChunk(tree, tree.type);
    objectsSpriteContainer.addChild(tree.sprite);
}

function findPlayerSpawnPixelCoords(startTileX, startTileY, maxRadiusInTile, step, mapGenerator, sizeUnitsConverter) {
    function isLand(x, y) {
        mapGenerator.generate(x, y);
        return mapGenerator.getTileType() !== objectTypes.waterTile;
    }

    if(isLand(startTileX, startTileY)) return { x: sizeUnitsConverter.centerPixelXOfTile(startTileX), y: sizeUnitsConverter.centerPixelYOfTile(startTileY) };

    const directions = [
        { dx: step, dy: step },
        { dx: step, dy: -step },
        { dx: -step, dy: -step },
        { dx: -step, dy: step }
    ];

    for(let radius = 1; radius <= maxRadiusInTile; radius++) {
        let x = startTileX - radius * step;
        let y = startTileY;

        for (const { dx, dy } of directions) {
            for (let i = 0; i < radius; i++) {
                if(isLand(x, y)) return { x: sizeUnitsConverter.centerPixelXOfTile(x), y: sizeUnitsConverter.centerPixelYOfTile(y) };
                x += dx;
                y += dy;
            }
        }
    }

    return { x: sizeUnitsConverter.centerPixelXOfTile(startTileX), y: sizeUnitsConverter.centerPixelYOfTile(startTileY) };
}

function generateChunksFor(pixelX, pixelY, gridStore, collisionManager, allPools, mapGenerator, sizeUnitsConverter, noiseGenerator, allTileSpritesContainer, objectsSpriteContainer) {
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
                chunk,
                allPools,
                sizeUnitsConverter
            );

            const treeMeta = mapGenerator.getTree();
            if (treeMeta) createTree(treeMeta, chunk, allPools, gridStore, objectsSpriteContainer);

            if(tileType === objectTypes.grassTile) ++countGrassTiles;
        });
        chunk.hasSlimeSpawner = (countGrassTiles / sizeUnitsConverter.chunkAreaInTiles() >= Config.slime.minGrassTilePercentForSpawn)
            && noiseGenerator.noise(chunk.chunkX, chunk.chunkY) <= Config.slime.spawnerProbabilityInChunk;

        allTileSpritesContainer.addChild(chunk.tileSpritesContainer);
    }
}


function createMinimap(eventManager, viewportWidth, viewportHeight, minimapConfig) {
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
    return minimap;
}

function resizeMinimap(minimap, viewportWidth, viewportHeight) {
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

    drawObjectsOnMinimap(
        minimap, allPools, gridStore,
        objectTypes.littleOak,
        objectTypes.heightOak,
        objectTypes.bigOak,
        objectTypes.deadLittleOak,
        objectTypes.deadHeightOak,
        objectTypes.deadBigOak
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
    if(!minimap.container.visible) return false;

    const point = { x: 0, y: 0 };
    renderer.events.mapPositionToPoint(point, mouseEvent.clientX, mouseEvent.clientY);
    return minimap.container.getBounds().containsPoint(point.x, point.y);
}

function updateMinimapView(minimap, allPools, gridStore, sizeUnitsConverter, eventManager, renderer) {
    switchMinimapVisibility(minimap, allPools, gridStore, sizeUnitsConverter, eventManager);
    scaleMinimap(minimap, eventManager);
    scrollMinimap(minimap, eventManager, renderer);
}


function updateCamera(camera, player, gridStore, gameObjects) {
    camera.followIfOutOfDeadZone(player.x, player.y);
    const stageX = camera.toViewportPixelX(gridStore.border.pixelLeft);
    const stageY = camera.toViewportPixelY(gridStore.border.pixelTop);
    gameObjects.position.set(stageX, stageY);
}


async function loadTextures() {
    await Assets.load({ alias: objectTypes.waterTile, src: 'img/water_tile.jpg' });
    await Assets.load({ alias: objectTypes.sandTile, src: 'img/sand_tile.jpg' });
    await Assets.load({ alias: objectTypes.grassTile, src: 'img/grass_tile.jpg' });
    await Assets.load('img/trees.json');
    await Assets.load({ alias: objectTypes.player, src: 'img/character.json' });
    await Assets.load({ alias: objectTypes.fireball, src: 'img/fireball.json' });
    await Assets.load({ alias: objectTypes.explosion, src: 'img/explosion.json' });
    await Assets.load({ alias: objectTypes.slime, src: 'img/slime.json' });
    await LightManager.loadTextures();
}

async function loadConfig() {
    const response = await fetch('config/config.json');
    if (!response.ok) throw `Fail to load config.json: ${response.statusText}`;
    Config = await response.json();
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

async function initGame() {
    //Подгружаем все ассеты
    await loadTextures();
    await loadConfig();
    await LightManager.loadShaders();

    //Подготавливаем контекст WebGL
    const domContainer = document.querySelector('.game-canvas-container');
    renderer = await createRenderer(domContainer);

    //Подготавливаем управление UI
    uiManager = new UIManager();

    //Создаем менеджеры событий
    eventManager = new EventManager();
    domEventUtil = new DOMEventUtil();

    //Инициализируем game loop
    ticker = new Ticker();
    ticker.add((ticker) => update(ticker));
}


function createPools() {
    return Object.fromEntries(
        Object.values(objectTypes)
            .filter(objType => objType !== objectTypes.player)
            .map(objType => [objType, new UnorderedPool()])
    );
}

function updateHUD(uiManager, player) {
    uiManager.setEnergy(player.energy.currentEnergy, player.energy.maxEnergy, player.energy.receivedDamaged);
}

function update(ticker) {
    //Обновляем модель
    calendar.updateCurrentTime(ticker.deltaMS);
    updatePlayer(player, eventManager, collisionManager, calendar, camera, allPools, objectsSpriteContainer, lightManager, ticker.deltaMS);
    updateAllFireballs(allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager, ticker.deltaMS);
    spawnSlimes(calendar, spawnSlimeTimer, gridStore, allPools, objectsSpriteContainer, collisionManager, ticker.deltaMS);
    updateAllSlimes(allPools, gridStore, collisionManager, player, ticker.deltaMS);

    //Подгружаем и выгружаем часть карты при необходимости
    if(gridStore.checkDistanceToBorder(player.x, player.y, Config.grid.loadDistanceInChunk)) {
        generateChunksFor(player.x, player.y, gridStore, collisionManager, allPools, mapGenerator, sizeUnitsConverter, noiseGenerator, allTileSpritesContainer, objectsSpriteContainer);
        repaintMinimap(minimap, allPools, gridStore, sizeUnitsConverter);
    }

    //Поиск коллизий
    collisionManager.handleCollisions((objA, objB, bodyA, bodyB) => allCollisionHandler(objA, objB, bodyA, bodyB, allPools, gridStore, objectsSpriteContainer, lightManager, collisionManager));

    //Обновляем внешний вид игровых объектов
    updateCamera(camera, player, gridStore, gameObjects);
    updatePlayerView(player, gridStore, ticker);
    updateAllFireballsView(allPools, gridStore, lightManager, camera, ticker);
    updateAllExplosionsView(allPools, lightManager, camera, ticker);
    updateAllSlimesView(allPools, gridStore, ticker);

    //Обновляем освещение
    lightManager.updateLighting(calendar, renderer);

    //Обновляем внешний вид миникарту по необходимости
    updateMinimapView(minimap, allPools, gridStore, sizeUnitsConverter, eventManager, renderer);

    //Обновляем внешний вид границ физических тел для дебага физики
    //debugDrawAllPhysicsBodies(debugPhysicsGraphics, collisionManager, gridStore);

    //Отрисовываем игровой мир
    renderer.render(stage);

    //Отрисовываем UI
    updateHUD(uiManager, player);

    checkGameOver(player, uiManager);
}

function startNewGame() {
    //Инициализируем основные хранилища данных и модель
    allPools = createPools();
    sizeUnitsConverter = new SizeUnitsConverter(Config.sizeUnitsConverter);
    noiseGenerator = new NoiseGenerator(Config.mapGenerator.seed);
    mapGenerator = new MapGenerator(sizeUnitsConverter, noiseGenerator, Config.mapGenerator);
    gridStore = new GridStore(sizeUnitsConverter, Config.grid);
    calendar = new Calendar(Config.time);
    spawnSlimeTimer = IntervalTimer.ofSeconds(Config.slime.spawnRateInSec);

    //Подготавливаем обработку коллизий
    collisionManager = new CollisionManager();

    //Создаем контейнеры для спрайтов и отладочную графику для физики
    const domContainer = document.querySelector('.game-canvas-container');
    camera = new Camera(domContainer.clientWidth, domContainer.clientHeight, Config.camera);
    stage = new Container();
    gameObjects = new Container();
    minimap = createMinimap(eventManager, domContainer.clientWidth, domContainer.clientHeight, Config.minimap);
    allTileSpritesContainer = new Container();
    objectsSpriteContainer = new Container();
    debugPhysicsGraphics = new Graphics();
    gameObjects.addChild(allTileSpritesContainer, objectsSpriteContainer, debugPhysicsGraphics);
    stage.addChild(gameObjects, minimap.container);

    //Подключаем шейдеры
    lightManager = new LightManager(domContainer.clientWidth, domContainer.clientHeight, 0.5, Config.time);
    lightManager.prepareGlobalLighting(gameObjects);

    //Создаем игровые объекты вместе с их спрайтами и физическими телами
    const spawnPlayerCoords = findPlayerSpawnPixelCoords(Config.mapGenerator.startTileX, Config.mapGenerator.startTileY, 100, 1, mapGenerator, sizeUnitsConverter);
    player = createPlayer(spawnPlayerCoords.x, spawnPlayerCoords.y, collisionManager, eventManager, objectsSpriteContainer);
    generateChunksFor(spawnPlayerCoords.x, spawnPlayerCoords.y, gridStore, collisionManager, allPools, mapGenerator, sizeUnitsConverter, noiseGenerator, allTileSpritesContainer, objectsSpriteContainer);
    camera.centerOn(spawnPlayerCoords.x, spawnPlayerCoords.y);

    //Подписываемся на внешние события
    domEventUtil.on('resize', () => {
        camera.resize(domContainer.clientWidth, domContainer.clientHeight);
        renderer.resize(domContainer.clientWidth, domContainer.clientHeight);
        resizeMinimap(minimap, domContainer.clientWidth, domContainer.clientHeight);
        lightManager.resizePointLightingTexture(domContainer.clientWidth, domContainer.clientHeight);
    });
    domEventUtil.on('keydown', event => {
        if(event.key === 'Escape') {
            if(event.repeat) return;
            if (ticker.started) pauseGame();
            else resumeGame();
        } else {
            eventManager.pushEvent(event.code, event);
        }
    });
    domEventUtil.on('keyup', event => {
        eventManager.clearEventForAll(event.code);
    });
    domEventUtil.on('click', event => {
        if(!checkCLickOnMinimap(minimap, renderer, event)) eventManager.pushEvent(InputEvents.MouseClick, event);
    });
    domEventUtil.on('wheel', event => {
        eventManager.pushEvent(InputEvents.MouseWheel, event);
    });
    domEventUtil.on('mousedown', event => {
        eventManager.pushEvent(InputEvents.MouseDown, event);
    });
    domEventUtil.on('mouseup', event => {
        eventManager.pushEvent(InputEvents.MouseUp, event);
    });
    domEventUtil.on('mousemove', event => {
        eventManager.pushEvent(InputEvents.MouseMove, event);
    });

    //Запускаем game loop
    ticker.start();
}

function stopGame() {
    ticker.stop();
    lightManager.destroy();
    stage.destroy({ children: true, texture: false, textureSource: false });
    eventManager.clearAll();
    domEventUtil.removeAllListeners();
}

function pauseGame() {
    if (!ticker.started) return;
    ticker.stop();
    uiManager.showGamePauseModal(() => resumeGame());
}

function resumeGame() {
    if (ticker.started) return;
    uiManager.hideGamePauseModal();
    ticker.start();
}


initGame().then(() => startNewGame());