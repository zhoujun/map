'use strict';

/**
 * @fileoverview 本文件主要实现六边形拼接地图逻辑。具体实现说明请查看博客：http://www.cnblogs.com/fingerblog/
 * @author finger.zhou@gmail.com
 */

var TILE_WIDTH  = 112;  // 地块宽度
var TILE_HEIGHT = 129;  // 地块高度
var TILE_SIDE = 64;     // 地块边长

// 地块行的像素高度
var TILE_ROW_HEIGHT = (TILE_HEIGHT + TILE_SIDE) / 2;

var NODE_ANCHOR_POINTS = [[0, 0],
    [0, 0], [0.5, 0], [1, 0],
    [0, 0.5], [0.5, 0.5], [1, 0.5],
    [0, 1], [0.5, 1], [1, 1]];

/**
 * 设置Node的AnchorPoint和Position.
 * 注意：这里直接修改了Node.prototype.
 * @param {number} anchor 参考数字键盘。1-左下角对齐， 7-左上角对齐，5-居中对齐。。。
 * @param {number} x
 * @param {number} y
 * @returns {cc.Node} Node自己
 */
cc.Node.prototype.setAp = function(anchor, x, y){
    var anchorPoint = NODE_ANCHOR_POINTS[anchor];
    this.setAnchorPoint(anchorPoint[0], anchorPoint[1]);
    this.setPosition(x, y);
    return this;
};

/**
 * <li> MapLayer是地图实现类，继承cc.Layer。实现一个无限滚动的地图。</li>
 * <li> 地图由正六边形的地块拼接而成。地图的世界坐标以(0, 0)为原点。地块的列(col)为世界坐标x, 行(row)为世界坐标y。</li>
 * <li> 地图绘制使用了卡马克缓存算法。地块的节点数是固定的，每次只是更新原有节点坐标和内容。</li>
 *
 * @class
 * @extends cc.Layer
 */
var MapLayer = cc.Layer.extend({

    ctor: function(){

        this._super();

        this._size = cc.director.getWinSize();

        this._canvas = null;
        this._scrollView = null;
        this._bufferNodes = [];

        this._bufferStartCR = cc.p(0, 0);
        this._worldStartCR = cc.p(0, 0);

        this.bufferTileSize = cc.size(0, 0);

        this.init();

    },

    init: function(){

        this.initCanvas_();
        this.initScrollView_();
        this.initMap_(cc.p(1000, 1000));

    },

    initCanvas_: function(){
        this._canvas = new cc.Node();
        this._canvas.setContentSize(cc.size(0xfffffff, 0xfffffff));
        this._canvas.setAnchorPoint(cc.p(0, 0));
    },

    initScrollView_: function(){
        var bufferOffset = cc.p(-TILE_WIDTH * 3, -TILE_ROW_HEIGHT * 3);
        var width = this._size.width - bufferOffset.x;
        var height = this._size.height - bufferOffset.y;

        this.bufferTileSize.width  = Math.floor(width / TILE_WIDTH) + 3;
        this.bufferTileSize.height = Math.floor(height / TILE_ROW_HEIGHT) + 3;

        this._scrollView = new cc.ScrollView();
        this._scrollView.initWithViewSize(cc.size(width, height), this._canvas);
        this._scrollView.setClippingToBounds(false);
        this._scrollView.setBounceable(false);
        this._scrollView.setAnchorPoint(cc.p(0, 0));
        this._scrollView.setDelegate(this);
        this._scrollView.setPosition(bufferOffset);
        this.addChild(this._scrollView);

    },

    initMap_: function(worldStartPos){
        if(!this._canvas){
            cc.error('canvas is undefined.');
            return;
        }

        this._worldStartCR = this.convertPos2ColRow(worldStartPos);
        this.forEachTile(function(col, row){
            this.drawTile_(col, row);
        }.bind(this));

        this._scrollView.setContentOffset(cc.p(-worldStartPos.x, -worldStartPos.y));
    },

    scrollViewDidScroll: function (/*scrollView*/) {
        if (!this._scrollView) {
            cc.error('scrollView is undefined.');
            return;
        }

        this.moveMap_();

    },

    drawTile_: function(col, row){
        var pos = this.convertColRow2Pos(cc.p(col, row));
        var zOrder = this.calculateTileZOrder(col, row);

        var node = new cc.Node();
        node.setAp(5, pos.x, pos.y);
        node.key = col + '-' + row;

        this._canvas.addChild(node, zOrder);
        var tile = new cc.Sprite(res.Tile_png);
        node.addChild(tile);

        this._bufferNodes.push(node);

    },

    moveMap_: function(){
        var worldCurrentPos = this._scrollView.getContentOffset();
        worldCurrentPos.x *= -1;
        worldCurrentPos.y *= -1;

        if (worldCurrentPos.x >= 0 && worldCurrentPos.y >= 0) {
            var worldCurrentCR = this.convertPos2ColRow(worldCurrentPos);
            var offsetX = worldCurrentCR.x - this._worldStartCR.x;
            var offsetY = worldCurrentCR.y - this._worldStartCR.y;

            if (Math.abs(offsetX) >= 1 || Math.abs(offsetY) >= 1) {
                var offsetCR = cc.p(offsetX, offsetY);
                this.updateBufferTiles_(offsetCR);
            }
        }
    },

    /**
     * 地图滑动后，需要更新不在屏幕内的缓存地块。这里使用了卡马克地图缓冲原理。
     * @param {cc.Point} offsetCR 偏移的行列
     */
    updateBufferTiles_ : function (offsetCR) {
        this._bufferStartCR.x += this.bufferTileSize.width;
        this._bufferStartCR.y += this.bufferTileSize.height;

        var startBufferCR = cc.p(this._bufferStartCR.x, this._bufferStartCR.y);
        var startWorldCR = cc.p(this._worldStartCR.x, this._worldStartCR.y);

        // 行列更新的时候，需要有个开始位置，这个就是标记开始位置的
        var updateOffsetCR = cc.p(0, 0);
        // 向左右移动
        if(offsetCR.x > 0){        // 右
            startBufferCR.x = this._bufferStartCR.x + this.bufferTileSize.width;
            startWorldCR.x = this._worldStartCR.x + this.bufferTileSize.width;
            updateOffsetCR.x = 1;
        } else if(offsetCR.x < 0){ // 左
            startBufferCR.x = this._bufferStartCR.x + offsetCR.x;
            startWorldCR.x = this._worldStartCR.x + offsetCR.x;
            updateOffsetCR.x = offsetCR.x;
        }

        // 向上下移动
        if(offsetCR.y > 0){        // 下
            startBufferCR.y = this._bufferStartCR.y + this.bufferTileSize.height;
            startWorldCR.y = this._worldStartCR.y + this.bufferTileSize.height;
            updateOffsetCR.y = 1;
        } else if(offsetCR.y < 0){ // 上
            startBufferCR.y = this._bufferStartCR.y + offsetCR.y;
            startWorldCR.y = this._worldStartCR.y + offsetCR.y;
            updateOffsetCR.y = offsetCR.y;
        }

        // 更新Buffer的方向，比如向上，还是向下; 向右，还是向左。
        var updateDirCR = cc.p(-1, -1);
        // 更新Buffer的行列数。比如向右更新N列, 向上更新N行。
        var updateLenCR = cc.p(Math.abs(offsetCR.x), Math.abs(offsetCR.y));

        if(updateLenCR.x != 0){
            updateDirCR.x = offsetCR.x / updateLenCR.x;
        }
        if(updateLenCR.y != 0){
            updateDirCR.y = offsetCR.y / updateLenCR.y;
        }

        var needUpdateCR = [];
        var self = this;

        function updateColumn_() {
            for(var col = startBufferCR.x; col < startBufferCR.x + updateLenCR.x; col ++){
                var indexCR = cc.p(col, startBufferCR.y - updateOffsetCR.y);
                var count = self.bufferTileSize.height - Math.abs(offsetCR.y);
                while(count > 0){
                    var indexWorldCR = cc.p(startWorldCR.x + (indexCR.x - startBufferCR.x),
                        startWorldCR.y + (indexCR.y - startBufferCR.y));
                    self.updateOneTile_(indexCR, indexWorldCR);
                    needUpdateCR.push(indexWorldCR);
                    indexCR.y -= updateDirCR.y;
                    count --;
                }
            }
        }

        function updateRow_() {
            for(var row = startBufferCR.y; row < startBufferCR.y + updateLenCR.y; row ++){
                var indexCR = cc.p(startBufferCR.x - updateOffsetCR.x, row);
                var count = self.bufferTileSize.width - Math.abs(offsetCR.x);
                while(count > 0){
                    var indexWorldCR = cc.p(startWorldCR.x + (indexCR.x - startBufferCR.x),
                        startWorldCR.y + (indexCR.y - startBufferCR.y));
                    self.updateOneTile_(indexCR, indexWorldCR);
                    needUpdateCR.push(indexWorldCR);
                    indexCR.x -= updateDirCR.x;
                    count--;
                }
            }
        }

        function updateIntersect_(){
            for(var col = startBufferCR.x; col< startBufferCR.x + updateLenCR.x; col ++){
                for(var row = startBufferCR.y; row < startBufferCR.y + updateLenCR.y; row ++){
                    var indexWorldCR = cc.p(startWorldCR.x + (col - startBufferCR.x),
                        startWorldCR.y + (row - startBufferCR.y));
                    self.updateOneTile_(cc.p(col, row), indexWorldCR);
                    needUpdateCR.push(indexWorldCR);
                }
            }
        }

        // 当x轴移动的时候，更新列
        if(offsetCR.x != 0){
            updateColumn_();
        }

        // 当y轴移动的时候，更新行
        if(offsetCR.y != 0){
            updateRow_();
        }

        // 当x和y轴都移动的时候。更新交叉区域。
        if(offsetCR.x != 0 && offsetCR.y != 0){
            updateIntersect_();
        }

        cc.log("needUpdateCR", needUpdateCR.length);

        this._worldStartCR = cc.p(this._worldStartCR.x + offsetCR.x, this._worldStartCR.y + offsetCR.y);
        this._bufferStartCR.x = (this._bufferStartCR.x + offsetCR.x) % this.bufferTileSize.width;
        this._bufferStartCR.y = (this._bufferStartCR.y + offsetCR.y) % this.bufferTileSize.height;
    },

    updateOneTile_: function(indexBufferCR, indexWorldCR){
        var col = indexBufferCR.x % this.bufferTileSize.width;
        var row = indexBufferCR.y % this.bufferTileSize.height;

        var index = row * this.bufferTileSize.width + col;
        if(index > this._bufferNodes.length - 1){
            cc.error('update tile, buffer node index out of bounds.');
            return;
        }

        var node = this._bufferNodes[index];
        if(!node) {
            cc.error('update tile, node not found in buffer.');
            return;
        }

        var key = indexWorldCR.x + '|' + indexWorldCR.y;
        var pos = this.convertColRow2Pos(indexWorldCR);

        node.key = key;
        node.setPosition(pos);
        node.removeAllChildren();

        var tile = new cc.Sprite(res.Tile_png);
        node.addChild(tile);
    },

    /**
     * 计算地块的zOrder, 地块zOrder值大小顺序为 左 < 右, 上 < 下。
     * row相同时，以col排序，主要是避免同一行的node之间的zOrder频繁变化。
     * @param {Number} col 世界坐标系的x
     * @param {Number} row 世界坐标系的y
     * @returns {Number}
     */
    calculateTileZOrder: function (col, row) {
        var zOrder = col - row;
        zOrder += (col + row) / (1 + Math.abs(col) + Math.abs(row));
        zOrder = Math.floor(zOrder);
        return zOrder;
    },

    /**
     * 地块是根据大陆的世界坐标系进行遍历，遍历的大小为卡马克缓存区域的大小。
     * @param {Function} func 回调函数参数为世界坐标的(列，行)
     */
    forEachTile: function (func) {
        for (var j = 0; j < this.bufferTileSize.height; j++) {
            for (var i = 0; i < this.bufferTileSize.width; i++) {
                var col = (i + this._worldStartCR.x);
                var row = (j + this._worldStartCR.y);
                func(col, row);
            }
        }
    },

    /**
     * 像素坐标转换为地块的世界坐标。
     * 六边形地块的奇数行需要右移半个格子，交错排列才能无缝拼接。所以在坐标转换的时候需要注意一下。
     * @param {cc.Point} pos
     * @returns {cc.Point}
     */
    convertPos2ColRow: function (pos) {
        var colRow = cc.p(0, Math.floor((pos.y + TILE_ROW_HEIGHT / 2) / TILE_ROW_HEIGHT));
        var diffX = 0.0;
        if (colRow.y % 2 == 1) {
            diffX = TILE_WIDTH / 2;
        }
        colRow.x = Math.floor((pos.x + diffX + TILE_WIDTH / 2) / TILE_WIDTH);
        return colRow;
    },

    /**
     * 世界坐标行列转换成像素坐标，特别说明一下此处列代表的世界坐标的x，行代表的世界坐标的y。
     * @param {cc.Point} colRow 列行
     * @returns {cc.Point}
     */
    convertColRow2Pos: function (colRow) {
        var diffX = 0.0;
        if (colRow.y % 2 == 1) {
            diffX = TILE_WIDTH / 2;
        }
        return cc.p(colRow.x * TILE_WIDTH - diffX,
            colRow.y * TILE_ROW_HEIGHT);
    }
});