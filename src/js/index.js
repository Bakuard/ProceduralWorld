import {sizeUnitsConverter} from './sizeMeasurementUnits.js';
import {MapGenerator, mapObjectTypes} from './mapGenerator.js';

const mapGenerator = new MapGenerator();
const physicsGroups = {};
let player;
let cursor;
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
    scene.physics.add.collider(player, physicsGroups[mapObjectTypes.waterTile]);
    player.speed = 200;
    player.movement = new Phaser.Math.Vector2(0, 0);
    player.depth = player.y + 100;

    return player;
}

function generateTile(tileNumberX, tileNumberY) {
    const objectType = mapGenerator.getLandscape();

    const topPerPixel = sizeUnitsConverter.getYPerPixelFromTile(tileNumberY);
    const leftPerPixel = sizeUnitsConverter.getXPerPixelFromTile(tileNumberX);
    const physicsGroup = physicsGroups[objectType];
    const tile = physicsGroup.create(leftPerPixel, topPerPixel, objectType)
        .setDisplaySize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setSize(sizeUnitsConverter.tileWidth, sizeUnitsConverter.tileHeight)
        .setOrigin(0, 0)
        .refreshBody();
    tile.depth = topPerPixel;

    return tile;
}

function generateTree() {
    const tree = mapGenerator.getTree();
    if(tree) {
        const physicsGroup = physicsGroups[mapObjectTypes.littleOak];
        const treeObject = physicsGroup.create(tree.xPerPixel, tree.yPerPixel, mapObjectTypes.littleOak)
            .setOrigin(0.5, 1)
            .refreshBody();
        treeObject.depth = tree.yPerPixel + 100;
        return treeObject;
    }
    return null;
}

function Chunk(chunkNumberX, chunkNumberY) {
    this.chunkNumberX = chunkNumberX;
    this.chunkNumberY = chunkNumberY;
    this.top = sizeUnitsConverter.getYPerPixel(chunkNumberY);
    this.left = sizeUnitsConverter.getXPerPixel(chunkNumberX);
    this.objects = [];

    Chunk.prototype.destroy ??= function() {
        for(let obj of this.objects)
            obj.destroy();
    };
    Chunk.prototype.generate ??= function() {
        const tileNumberX = sizeUnitsConverter.getXPerTileFromChunk(this.chunkNumberX);
        const tileNumberY = sizeUnitsConverter.getYPerTileFromChunk(this.chunkNumberY);
        for(let y = 0; y < sizeUnitsConverter.chunkSizePerTile; y++)
            for(let x = 0; x < sizeUnitsConverter.chunkSizePerTile; x++) {
                mapGenerator.generate(tileNumberX + x, tileNumberY + y);
                const tile = generateTile(tileNumberX + x, tileNumberY + y);
                this.objects.push(tile);

                const tree = generateTree();
                if(tree)
                    this.objects.push(tree);
            }
    };

    this.generate();
}

function Map() {
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
    Map.prototype.checkDistanceToBorder ??= function(xPerPixel, yPerPixel, allowedDistancePerPixel) {
        const topPerPixel = sizeUnitsConverter.getYPerPixel(this.topPerChunk);
        const leftPerPixel = sizeUnitsConverter.getXPerPixel(this.leftPerChunk);
        const bottomPerPixel = topPerPixel + sizeUnitsConverter.getWorldHeightPerPixel();
        const rightPerPixel = leftPerPixel + sizeUnitsConverter.getWorldWidthPerPixel();
        return xPerPixel - leftPerPixel <= allowedDistancePerPixel
                || rightPerPixel - xPerPixel <= allowedDistancePerPixel
                || yPerPixel - topPerPixel <= allowedDistancePerPixel
                || bottomPerPixel - yPerPixel <= allowedDistancePerPixel;
    };
    Map.prototype.generateChunksFor ??= function(xPerPixel, yPerPixel) {
        const newTopPerChunk = sizeUnitsConverter.getYPerChunk(yPerPixel) - Math.floor(sizeUnitsConverter.worldHeightPerChunk / 2);
        const newLeftPerChunk = sizeUnitsConverter.getXPerChunk(xPerPixel) - Math.floor(sizeUnitsConverter.worldWidthPerChunk / 2);
        const newChunks = [];
        for(let y = 0; y < sizeUnitsConverter.worldHeightPerChunk; y++)
            for(let x = 0; x < sizeUnitsConverter.worldWidthPerChunk; x++) {
                let chunk = this.getChunk(x + newLeftPerChunk, y + newTopPerChunk);
                chunk = chunk ?? new Chunk(x + newLeftPerChunk, y + newTopPerChunk);
                newChunks[x + y * sizeUnitsConverter.worldWidthPerChunk] = chunk;
            }

        for(let chunk of this.chunks)
            if(this.checkChunkIsOutOfBorder(chunk.chunkNumberX, chunk.chunkNumberY, newLeftPerChunk, newTopPerChunk))
                chunk.destroy();

        this.leftPerChunk = newLeftPerChunk;
        this.topPerChunk = newTopPerChunk;
        this.chunks = newChunks;
    };
}

function movePlayer() {
    player.movement.x = cursor.right.isDown - cursor.left.isDown;
    player.movement.y = cursor.down.isDown - cursor.up.isDown;
    player.movement.normalize().scale(player.speed);

    player.setVelocityX(player.movement.x).setVelocityY(player.movement.y);

    if(player.movement.equals(Phaser.Math.Vector2.ZERO)) {
        player.anims.play('stay', true);
    } else {
        player.setFlipX(cursor.left.isDown);
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


function preload() {
    this.load.setBaseURL('../resources');
    this.load.image(mapObjectTypes.waterTile, 'water_tile.jpg');
    this.load.image(mapObjectTypes.sandTile, 'sand_tile.jpg');
    this.load.image(mapObjectTypes.grassTile, 'grass_tile.jpg');
    this.load.atlas('character', 'character.png', 'character.json');
    this.load.atlas('trees', 'trees.png', 'trees.json');
    this.load.on('complete', () => {
        addImageFromAtlas(this, 'trees', '0', mapObjectTypes.littleOak);
        addImageFromAtlas(this, 'trees', '1', mapObjectTypes.bigOak);
        addImageFromAtlas(this, 'trees', '2', mapObjectTypes.heightOak);
        addImageFromAtlas(this, 'trees', '3', mapObjectTypes.deadLittleOak);
        addImageFromAtlas(this, 'trees', '4', mapObjectTypes.deadBigOak);
        addImageFromAtlas(this, 'trees', '5', mapObjectTypes.deadHeightOak);
    });
}

function create() {
    for(let physicsGroupName of Object.values(mapObjectTypes))
        physicsGroups[physicsGroupName] = this.physics.add.staticGroup();

    player = createPlayer(this);

    map = new Map();
    map.generateChunksFor(player.x, player.y);

    cursor = this.input.keyboard.addKeys({
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S
    });

    this.cameras.main.startFollow(player);
}

function update() {
    movePlayer();

    if(map.checkDistanceToBorder(player.x, player.y, sizeUnitsConverter.getChunkWidthPerPixel() * 4))
        map.generateChunksFor(player.x, player.y);
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