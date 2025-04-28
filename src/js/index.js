import {mapGenerator, tileTypes} from './mapGenerator.js';

const sizeMeasurementUnits = {
    tileWidth: 60,
    tileHeight: 60,
    chunkSizePerTile: 4,
    worldWidthPerChunk: 3,
    worldHeightPerChunk: 3,
    getWorldWidthPerTile() {
        return this.worldWidthPerChunk * this.chunkSizePerTile;
    },
    getWorldHeightPerTile() {
        return this.worldHeightPerChunk * this.chunkSizePerTile;
    },
    getChunkWidthPerPixel() {
        return this.chunkSizePerTile * this.tileWidth;
    },
    getChunkHeightPerPixel() {
        return this.chunkSizePerTile * this.tileHeight;
    },
    getWorldWidthPerPixel() {
        return this.getChunkWidthPerPixel() * this.worldWidthPerChunk;
    },
    getWorldHeightPerPixel() {
        return this.getChunkHeightPerPixel() * this.worldHeightPerChunk;
    },
    getXPerChunkFor(xPerPixel) {
        return Math.floor(xPerPixel / this.getChunkWidthPerPixel());
    },
    getYPerChunkFor(yPerPixel) {
        return Math.floor(yPerPixel / this.getChunkHeightPerPixel());
    },
    getXPerPixel(xPerChunk) {
        return xPerChunk * this.getChunkWidthPerPixel();
    },
    getYPerPixel(yPerChunk) {
        return yPerChunk * this.getChunkHeightPerPixel();
    },
    getDistanceXPerChunk(distanceXPerPixel) {
        return Math.floor(distanceXPerPixel / this.getChunkWidthPerPixel());
    },
    getDistanceYPerChunk(distanceYPerPixel) {
        return Math.floor(distanceYPerPixel / this.getChunkHeightPerPixel());
    }
};
const physicsGroups = {};
let player;
let cursor;
let map;

function generateTile(tileNumberX, tileNumberY) {
    const tileType = mapGenerator(tileNumberX, tileNumberY);

    const topPerPixel = tileNumberY * sizeMeasurementUnits.tileHeight;
    const leftPerPixel = tileNumberX * sizeMeasurementUnits.tileWidth;
    const physicsGroup = physicsGroups[tileType];
    const tile = physicsGroup.create(leftPerPixel, topPerPixel, tileType)
        .setDisplaySize(sizeMeasurementUnits.tileWidth, sizeMeasurementUnits.tileHeight)
        .setSize(sizeMeasurementUnits.tileWidth, sizeMeasurementUnits.tileHeight)
        .setOrigin(0, 0)
        .refreshBody();
    tile.depth = 0;
    tile.physicsGroup = physicsGroup;

    return tile;
}

function Chunk(chunkNumberX, chunkNumberY) {
    this.chunkNumberX = chunkNumberX;
    this.chunkNumberY = chunkNumberY;
    this.top = chunkNumberY * sizeMeasurementUnits.getChunkHeightPerPixel();
    this.left = chunkNumberX * sizeMeasurementUnits.getChunkWidthPerPixel();
    this.objects = [];
    this.destroy = function() {
        for(let obj of this.objects)
            obj.destroy();
    };
    this.generate = function() {
        const tileNumberX = this.chunkNumberX * sizeMeasurementUnits.chunkSizePerTile;
        const tileNumberY = this.chunkNumberY * sizeMeasurementUnits.chunkSizePerTile;
        for(let y = 0; y < sizeMeasurementUnits.chunkSizePerTile; y++)
            for(let x = 0; x < sizeMeasurementUnits.chunkSizePerTile; x++) {
                const tile = generateTile(tileNumberX + x, tileNumberY + y);
                this.objects.push(tile);
            }
    };

    this.generate();
}

function Map() {
    this.topPerChunk = 0;
    this.leftPerChunk = 0;
    this.chunks = [];
    this.getChunk = function(xPerChunk, yPerChunk) {
        const localXPerChunk = xPerChunk - this.leftPerChunk;
        const localYPerChunk = yPerChunk - this.topPerChunk;
        const index = localXPerChunk + localYPerChunk * sizeMeasurementUnits.worldWidthPerChunk;
        return !this.checkChunkIsOutOfBorder(xPerChunk, yPerChunk, this.leftPerChunk, this.topPerChunk) ? this.chunks[index] : null;
    };
    this.checkChunkIsOutOfBorder = function(xPerChunk, yPerChunk, leftPerChunk, topPerChunk) {
        return xPerChunk < leftPerChunk
            || xPerChunk >= leftPerChunk + sizeMeasurementUnits.worldWidthPerChunk
            || yPerChunk < topPerChunk
            || yPerChunk >= topPerChunk + sizeMeasurementUnits.worldHeightPerChunk;
    };
    this.checkDistanceToBorder = function(xPerPixel, yPerPixel, allowedDistancePerPixel) {
        const topPerPixel = sizeMeasurementUnits.getYPerPixel(this.topPerChunk);
        const leftPerPixel = sizeMeasurementUnits.getXPerPixel(this.leftPerChunk);
        const bottomPerPixel = topPerPixel + sizeMeasurementUnits.getWorldHeightPerPixel();
        const rightPerPixel = leftPerPixel + sizeMeasurementUnits.getWorldWidthPerPixel();
        return xPerPixel - leftPerPixel <= allowedDistancePerPixel
                || rightPerPixel - xPerPixel <= allowedDistancePerPixel
                || yPerPixel - topPerPixel <= allowedDistancePerPixel
                || bottomPerPixel - yPerPixel <= allowedDistancePerPixel;
    };
    this.generateChunksFor = function(xPerPixel, yPerPixel) {
        const newTopPerChunk = sizeMeasurementUnits.getYPerChunkFor(yPerPixel) - Math.floor(sizeMeasurementUnits.worldHeightPerChunk / 2);
        const newLeftPerChunk = sizeMeasurementUnits.getXPerChunkFor(xPerPixel) - Math.floor(sizeMeasurementUnits.worldWidthPerChunk / 2);
        const newChunks = [];
        for(let y = 0; y < sizeMeasurementUnits.worldHeightPerChunk; y++)
            for(let x = 0; x < sizeMeasurementUnits.worldWidthPerChunk; x++) {
                let chunk = this.getChunk(x + newLeftPerChunk, y + newTopPerChunk);
                chunk = chunk ?? new Chunk(x + newLeftPerChunk, y + newTopPerChunk);
                newChunks[x + y * sizeMeasurementUnits.worldWidthPerChunk] = chunk;
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
    }
}


function preload() {
    this.load.setBaseURL('../resources');
    this.load.image('water', 'water_tile.jpg');
    this.load.image('sand', 'sand_tile.jpg');
    this.load.image('grass', 'grass_tile.jpg');
    this.load.atlas('character', 'character.png', 'character.json');
}

function create() {
    physicsGroups.grass = this.physics.add.staticGroup();
    physicsGroups.water = this.physics.add.staticGroup();
    physicsGroups.sand = this.physics.add.staticGroup();

    map = new Map();
    map.generateChunksFor(500, 500);

    this.anims.create({
        key: 'stay',
        frames: this.anims.generateFrameNames('character', { start: 0, end: 1 }),
        frameRate: 4,
        repeat: -1
    });
    this.anims.create({
        key: 'walk',
        frames: this.anims.generateFrameNames('character', { start: 4, end: 7 }),
        frameRate: 7,
        repeat: -1
    });

    player = this.physics.add.sprite(500, 50, 'character', '0')
        .setBodySize(50, 60)
        .play('stay');
    this.physics.add.collider(player, physicsGroups.water);
    player.speed = 200;
    player.movement = new Phaser.Math.Vector2(0, 0);
    player.depth = 100;

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

    if(map.checkDistanceToBorder(player.x, player.y, sizeMeasurementUnits.getChunkWidthPerPixel()))
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
            debug: true
        }
    }
};

const game = new Phaser.Game(config);