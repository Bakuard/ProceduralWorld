import {SizeUnitsConverter} from './sizeMeasurementUnits.js';
import {objectTypes} from "./objectTypes.js";
import {MapGenerator} from "./mapGenerator.js";

const physicsGroups = {};
const minimap = {};
let sizeUnitsConverter;
let mapGenerator;
let player;
let userInput;
let map;
let slimeSpawnTimer;

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

function createPlayer(scene, x, y, width, height, speed) {
    const player = scene.physics.add.sprite(x, y, 'character', '0')
        .setBodySize(width, height)
        .setOrigin(0.5, 1)
        .play('player_stay')
        .refreshBody();
    scene.physics.add.collider(player, physicsGroups[objectTypes.waterTile]);
    player.speed = speed;
    player.movement = new Phaser.Math.Vector2(0, 0);
    player.depth = player.y + 100;
    player.type = objectTypes.player;

    return player;
}

function movePlayer() {
    player.movement.x = userInput.right.isDown - userInput.left.isDown;
    player.movement.y = userInput.down.isDown - userInput.up.isDown;
    player.movement.normalize().scale(player.speed);

    player.setVelocityX(player.movement.x).setVelocityY(player.movement.y);

    if(player.movement.equals(Phaser.Math.Vector2.ZERO)) {
        player.anims.play('player_stay', true);
    } else {
        player.setFlipX(userInput.left.isDown);
        player.anims.play('player_walk', true);
        player.depth = player.y + 100;
    }
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

function createSlime(scene, width, height, speed, roamingRadius, chunk) {
    const x = Phaser.Math.Between(chunk.left + width/2, chunk.right - width/2);
    const y = Phaser.Math.Between(chunk.top + height, chunk.bottom);
    const slime = scene.physics.add.sprite(x, y, 'slime', '0')
        .setDisplaySize(width, height)
        .setOrigin(0.5, 1)
        .play('slime_stay')
        .refreshBody();
    scene.physics.add.collider(slime, physicsGroups[objectTypes.player]);
    scene.physics.add.collider(slime, physicsGroups[objectTypes.slime]);
    scene.physics.add.collider(slime, physicsGroups[objectTypes.waterTile]);
    slime.depth = slime.y + 100;
    slime.type = objectTypes.slime;
    slime.speed = speed;
    slime.spawnPointX = x;
    slime.spawnPointY = y;
    slime.aimX = x;
    slime.aimY = y;
    slime.movement = new Phaser.Math.Vector2(0, 0);
    slime.roamingRadius = roamingRadius;
    slime.on('animationupdate', (anim, frame, sprite) => {
        if(anim.key === 'slime_walk')
            if(frame.index >= 0 && frame.index <= 4 || frame.index >= 10 && frame.index <= 11)
                slime.setVelocity(0, 0);
            else
                slime.setVelocityX(slime.movement.x).setVelocityY(slime.movement.y);
    });
    chunk.objectsByType[objectTypes.slime].push(slime);
}

function spawnSlimes(scene, slimeSpawnCondition, width, height, speed, roamingRadius) {
    for(let chunk of map.chunks)
        if(chunk.hasSlimeSpawner && chunk.objectsByType[objectTypes.slime].length < slimeSpawnCondition.maxSlimes)
            createSlime(scene, width, height, speed, roamingRadius, chunk);
}

function moveSlimes() {
    const slimes = map.fillArrayWithType(objectTypes.slime, []);
    for(let slime of slimes) {
        if(Phaser.Geom.Rectangle.Contains(slime.getBounds(), slime.aimX, slime.aimY)) {
            slime.aimX = Phaser.Math.Between(slime.spawnPointX - slime.roamingRadius, slime.spawnPointX + slime.roamingRadius);
            slime.aimY = Phaser.Math.Between(slime.spawnPointY - slime.roamingRadius, slime.spawnPointY + slime.roamingRadius);
            slime.aimX = Phaser.Math.Clamp(slime.aimX, map.left, map.right);
            slime.aimY = Phaser.Math.Clamp(slime.aimY, map.top, map.bottom);

            slime.movement.x = slime.aimX - slime.x;
            slime.movement.y = slime.aimY - slime.y;
            slime.movement.normalize().scale(slime.speed);

            slime.anims.play('slime_walk', true);
        }
        slime.depth = slime.y + 100;
    }
}


function createTile(tileNumberX, tileNumberY, tileType) {
    const topPerPixel = sizeUnitsConverter.pixelYFromTileY(tileNumberY);
    const leftPerPixel = sizeUnitsConverter.pixelXFromTileX(tileNumberX);
    const physicsGroup = physicsGroups[tileType];
    const tile = physicsGroup.create(leftPerPixel, topPerPixel, tileType)
        .setDisplaySize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setSize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setOrigin(0, 0)
        .refreshBody();
    tile.depth = topPerPixel;
    tile.type = tileType;

    return tile;
}

function createTree(treeMeta) {
    const physicsGroup = physicsGroups[objectTypes.littleOak];
    const treeObject = physicsGroup.create(treeMeta.xPerPixel, treeMeta.yPerPixel, treeMeta.treeType)
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
            this.objectsByType[tile.type].push(tile);

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

    Chunk.prototype.destroy ??= function() {
        for(let objectWithParticularType of Object.values(this.objectsByType))
            for(let obj of objectWithParticularType)
                obj.destroy();
    };
}

function Map(distanceToBorderPerChunk, slimeSpawnCondition) {
    this.distanceToBorderForLoading = distanceToBorderPerChunk;
    this.topPerChunk = 0;
    this.leftPerChunk = 0;
    this.top = 0;
    this.bottom = 0;
    this.left = 0;
    this.right = 0;
    this.chunks = [];

    Map.prototype.getChunk ??= function(xPerChunk, yPerChunk) {
        const localXPerChunk = xPerChunk - this.leftPerChunk;
        const localYPerChunk = yPerChunk - this.topPerChunk;
        const index = localXPerChunk + localYPerChunk * sizeUnitsConverter.worldWidthInChunk;
        return !this.checkChunkIsOutOfBorder(xPerChunk, yPerChunk, this.leftPerChunk, this.topPerChunk) ? this.chunks[index] : null;
    };
    Map.prototype.checkChunkIsOutOfBorder ??= function(xPerChunk, yPerChunk, leftPerChunk, topPerChunk) {
        return xPerChunk < leftPerChunk
            || xPerChunk >= leftPerChunk + sizeUnitsConverter.worldWidthInChunk
            || yPerChunk < topPerChunk
            || yPerChunk >= topPerChunk + sizeUnitsConverter.worldHeightInChunk;
    };
    Map.prototype.checkDistanceToBorder ??= function(xPerPixel, yPerPixel) {
        const allowedDistance = sizeUnitsConverter.chunkWidthInPixels() * this.distanceToBorderForLoading;
        return xPerPixel - this.left <= allowedDistance
                || this.right - xPerPixel <= allowedDistance
                || yPerPixel - this.top <= allowedDistance
                || this.bottom - yPerPixel <= allowedDistance;
    };
    Map.prototype.generateChunksFor ??= function(xPerPixel, yPerPixel) {
        const newTopPerChunk = sizeUnitsConverter.chunkYFromPixelY(yPerPixel) - Math.floor(sizeUnitsConverter.worldHeightInChunk / 2);
        const newLeftPerChunk = sizeUnitsConverter.chunkXFromPixelX(xPerPixel) - Math.floor(sizeUnitsConverter.worldWidthInChunk / 2);
        const newChunks = [];
        for(let y = 0; y < sizeUnitsConverter.worldHeightInChunk; y++)
            for(let x = 0; x < sizeUnitsConverter.worldWidthInChunk; x++)
                newChunks[x + y * sizeUnitsConverter.worldWidthInChunk] = this.getChunk(x + newLeftPerChunk, y + newTopPerChunk)
                    ?? new Chunk(x + newLeftPerChunk, y + newTopPerChunk, slimeSpawnCondition);

        for(let chunk of this.chunks)
            if(this.checkChunkIsOutOfBorder(chunk.chunkNumberX, chunk.chunkNumberY, newLeftPerChunk, newTopPerChunk))
                chunk.destroy();

        this.leftPerChunk = newLeftPerChunk;
        this.topPerChunk = newTopPerChunk;
        this.top = sizeUnitsConverter.pixelYFromChunkY(newTopPerChunk);
        this.bottom = sizeUnitsConverter.pixelYFromChunkY(newTopPerChunk + sizeUnitsConverter.worldHeightInChunk);
        this.left = sizeUnitsConverter.pixelXFromChunkX(newLeftPerChunk);
        this.right = sizeUnitsConverter.pixelXFromChunkX(newLeftPerChunk + sizeUnitsConverter.worldWidthInChunk);
        this.chunks = newChunks;
    };
    Map.prototype.getAllObjectsByType ??= function() {
        const result = {};
        Object.values(objectTypes).forEach(type => result[type] = []);
        for(let chunk of this.chunks)
            for(let objectType of Object.keys(chunk.objectsByType))
                result[objectType].push(...chunk.objectsByType[objectType]);
        return result;
    };
    Map.prototype.fillArrayWithType ??= function(objectType, array) {
        for(let chunk of this.chunks)
            for(let obj of chunk.objectsByType[objectType])
                array.push(obj);
        return array;
    };
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

    const allMapObjectsByType = map.getAllObjectsByType();

    minimap.graphic.fillStyle(0x4287f5);
    for(let obj of allMapObjectsByType[objectTypes.waterTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0xffc800);
    for(let obj of allMapObjectsByType[objectTypes.sandTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.fillStyle(0x83c400);
    for(let obj of allMapObjectsByType[objectTypes.grassTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);

    minimap.graphic.depth = map.top;

    minimap.camera.setScroll(map.left, map.top);
    minimap.camera.setBounds(map.left, map.top, sizeUnitsConverter.worldWidthInPixels(), sizeUnitsConverter.worldHeightInPixels());
}

function updateIgnorableObjectsByMinimap() {
    if(minimap.camera.visible) {
        const ignoringObjects = [player];
        //map.fillArrayWithType(objectTypes.slime, ignoringObjects);
        map.fillArrayWithType(objectTypes.waterTile, ignoringObjects);
        map.fillArrayWithType(objectTypes.sandTile, ignoringObjects);
        map.fillArrayWithType(objectTypes.grassTile, ignoringObjects);
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
    this.load.setBaseURL('../resources');
    this.load.image(objectTypes.waterTile, 'water_tile.jpg');
    this.load.image(objectTypes.sandTile, 'sand_tile.jpg');
    this.load.image(objectTypes.grassTile, 'grass_tile.jpg');
    this.load.atlas('character', 'character.png', 'character.json');
    this.load.atlas('trees', 'trees.png', 'trees.json');
    this.load.atlas('slime', 'slime.png', 'slime.json');
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
    for(let physicsGroupName of Object.values(objectTypes))
        physicsGroups[physicsGroupName] = this.physics.add.staticGroup();

    sizeUnitsConverter = new SizeUnitsConverter(60, 60, 5, 11, 11);
    mapGenerator = new MapGenerator(sizeUnitsConverter);

    prepareSlimeAnimation(this);
    preparePlayerAnimation(this);

    player = createPlayer(this, 0, 0, 50, 60, 200);
    this.cameras.main.startFollow(player);

    const slimeSpawnCondition = { grassTilesPercent: 0.75, probability: 0.02, maxSlimes: 3 };
    map = new Map(4, slimeSpawnCondition);
    map.generateChunksFor(player.x, player.y);

    slimeSpawnTimer = this.time.addEvent({
        delay: 3000,
        callback: spawnSlimes,
        args: [this, slimeSpawnCondition, 54, 45, 50, sizeUnitsConverter.chunkWidthInPixels() * 1.5],
        callbackScope: this,
        loop: true
    });

    createMinimap(this, 0.2);

    userInput = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        switchMinimap: Phaser.Input.Keyboard.KeyCodes.M
    });
}

function update() {
    movePlayer();
    moveSlimes();
    switchMinimap();
    updateIgnorableObjectsByMinimap();

    if(map.checkDistanceToBorder(player.x, player.y)) {
        map.generateChunksFor(player.x, player.y);
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