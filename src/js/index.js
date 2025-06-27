import {SizeUnitsConverter} from './sizeUnitsConverter.js';
import {objectTypes} from "./objectTypes.js";
import {MapGenerator} from "./mapGenerator.js";
import {GridContainer} from "./gridContainer.js";
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
        .setDepth(y)
        .play('player_stay')
        .refreshBody();
    scene.physics.add.collider(player, world.physicsGroups[objectTypes.waterTile]);
    player.speed = speed;
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
    if(player.body.velocity.y !== 0 && player.body.velocity.x !== 0) {
        player.body.velocity.x *= 0.707106; //sin 45 degree
        player.body.velocity.y *= 0.707106; //cos 45 degree
    }
    player.body.velocity.scale(player.speed);

    if(player.body.velocity.equals(Phaser.Math.Vector2.ZERO))
        player.anims.play('player_stay', true);
    else {
        player.anims.play('player_walk', true);
        player.setDepth(player.y);
    }

    if(player.body.velocity.x !== 0)
        player.setFlipX(userInput.left.isDown);
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

function createSlime(scene, width, height, speed, roamingRadius, maxHealth, alertRadiusInPixel, damage, chunk) {
    const x = Phaser.Math.Between(chunk.pixelLeft + width/2, chunk.pixelRight - width/2);
    const y = Phaser.Math.Between(chunk.pixelTop + height, chunk.pixelBottom);
    const slime = world.getFromPool(objectTypes.slime, x, y, 'slime', '11', chunk)
        .setDisplaySize(width, height)
        .setOrigin(0.5, 1)
        .setDepth(y)
        .play('slime_stay')
        .refreshBody();
    slime.colliders ??= [scene.physics.add.collider(slime, world.physicsGroups[objectTypes.waterTile])];
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
    slime.alertRadiusInChunkPixel = alertRadiusInPixel;
    slime.damage = damage;
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
}

function spawnSlimes(scene, slimeSpawnCondition, width, height, speed, roamingRadius, maxHealth, alertRadiusInPixel, damage) {
    for(let chunk of world.grid.chunks)
        if(chunk.hasSlimeSpawner && chunk.countByTypeInChunk(objectTypes.slime) < slimeSpawnCondition.maxSlimes)
            createSlime(scene, width, height, speed, roamingRadius, maxHealth, alertRadiusInPixel, damage, chunk);
}

function moveSlimes(time) {
    world.grid.forEachObjWithType(objectTypes.slime, slime => {
        if(slime.state === slimeStates.roam) {
            if(Phaser.Geom.Rectangle.Contains(slime.getBounds(), slime.aimX, slime.aimY)) {
                slime.anims.play('slime_walk', true);

                slime.aimX = Phaser.Math.Between(slime.spawnPointX - slime.roamingRadius, slime.spawnPointX + slime.roamingRadius);
                slime.aimY = Phaser.Math.Between(slime.spawnPointY - slime.roamingRadius, slime.spawnPointY + slime.roamingRadius);
                slime.aimX = Phaser.Math.Clamp(slime.aimX, world.grid.border.pixelLeft, world.grid.border.pixelRight);
                slime.aimY = Phaser.Math.Clamp(slime.aimY, world.grid.border.pixelTop, world.grid.border.pixelBottom);

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
        slime.setDepth(slime.y);
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
        .setDepth(y + 30)
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
    world.grid.forEachObjWithType(objectTypes.fireball, fireball => {
        if(!fireball.active) return;

        fireball.lifeTimeInMillis -= deltaTime;
        fireball.setDepth(fireball.y + 30);
        if(fireball.lifeTimeInMillis <= 0)
            world.disposeToPoolAndRemoveFromGrid(fireball);
    });
}

function onFireballCollision(fireball, obstacle) {
    world.disposeToPoolAndRemoveFromGrid(fireball);
    createExplosion(this, obstacle.x, obstacle.y);

    if(obstacle.type === objectTypes.slime) {
        obstacle.currentHealth -= fireball.damage;
        if(obstacle.currentHealth <= 0) {
            world.disposeToPoolAndRemoveFromGrid(obstacle);
        } else {
            world.grid.forEachObjectInArea(objectTypes.slime,
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
        .setDepth(y)
        .setOrigin(0.5, 1);
    explosion.anims.play('explosion', true);
    explosion.type = objectTypes.explosion;
    explosion.on('animationcomplete', (animation, frame) => world.disposeToPoolAndRemoveFromGrid(explosion));
}


function createTile(tileNumberX, tileNumberY, tileType) {
    const topPerPixel = sizeUnitsConverter.topPixelOfTile(tileNumberY);
    const leftPerPixel = sizeUnitsConverter.leftPixelOfTile(tileNumberX);
    const tile = world.getFromPool(tileType, leftPerPixel, topPerPixel, tileType)
        .setDisplaySize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setSize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setOrigin(0, 0)
        .setDepth(Number.NEGATIVE_INFINITY)
        .refreshBody();
    tile.type = tileType;
    return tile;
}

function createTree(treeMeta) {
    const treeObject = world.getFromPool(treeMeta.treeType, treeMeta.pixelX, treeMeta.pixelY, treeMeta.treeType)
        .setOrigin(0.5, 1)
        .setDepth(treeMeta.pixelY)
        .refreshBody();
    treeObject.type = treeMeta.treeType;
    return treeObject;
}

function World(scene, distanceToBorderPerChunk, slimeSpawnCondition) {
    this.distanceToBorderForLoading = distanceToBorderPerChunk * sizeUnitsConverter.chunkWidthInPixels();
    this.grid = new GridContainer(sizeUnitsConverter, 0, 0);
    this.physicsGroups = {};

    World.prototype.checkDistanceToBorder ??= function(pixelX, pixelY) {
        return this.grid.checkDistanceToBorder(pixelX, pixelY, this.distanceToBorderForLoading);
    };
    World.prototype.generateChunksFor ??= function(pixelX, pixelY) {
        const result = this.grid.shiftCenterToPixel(pixelX, pixelY);

        for(const chunk of result.destroyedChunks)
            chunk.forEachObj(obj => this.disposeToPool(obj));

        for(const chunk of result.createdChunks) {
            //terrain generation
            chunk.forEachTile((tileX, tileY) => {
                mapGenerator.generate(tileX, tileY);
                const tileType = mapGenerator.getTileType();
                createTile(tileX, tileY, tileType);

                const treeMeta = mapGenerator.getTree();
                if(treeMeta && this.grid.isPixelInMap(treeMeta.pixelX, treeMeta.pixelY)) createTree(treeMeta);
            });

            //Calculate bioms percent
            chunk.biomsPercent = {};
            const tilesNumberInOneChunk = sizeUnitsConverter.chunkAreaInTiles();
            chunk.biomsPercent[objectTypes.sandTile] = chunk.countByTypeInChunk(objectTypes.sandTile) / tilesNumberInOneChunk;
            chunk.biomsPercent[objectTypes.waterTile] = chunk.countByTypeInChunk(objectTypes.waterTile) / tilesNumberInOneChunk;
            chunk.biomsPercent[objectTypes.grassTile] = chunk.countByTypeInChunk(objectTypes.grassTile) / tilesNumberInOneChunk;

            chunk.hasSlimeSpawner = chunk.biomsPercent[objectTypes.grassTile] >= slimeSpawnCondition.grassTilesPercent
                && mapGenerator.noise(chunk.chunkX, chunk.chunkY) <= slimeSpawnCondition.probability;
        }
    };
    World.prototype.createPhysicsGroups ??= function(scene) {
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
    World.prototype.getFromPool ??= function(objectType, pixelX, pixelY, animationKey, animationFrame, chunk) {
        const obj = this.physicsGroups[objectType].get(pixelX, pixelY, animationKey, animationFrame)
            .setActive(true)
            .setVisible(true);
        obj.body.enable = true;
        obj.colliders?.forEach(collider => collider.active = true);
        obj.chunk = chunk ?? this.grid.getChunkByPixel(obj.x, obj.y);
        obj.chunk.addToChunk(obj, objectType);
        return obj;
    };
    World.prototype.disposeToPool ??= function(obj) {
        obj.setActive(false).setVisible(false);
        obj.body.enable = false;
        obj.setDepth(0);
        obj.colliders?.forEach(collider => collider.active = false);
    };
    World.prototype.disposeToPoolAndRemoveFromGrid ??= function(obj) {
        this.disposeToPool(obj);
        obj.chunk.removeFromChunk(obj, obj.type);
    }

    this.createPhysicsGroups(scene);
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

    const allMapObjectsByType = world.grid.getAllObjectsGroupedByType();

    minimap.graphic.fillStyle(0x4287f5);
    for(let obj of allMapObjectsByType[objectTypes.waterTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0xffc800);
    for(let obj of allMapObjectsByType[objectTypes.sandTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0x83c400);
    for(let obj of allMapObjectsByType[objectTypes.grassTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.depth = world.grid.border.pixelTop;

    minimap.camera.setScroll(world.grid.border.pixelLeft, world.grid.border.pixelTop);
    minimap.camera.setBounds(world.grid.border.pixelLeft, world.grid.border.pixelTop, sizeUnitsConverter.worldWidthInPixels(), sizeUnitsConverter.worldHeightInPixels());
}

function updateIgnorableObjectsByMinimap() {
    if(minimap.camera.visible) {
        const ignoringObjects = [player];
        //world.grid.fillArrayWithType(objectTypes.slime, ignoringObjects);
        world.grid.fillArrayWithType(objectTypes.waterTile, ignoringObjects);
        world.grid.fillArrayWithType(objectTypes.sandTile, ignoringObjects);
        world.grid.fillArrayWithType(objectTypes.grassTile, ignoringObjects);
        world.grid.fillArrayWithType(objectTypes.fireball, ignoringObjects);
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


//Sorting objects by depth in Phaser sometimes ignores certain objects. A manual call to depthSort() is required.
function fixRenderingOrder(scene) {
    scene.children.sortChildrenFlag = true;
    scene.children.depthSort();
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
    sizeUnitsConverter = new SizeUnitsConverter(60, 60, 10, 5, 5);
    mapGenerator = new MapGenerator(sizeUnitsConverter);

    prepareSlimeAnimation(this);
    preparePlayerAnimation(this);
    prepareFireballAnimation(this);
    prepareExplosionAnimation(this);

    const slimeSpawnCondition = { grassTilesPercent: 0.75, probability: 0.05, maxSlimes: 3 };
    world = new World(this, 2, slimeSpawnCondition);

    player = createPlayer(this, 0, 0, 50, 60, 200, 500, 1500, 10, 350, 20);
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
        callback: () => spawnSlimes(this, slimeSpawnCondition, 54, 45, 50, 300, 20, 600, 5),
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

    fixRenderingOrder(this);
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