import {SizeUnitsConverter} from './sizeUnitsConverter.js';
import {objectTypes} from "./objectTypes.js";
import {MapGenerator} from "./mapGenerator.js";
import './util.js';
import Phaser from 'phaser';

const minimap = {};
let sizeUnitsConverter;
let mapGenerator;
let player;
let userInput;
let world;
let slimeSpawnTimer;
const slimeStates = Object.freeze({
    roam: 'roam',
    chase: 'chase',
    attack: 'attack'
});

function addImageFromAtlas(scene, atlasName, frameName, imageName) {
    const frame = scene.textures.getFrame(atlasName, frameName);
    scene.textures.addSpriteSheetFromAtlas(imageName, {
        atlas: atlasName,
        frame: frameName,
        frameWidth: frame.width,
        frameHeight: frame.height
    });
}


function preparePlayerAnimation(scene) {
    scene.anims.create({
        key: 'player_stay',
        frames: scene.anims.generateFrameNames('character', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1
    });
    scene.anims.create({
        key: 'player_walk',
        frames: scene.anims.generateFrameNames('character', { start: 4, end: 7 }),
        frameRate: 7,
        repeat: -1
    });
}

function createPlayer(scene, x, y, width, height, speed, fireRateInMillis, bulletTimeInMillis, damage, bulletSpeed, maxHealth) {
    const player = scene.physics.add.sprite(x, y, 'character', '0')
        .setBodySize(width, height)
        .setOrigin(0.5, 1)
        .play('player_stay')
        .refreshBody();
    scene.physics.add.collider(player, world.physicsGroups[objectTypes.waterTile]);
    player.speed = speed;
    player.depth = player.y + 100;
    player.type = objectTypes.player;
    player.fireRateInMillis = fireRateInMillis;
    player.bulletTimeInMillis = bulletTimeInMillis;
    player.damage = damage;
    player.bulletSpeed = bulletSpeed;
    player.lastFireTime = 0;
    player.maxHealth = maxHealth;
    player.currentHealth = maxHealth;
    return player;
}

function movePlayer() {
    player.body.velocity.x = userInput.right.isDown - userInput.left.isDown;
    player.body.velocity.y = userInput.down.isDown - userInput.up.isDown;
    player.body.velocity.normalize().scale(player.speed);

    if(player.body.velocity.equals(Phaser.Math.Vector2.ZERO)) {
        player.anims.play('player_stay', true);
    } else {
        player.setFlipX(userInput.left.isDown);
        player.anims.play('player_walk', true);
        player.depth = player.y + 100;
    }
}

function playerFire(scene, time) {
    if(scene.input.activePointer.leftButtonDown() && time >= player.lastFireTime + player.fireRateInMillis) {
        const aimX = scene.input.activePointer.worldX;
        const aimY = scene.input.activePointer.worldY;
        const bulletX = player.x + Math.sign(aimX - player.x) * player.width / 2;
        const bulletY = aimY > player.y ? player.y : player.y - player.height / 3;
        createFireball(scene, bulletX, bulletY, aimX, aimY, player.bulletSpeed, player.bulletTimeInMillis, player.damage);
        player.lastFireTime = time;
    }
}

function playerDeath(scene) {
    scene.scene.restart();
}


function prepareSlimeAnimation(scene) {
    scene.anims.create({
        key: 'slime_stay',
        frames: scene.anims.generateFrameNames('slime', { start: 11, end: 12 }),
        frameRate: 3,
        repeat: -1
    });
    scene.anims.create({
        key: 'slime_walk',
        frames: scene.anims.generateFrameNames('slime', { start: 0, end: 10 }),
        frameRate: 8,
        repeat: -1
    });
}

function createSlime(scene, width, height, speed, roamingRadius, maxHealth, alertRadiusInChunkPixel, damage, chunk) {
    const x = Phaser.Math.Between(chunk.left + width/2, chunk.right - width/2);
    const y = Phaser.Math.Between(chunk.top + height, chunk.bottom);
    const slime = world.getFromPool(objectTypes.slime, x, y, 'slime', '11')
        .setDisplaySize(width, height)
        .setOrigin(0.5, 1)
        .play('slime_stay')
        .refreshBody();
    slime.colliders ??= [scene.physics.add.collider(slime, world.physicsGroups[objectTypes.waterTile])];
    slime.depth = slime.y + 100;
    slime.type = objectTypes.slime;
    slime.speed = speed;
    slime.spawnPointX = x;
    slime.spawnPointY = y;
    slime.aimX = x;
    slime.aimY = y;
    slime.movement = new Phaser.Math.Vector2(0, 0);
    slime.roamingRadius = roamingRadius;
    slime.maxHealth = maxHealth;
    slime.currentHealth = maxHealth;
    slime.alertRadiusInChunkPixel = alertRadiusInChunkPixel;
    slime.damage = damage;
    slime.chunk = chunk;
    slime.state = slimeStates.roam;
    slime.on('animationupdate', () => {
        if(slime.state === slimeStates.roam || slime.state === slimeStates.chase) {
            const frameIndex = slime.anims.currentFrame.index;
            if(Math.inRange(frameIndex, 0, 4) || Math.inRange(frameIndex, 10, 11))
                slime.setVelocity(0, 0);
            else
                slime.setVelocityX(slime.movement.x).setVelocityY(slime.movement.y);
        } else if(slime.state === slimeStates.attack) {
            const animationKey = slime.anims.currentFrame.textureFrame;
            if(animationKey === '11') {
                player.currentHealth -= slime.damage;
                if(player.currentHealth <= 0)
                    playerDeath(scene);
            }
        }
    });
    return slime;
}

function spawnSlimes(scene, slimeSpawnCondition, width, height, speed, roamingRadius, maxHealth, alertRadiusInChunkPixel, damage) {
    for(let chunk of world.chunks)
        if(chunk.hasSlimeSpawner && chunk.objectsByType[objectTypes.slime].length < slimeSpawnCondition.maxSlimes) {
            const slime = createSlime(scene, width, height, speed, roamingRadius, maxHealth, alertRadiusInChunkPixel, damage, chunk);
            chunk.objectsByType[objectTypes.slime].push(slime);
        }
}

function moveSlimes(time) {
    world.forEachObjectWithType(objectTypes.slime, slime => {
        if(slime.state === slimeStates.roam) {
            if(Phaser.Geom.Rectangle.Contains(slime.getBounds(), slime.aimX, slime.aimY)) {
                slime.anims.play('slime_walk', true);

                slime.aimX = Phaser.Math.Between(slime.spawnPointX - slime.roamingRadius, slime.spawnPointX + slime.roamingRadius);
                slime.aimY = Phaser.Math.Between(slime.spawnPointY - slime.roamingRadius, slime.spawnPointY + slime.roamingRadius);
                slime.aimX = Phaser.Math.Clamp(slime.aimX, world.left, world.right);
                slime.aimY = Phaser.Math.Clamp(slime.aimY, world.top, world.bottom);

                slime.movement.x = slime.aimX - slime.x;
                slime.movement.y = slime.aimY - slime.y;
                slime.movement.normalize().scale(slime.speed);
            }
        } else if(slime.state === slimeStates.chase) {
            slime.anims.play('slime_walk', true);

            slime.aimX = player.x;
            slime.aimY = player.y;
            if(Phaser.Geom.Rectangle.Contains(slime.getBounds(), slime.aimX, slime.aimY)) {
                slime.movement.set(0, 0);
                slime.setVelocity(0, 0);
                slime.state = slimeStates.attack;
            } else {
                slime.movement.x = slime.aimX - slime.x;
                slime.movement.y = slime.aimY - slime.y;
                slime.movement.normalize().scale(slime.speed);
                slime.lastChasingCoordsUpdateTime = time;
            }
        } else if(slime.state === slimeStates.attack) {
            slime.anims.play('slime_stay', true);

            slime.aimX = player.x;
            slime.aimY = player.y;
            if(!Phaser.Geom.Rectangle.Contains(slime.getBounds(), slime.aimX, slime.aimY))
                slime.state = slimeStates.chase;
        }
        slime.depth = slime.y + 100;
    });
}


function prepareFireballAnimation(scene) {
    scene.anims.create({
        key: 'fireball_fly',
        frames: scene.anims.generateFrameNames('fireball', { start: 0, end: 4 }),
        frameRate: 12,
        repeat: -1
    });
}

function createFireball(scene, x, y, aimX, aimY, speed, lifeTimeInMillis, damage) {
    const fireball = world.getFromPool(objectTypes.fireball, x, y)
        .setOffset(20, 5)
        .refreshBody();
    fireball.body.velocity.set(aimX - x, aimY - y).normalize().scale(speed);
    fireball.rotation = Phaser.Math.Angle.Between(0, 0, fireball.body.velocity.x, fireball.body.velocity.y);
    fireball.lifeTimeInMillis = lifeTimeInMillis;
    fireball.damage = damage;
    fireball.colliders ??= [scene.physics.add.overlap(fireball, world.physicsGroups[objectTypes.slime], onFireballCollision, null, scene)];
    fireball.anims.play('fireball_fly', true);
    fireball.type = objectTypes.fireball;
}

function moveFireballs(deltaTime) {
    world.forEachObjectWithType(objectTypes.fireball, fireball => {
        if(!fireball.active) return;

        fireball.lifeTimeInMillis -= deltaTime;
        fireball.depth = fireball.y + 110;
        if(fireball.lifeTimeInMillis <= 0)
            world.disposeToPool(fireball);
    });
}

function onFireballCollision(fireball, obstacle) {
    world.disposeToPool(fireball);
    createExplosion(this, obstacle.x, obstacle.y);

    if(obstacle.type === objectTypes.slime) {
        obstacle.currentHealth -= fireball.damage;
        if(obstacle.currentHealth <= 0) {
            world.disposeToPool(obstacle);
            world.removeFromChunk(obstacle);
        } else {
            world.forEachObjectInArea(objectTypes.slime,
                obstacle.x - obstacle.alertRadiusInChunkPixel,
                obstacle.y - obstacle.alertRadiusInChunkPixel,
                obstacle.x + obstacle.alertRadiusInChunkPixel,
                obstacle.y + obstacle.alertRadiusInChunkPixel,
                slime => slime.state = slimeStates.chase);
        }
    }
}


function prepareExplosionAnimation(scene) {
    scene.anims.create({
        key: 'explosion',
        frames: scene.anims.generateFrameNames('explosion', { start: 0, end: 14 }),
        frameRate: 15,
        repeat: 0
    });
}

function createExplosion(scene, x, y) {
    const explosion = world.getFromPool(objectTypes.explosion, x, y)
        .setOrigin(0.5, 1);
    explosion.anims.play('explosion', true);
    explosion.depth = explosion.y + 110;
    explosion.type = objectTypes.explosion;
    explosion.on('animationcomplete', (animation, frame) => world.disposeToPool(explosion));

    return explosion;
}


function createTile(tileNumberX, tileNumberY, tileType) {
    const topPerPixel = sizeUnitsConverter.pixelYFromTileY(tileNumberY);
    const leftPerPixel = sizeUnitsConverter.pixelXFromTileX(tileNumberX);
    const tile = world.getFromPool(tileType, leftPerPixel, topPerPixel, tileType)
        .setDisplaySize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setSize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setOrigin(0, 0)
        .refreshBody();
    tile.depth = topPerPixel;
    tile.type = tileType;
    return tile;
}

function createTree(treeMeta) {
    const treeObject = world.getFromPool(treeMeta.treeType, treeMeta.xPerPixel, treeMeta.yPerPixel, treeMeta.treeType)
        .setOrigin(0.5, 1)
        .refreshBody();
    treeObject.depth = treeMeta.yPerPixel + 100;
    treeObject.type = treeMeta.treeType;
    return treeObject;
}

function Chunk(chunkNumberX, chunkNumberY, slimeSpawnCondition) {
    this.chunkNumberX = chunkNumberX;
    this.chunkNumberY = chunkNumberY;
    this.top = sizeUnitsConverter.pixelYFromChunkY(chunkNumberY);
    this.left = sizeUnitsConverter.pixelXFromChunkX(chunkNumberX);
    this.bottom = sizeUnitsConverter.pixelYFromChunkY(chunkNumberY) + sizeUnitsConverter.chunkHeightInPixels();
    this.right = sizeUnitsConverter.pixelXFromChunkX(chunkNumberX) + sizeUnitsConverter.chunkWidthInPixels();
    this.objectsByType = {};
    Object.values(objectTypes).forEach(type => this.objectsByType[type] = []);

    //terrain generation
    const tileNumberX = sizeUnitsConverter.tileXFromChunkX(this.chunkNumberX);
    const tileNumberY = sizeUnitsConverter.tileYFromChunkY(this.chunkNumberY);
    for(let y = 0; y < sizeUnitsConverter.chunkSizeInTile; y++) {
        for (let x = 0; x < sizeUnitsConverter.chunkSizeInTile; x++) {
            mapGenerator.generate(tileNumberX + x, tileNumberY + y);
            const tileType = mapGenerator.getLandscape();
            const tile = createTile(tileNumberX + x, tileNumberY + y, tileType);
            this.objectsByType[tileType].push(tile);

            const treeMeta = mapGenerator.getTree();
            if(treeMeta) {
                const tree = createTree(treeMeta);
                this.objectsByType[tree.type].push(tree);
            }
        }
    }

    //Calculate bioms percent
    this.biomsPercent = {};
    const tilesNumberInOneChunk = sizeUnitsConverter.chunkAreaInTiles();
    this.biomsPercent[objectTypes.sandTile] = this.objectsByType[objectTypes.sandTile].length / tilesNumberInOneChunk;
    this.biomsPercent[objectTypes.waterTile] = this.objectsByType[objectTypes.waterTile].length / tilesNumberInOneChunk;
    this.biomsPercent[objectTypes.grassTile] = this.objectsByType[objectTypes.grassTile].length / tilesNumberInOneChunk;

    this.hasSlimeSpawner = this.biomsPercent[objectTypes.grassTile] >= slimeSpawnCondition.grassTilesPercent
        && mapGenerator.noise(this.chunkNumberX, this.chunkNumberY) <= slimeSpawnCondition.probability;

    Chunk.prototype.forEach ??= function(callback) {
        for(let objectWithParticularType of Object.values(this.objectsByType))
            for(let obj of objectWithParticularType)
                callback(obj);
    };

    Chunk.prototype.forEachObjWithType ??= function(objectType, callback) {
        this.objectsByType[objectType].forEach(callback);
    };
}

function World(scene, objectTypes, distanceToBorderPerChunk, slimeSpawnCondition) {
    this.distanceToBorderForLoading = distanceToBorderPerChunk;
    this.topPerChunk = 0;
    this.leftPerChunk = 0;
    this.top = 0;
    this.bottom = 0;
    this.left = 0;
    this.right = 0;
    this.chunks = [];
    this.physicsGroups = {};

    World.prototype.getChunk ??= function(chunkX, chunkY) {
        const localXPerChunk = chunkX - this.leftPerChunk;
        const localYPerChunk = chunkY - this.topPerChunk;
        const index = localXPerChunk + localYPerChunk * sizeUnitsConverter.worldWidthInChunk;
        return !this.checkChunkIsOutOfBorder(chunkX, chunkY, this.leftPerChunk, this.topPerChunk) ? this.chunks[index] : null;
    };
    World.prototype.checkChunkIsOutOfBorder ??= function(chunkX, chunkY, leftPerChunk, topPerChunk) {
        return chunkX < leftPerChunk
            || chunkX >= leftPerChunk + sizeUnitsConverter.worldWidthInChunk
            || chunkY < topPerChunk
            || chunkY >= topPerChunk + sizeUnitsConverter.worldHeightInChunk;
    };
    World.prototype.checkDistanceToBorder ??= function(pixelX, pixelY) {
        const allowedDistance = sizeUnitsConverter.chunkWidthInPixels() * this.distanceToBorderForLoading;
        return pixelX - this.left <= allowedDistance
                || this.right - pixelX <= allowedDistance
                || pixelY - this.top <= allowedDistance
                || this.bottom - pixelY <= allowedDistance;
    };
    World.prototype.generateChunksFor ??= function(pixelX, pixelY) {
        const newTopPerChunk = sizeUnitsConverter.chunkYFromPixelY(pixelY) - Math.floor(sizeUnitsConverter.worldHeightInChunk / 2);
        const newLeftPerChunk = sizeUnitsConverter.chunkXFromPixelX(pixelX) - Math.floor(sizeUnitsConverter.worldWidthInChunk / 2);
        const newChunks = [];
        for(let y = 0; y < sizeUnitsConverter.worldHeightInChunk; y++)
            for(let x = 0; x < sizeUnitsConverter.worldWidthInChunk; x++)
                newChunks[x + y * sizeUnitsConverter.worldWidthInChunk] = this.getChunk(x + newLeftPerChunk, y + newTopPerChunk)
                    ?? new Chunk(x + newLeftPerChunk, y + newTopPerChunk, slimeSpawnCondition);

        for(let chunk of this.chunks)
            if(this.checkChunkIsOutOfBorder(chunk.chunkNumberX, chunk.chunkNumberY, newLeftPerChunk, newTopPerChunk))
                chunk.forEach(obj => this.disposeToPool(obj));

        this.leftPerChunk = newLeftPerChunk;
        this.topPerChunk = newTopPerChunk;
        this.top = sizeUnitsConverter.pixelYFromChunkY(newTopPerChunk);
        this.bottom = sizeUnitsConverter.pixelYFromChunkY(newTopPerChunk + sizeUnitsConverter.worldHeightInChunk);
        this.left = sizeUnitsConverter.pixelXFromChunkX(newLeftPerChunk);
        this.right = sizeUnitsConverter.pixelXFromChunkX(newLeftPerChunk + sizeUnitsConverter.worldWidthInChunk);
        this.chunks = newChunks;
    };
    World.prototype.getAllObjectsByType ??= function() {
        const result = {};
        Object.values(objectTypes).forEach(type => result[type] = Array.from(this.physicsGroups[type].getChildren()));
        return result;
    };
    World.prototype.fillArrayWithType ??= function(objectType, array) {
        this.forEachObjectWithType(objectType, obj => array.push(obj));
        return array;
    };
    World.prototype.forEachObjectWithType ??= function(objectType, callback) {
        this.physicsGroups[objectType].children.iterate(callback);
    };
    World.prototype.forEachObjectInArea ??= function(objectType, pixelLeft, pixelTop, pixelRight, pixelBottom, callback) {
        const chunkLeft = Math.max(sizeUnitsConverter.chunkXFromPixelX(pixelLeft), this.leftPerChunk);
        const chunkRight = Math.min(sizeUnitsConverter.chunkXFromPixelX(pixelRight), this.leftPerChunk + sizeUnitsConverter.worldWidthInChunk);
        const chunkTop = Math.max(sizeUnitsConverter.chunkYFromPixelY(pixelTop), this.topPerChunk);
        const chunkBottom = Math.min(sizeUnitsConverter.chunkYFromPixelY(pixelBottom), this.topPerChunk + sizeUnitsConverter.worldHeightInChunk);
        for(let y = chunkTop; y < chunkBottom; y++)
            for(let x = chunkLeft; x < chunkRight; x++)
                this.getChunk(x, y).forEachObjWithType(
                    objectType,
                    obj => obj.x >= pixelLeft && obj.x <= pixelRight && obj.y >= pixelTop && obj.y <= pixelBottom && callback(obj)
                );
    };
    World.prototype.createPhysicsGroups ??= function(scene, objectTypes) {
        this.physicsGroups[objectTypes.waterTile] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.sandTile] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.grassTile] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.littleOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.bigOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.heightOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.deadLittleOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.deadBigOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.deadHeightOak] = scene.physics.add.staticGroup();
        this.physicsGroups[objectTypes.player] = scene.physics.add.group();
        this.physicsGroups[objectTypes.slime] = scene.physics.add.group();
        this.physicsGroups[objectTypes.fireball] = scene.physics.add.group();
        this.physicsGroups[objectTypes.explosion] = scene.physics.add.staticGroup();
    };
    World.prototype.getFromPool ??= function(objectType, pixelX, pixelY, animationKey, animationFrame) {
        const obj = this.physicsGroups[objectType].get(pixelX, pixelY, animationKey, animationFrame)
            .setActive(true)
            .setVisible(true);
        obj.body.enable = true;
        obj.colliders?.forEach(collider => collider.active = true);
        return obj;
    };
    World.prototype.disposeToPool ??= function(obj) {
        obj.setActive(false).setVisible(false);
        obj.body.enable = false;
        obj.colliders?.forEach(collider => collider.active = false);
    };
    World.prototype.removeFromChunk ??= function(obj) {
        obj.chunk?.objectsByType[obj.type].remove(obj);
    };

    this.createPhysicsGroups(scene, objectTypes);
}


function switchMinimap() {
    if(Phaser.Input.Keyboard.JustDown(userInput.switchMinimap)) {
        minimap.camera.setVisible(!minimap.camera.visible);
        updateMinimap();
    }
}

function updateMinimap() {
    if(!minimap.camera.visible) return;

    minimap.graphic.clear();

    const allMapObjectsByType = world.getAllObjectsByType();

    minimap.graphic.fillStyle(0x4287f5);
    for(let obj of allMapObjectsByType[objectTypes.waterTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0xffc800);
    for(let obj of allMapObjectsByType[objectTypes.sandTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0x83c400);
    for(let obj of allMapObjectsByType[objectTypes.grassTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.depth = world.top;

    minimap.camera.setScroll(world.left, world.top);
    minimap.camera.setBounds(world.left, world.top, sizeUnitsConverter.worldWidthInPixels(), sizeUnitsConverter.worldHeightInPixels());
}

function updateIgnorableObjectsByMinimap() {
    if(minimap.camera.visible) {
        const ignoringObjects = [player];
        //world.fillArrayWithType(objectTypes.slime, ignoringObjects);
        world.fillArrayWithType(objectTypes.waterTile, ignoringObjects);
        world.fillArrayWithType(objectTypes.sandTile, ignoringObjects);
        world.fillArrayWithType(objectTypes.grassTile, ignoringObjects);
        world.fillArrayWithType(objectTypes.fireball, ignoringObjects);
        minimap.camera.ignore(ignoringObjects);
    }
}

function createMinimap(scene, scale) {
    minimap.maxScale = 1;
    minimap.minScale = scale;
    minimap.scale = Math.min(scale, minimap.maxScale);
    minimap.minimapWidthPerPixel = sizeUnitsConverter.worldWidthInPixels() * minimap.scale;
    minimap.minimapHeightPerPixel = sizeUnitsConverter.worldHeightInPixels() * minimap.scale;
    minimap.screenXPerPixel = (config.width - minimap.minimapWidthPerPixel) / 2;
    minimap.screenYPerPixel = (config.height - minimap.minimapHeightPerPixel) / 2;

    minimap.camera = scene.cameras.add(minimap.screenXPerPixel, minimap.screenYPerPixel, minimap.minimapWidthPerPixel, minimap.minimapHeightPerPixel);
    minimap.camera.setBackgroundColor(0x000000);
    minimap.camera.setZoom(minimap.scale);
    minimap.camera.visible = false;

    minimap.graphic = scene.add.graphics();

    scene.cameras.main.ignore(minimap.graphic);

    //minimap zoom
    scene.input.on('wheel', event => {
        if(minimap.camera.visible
            && event.position.x >= minimap.camera.x
            && event.position.x <= minimap.camera.x + minimap.camera.width
            && event.position.y >= minimap.camera.y
            && event.position.y <= minimap.camera.y + minimap.camera.height) {
            const delta = event.deltaY > 0 ? -0.1 : 0.1;
            minimap.scale = Phaser.Math.Clamp(minimap.scale + delta, minimap.minScale, minimap.maxScale);
            minimap.camera.setZoom(minimap.scale);
        }
    });

    //minimap drag-to-scroll
    let isDragging = false;
    let dragStart = new Phaser.Math.Vector2();

    scene.input.on('pointerdown', pointer => {
        if(pointer.leftButtonDown()) {
            isDragging = true;
            dragStart.set(pointer.x, pointer.y);
        }
    });

    scene.input.on('pointerup', () => {
        isDragging = false;
    });

    scene.input.on('pointermove', pointer => {
        if(!isDragging) return;

        minimap.camera.scrollX -= (pointer.x - dragStart.x) / minimap.camera.zoom;
        minimap.camera.scrollY -= (pointer.y - dragStart.y) / minimap.camera.zoom;

        dragStart.set(pointer.x, pointer.y);
    });
}


function preload() {
    this.load.setBaseURL('./');
    this.load.image(objectTypes.waterTile, 'water_tile.jpg');
    this.load.image(objectTypes.sandTile, 'sand_tile.jpg');
    this.load.image(objectTypes.grassTile, 'grass_tile.jpg');
    this.load.atlas('character', 'character.png', 'character.json');
    this.load.atlas('trees', 'trees.png', 'trees.json');
    this.load.atlas('slime', 'slime.png', 'slime.json');
    this.load.atlas('fireball', 'fireball.png', 'fireball.json');
    this.load.atlas('explosion', 'explosion.png', 'explosion.json');
    this.load.on('complete', () => {
        addImageFromAtlas(this, 'trees', '0', objectTypes.littleOak);
        addImageFromAtlas(this, 'trees', '1', objectTypes.bigOak);
        addImageFromAtlas(this, 'trees', '2', objectTypes.heightOak);
        addImageFromAtlas(this, 'trees', '3', objectTypes.deadLittleOak);
        addImageFromAtlas(this, 'trees', '4', objectTypes.deadBigOak);
        addImageFromAtlas(this, 'trees', '5', objectTypes.deadHeightOak);
    });
}

function create() {
    sizeUnitsConverter = new SizeUnitsConverter(60, 60, 10, 6, 6);
    mapGenerator = new MapGenerator(sizeUnitsConverter);

    prepareSlimeAnimation(this);
    preparePlayerAnimation(this);
    prepareFireballAnimation(this);
    prepareExplosionAnimation(this);

    const slimeSpawnCondition = { grassTilesPercent: 0.75, probability: 0.05, maxSlimes: 3 };
    world = new World(this, objectTypes, 2, slimeSpawnCondition);

    player = createPlayer(this, 0, 0, 50, 60, 200,
        500, 2000, 10, 350,
        20);
    this.cameras.main.startFollow(player);

    world.generateChunksFor(player.x, player.y);

    createMinimap(this, 0.2);

    userInput = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        switchMinimap: Phaser.Input.Keyboard.KeyCodes.M
    });

    this.events.on('postupdate', () => playerFire(this, this.time.now));

    slimeSpawnTimer = this.time.addEvent({
        delay: 3000,
        callback: () => spawnSlimes(this, slimeSpawnCondition, 54, 45, 50, 450, 20, 1200, 5),
        callbackScope: this,
        loop: true
    });
}

function update(time, delta) {
    movePlayer();
    moveSlimes(time);
    moveFireballs(delta);
    switchMinimap();
    updateIgnorableObjectsByMinimap();

    if(world.checkDistanceToBorder(player.x, player.y)) {
        world.generateChunksFor(player.x, player.y);
        updateMinimap();
    }
}

const config = {
    type: Phaser.AUTO,
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        zoom: 1
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    }
};

const game = new Phaser.Game(config);