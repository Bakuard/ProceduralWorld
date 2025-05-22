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

function createPlayer(scene) {
    scene.anims.create({
        key: 'stay',
        frames: scene.anims.generateFrameNames('character', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1
    });
    scene.anims.create({
        key: 'walk',
        frames: scene.anims.generateFrameNames('character', { start: 4, end: 7 }),
        frameRate: 7,
        repeat: -1
    });

    const player = scene.physics.add.sprite(100, 100, 'character', '0')
        .setBodySize(50, 60)
        .setOrigin(0.5, 1)
        .play('stay')
        .refreshBody();
    scene.physics.add.collider(player, physicsGroups[objectTypes.waterTile]);
    player.speed = 200;
    player.movement = new Phaser.Math.Vector2(0, 0);
    player.depth = player.y + 100;
    player.type = objectTypes.player;

    return player;
}

function generateTile(tileNumberX, tileNumberY) {
    const tileType = mapGenerator.getLandscape();

    const topPerPixel = sizeUnitsConverter.getYPerPixelFromTile(tileNumberY);
    const leftPerPixel = sizeUnitsConverter.getXPerPixelFromTile(tileNumberX);
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

function generateTree() {
    const tree = mapGenerator.getTree();
    if(tree) {
        const physicsGroup = physicsGroups[objectTypes.littleOak];
        const treeObject = physicsGroup.create(tree.xPerPixel, tree.yPerPixel, tree.treeType)
            .setOrigin(0.5, 1)
            .refreshBody();
        treeObject.depth = tree.yPerPixel + 100;
        treeObject.type = tree.treeType;
        return treeObject;
    }
    return null;
}

function Chunk(chunkNumberX, chunkNumberY) {
    this.chunkNumberX = chunkNumberX;
    this.chunkNumberY = chunkNumberY;
    this.top = sizeUnitsConverter.getYPerPixelFromChunk(chunkNumberY);
    this.left = sizeUnitsConverter.getXPerPixelFromChunk(chunkNumberX);
    this.objectsByType = {};
    Object.values(objectTypes).forEach(type => this.objectsByType[type] = []);

    Chunk.prototype.destroy ??= function() {
        for(let objectWithParticularType of Object.values(this.objectsByType))
            for(let obj of objectWithParticularType)
                obj.destroy();
    };
    Chunk.prototype.generate ??= function() {
        const tileNumberX = sizeUnitsConverter.getXPerTileFromChunk(this.chunkNumberX);
        const tileNumberY = sizeUnitsConverter.getYPerTileFromChunk(this.chunkNumberY);
        for(let y = 0; y < sizeUnitsConverter.chunkSizePerTile; y++)
            for(let x = 0; x < sizeUnitsConverter.chunkSizePerTile; x++) {
                mapGenerator.generate(tileNumberX + x, tileNumberY + y);
                const tile = generateTile(tileNumberX + x, tileNumberY + y);
                this.objectsByType[tile.type].push(tile);

                const tree = generateTree();
                if(tree)
                    this.objectsByType[tree.type].push(tree);
            }
    };

    this.generate();
}

function Map(distanceToBorderPerChunk) {
    this.distanceToBorderForLoading = distanceToBorderPerChunk;
    this.topPerChunk = 0;
    this.leftPerChunk = 0;
    this.chunks = [];
    Map.prototype.getChunk ??= function(xPerChunk, yPerChunk) {
        const localXPerChunk = xPerChunk - this.leftPerChunk;
        const localYPerChunk = yPerChunk - this.topPerChunk;
        const index = localXPerChunk + localYPerChunk * sizeUnitsConverter.worldWidthPerChunk;
        return !this.checkChunkIsOutOfBorder(xPerChunk, yPerChunk, this.leftPerChunk, this.topPerChunk) ? this.chunks[index] : null;
    };
    Map.prototype.checkChunkIsOutOfBorder ??= function(xPerChunk, yPerChunk, leftPerChunk, topPerChunk) {
        return xPerChunk < leftPerChunk
            || xPerChunk >= leftPerChunk + sizeUnitsConverter.worldWidthPerChunk
            || yPerChunk < topPerChunk
            || yPerChunk >= topPerChunk + sizeUnitsConverter.worldHeightPerChunk;
    };
    Map.prototype.checkDistanceToBorder ??= function(xPerPixel, yPerPixel) {
        const allowedDistance = sizeUnitsConverter.getChunkWidthPerPixel() * this.distanceToBorderForLoading;
        const topPerPixel = sizeUnitsConverter.getYPerPixelFromChunk(this.topPerChunk);
        const leftPerPixel = sizeUnitsConverter.getXPerPixelFromChunk(this.leftPerChunk);
        const bottomPerPixel = topPerPixel + sizeUnitsConverter.getWorldHeightPerPixel();
        const rightPerPixel = leftPerPixel + sizeUnitsConverter.getWorldWidthPerPixel();
        return xPerPixel - leftPerPixel <= allowedDistance
                || rightPerPixel - xPerPixel <= allowedDistance
                || yPerPixel - topPerPixel <= allowedDistance
                || bottomPerPixel - yPerPixel <= allowedDistance;
    };
    Map.prototype.generateChunksFor ??= function(xPerPixel, yPerPixel) {
        const newTopPerChunk = sizeUnitsConverter.getYPerChunkFromPixel(yPerPixel) - Math.floor(sizeUnitsConverter.worldHeightPerChunk / 2);
        const newLeftPerChunk = sizeUnitsConverter.getXPerChunkFromPixel(xPerPixel) - Math.floor(sizeUnitsConverter.worldWidthPerChunk / 2);
        const newChunks = [];
        for(let y = 0; y < sizeUnitsConverter.worldHeightPerChunk; y++)
            for(let x = 0; x < sizeUnitsConverter.worldWidthPerChunk; x++)
                newChunks[x + y * sizeUnitsConverter.worldWidthPerChunk] = this.getChunk(x + newLeftPerChunk, y + newTopPerChunk)
                    ?? new Chunk(x + newLeftPerChunk, y + newTopPerChunk);

        for(let chunk of this.chunks)
            if(this.checkChunkIsOutOfBorder(chunk.chunkNumberX, chunk.chunkNumberY, newLeftPerChunk, newTopPerChunk))
                chunk.destroy();

        this.leftPerChunk = newLeftPerChunk;
        this.topPerChunk = newTopPerChunk;
        this.chunks = newChunks;
    };
    Map.prototype.getAllObjectsByType ??= function() {
        const result = {};
        for(let chunk of this.chunks)
            for(let objectType of Object.keys(chunk.objectsByType))
                (result[objectType] ??= []).push(...chunk.objectsByType[objectType]);
        return result;
    };
}

function movePlayer() {
    player.movement.x = userInput.right.isDown - userInput.left.isDown;
    player.movement.y = userInput.down.isDown - userInput.up.isDown;
    player.movement.normalize().scale(player.speed);

    player.setVelocityX(player.movement.x).setVelocityY(player.movement.y);

    if(player.movement.equals(Phaser.Math.Vector2.ZERO)) {
        player.anims.play('stay', true);
    } else {
        player.setFlipX(userInput.left.isDown);
        player.anims.play('walk', true);
        player.depth = player.y + 100;
    }
}

function addImageFromAtlas(scene, atlasName, frameName, imageName) {
    const frame = scene.textures.getFrame(atlasName, frameName);
    scene.textures.addSpriteSheetFromAtlas(imageName, {
        atlas: atlasName,
        frame: frameName,
        frameWidth: frame.width,
        frameHeight: frame.height
    });
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

    const ignoringObjects = [player];
    const allMapObjectsByType = map.getAllObjectsByType();

    minimap.graphic.fillStyle(0x4287f5);
    for(let obj of allMapObjectsByType[objectTypes.waterTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);
    ignoringObjects.push(...allMapObjectsByType[objectTypes.waterTile]);

    minimap.graphic.fillStyle(0xffc800);
    for(let obj of allMapObjectsByType[objectTypes.sandTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);
    ignoringObjects.push(...allMapObjectsByType[objectTypes.sandTile]);

    minimap.graphic.fillStyle(0x83c400);
    for(let obj of allMapObjectsByType[objectTypes.grassTile])
        minimap.graphic.fillRect(obj.x, obj.y, sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight);
    ignoringObjects.push(...allMapObjectsByType[objectTypes.grassTile]);

    minimap.graphic.depth = sizeUnitsConverter.getYPerPixelFromChunk(map.topPerChunk);

    minimap.camera.setScroll(
        sizeUnitsConverter.getXPerPixelFromChunk(map.leftPerChunk),
        sizeUnitsConverter.getYPerPixelFromChunk(map.topPerChunk)
    );
    minimap.camera.setBounds(
        sizeUnitsConverter.getXPerPixelFromChunk(map.leftPerChunk),
        sizeUnitsConverter.getYPerPixelFromChunk(map.topPerChunk),
        sizeUnitsConverter.getWorldWidthPerPixel(),
        sizeUnitsConverter.getWorldHeightPerPixel()
    )
    minimap.camera.ignore(ignoringObjects);
}

function createMinimap(scene, scale) {
    minimap.maxScale = 1;
    minimap.minScale = scale;
    minimap.scale = Math.min(scale, minimap.maxScale);
    minimap.minimapWidthPerPixel = sizeUnitsConverter.getWorldWidthPerPixel() * minimap.scale;
    minimap.minimapHeightPerPixel = sizeUnitsConverter.getWorldHeightPerPixel() * minimap.scale;
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

        minimap.camera.setScroll(
            minimap.camera.scrollX - (pointer.x - dragStart.x) / minimap.camera.zoom,
            minimap.camera.scrollY - (pointer.y - dragStart.y) / minimap.camera.zoom
        );

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

    player = createPlayer(this);
    this.cameras.main.startFollow(player);

    map = new Map(4);
    map.generateChunksFor(player.x, player.y);

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
    switchMinimap();

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