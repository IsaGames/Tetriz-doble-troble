"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TetrisRoom = void 0;
const colyseus_1 = require("colyseus");
const schema_1 = require("@colyseus/schema");
class PlayerState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.score = 0;
        this.board = new schema_1.ArraySchema();
        this.piece = new schema_1.ArraySchema();
        this.pieceX = 0;
        this.pieceY = 0;
        this.dropInterval = 2000; // Velocidad fija inicial (2 segundos)
    }
}
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "score", void 0);
__decorate([
    (0, schema_1.type)(["number"]),
    __metadata("design:type", schema_1.ArraySchema)
], PlayerState.prototype, "board", void 0);
__decorate([
    (0, schema_1.type)(["number"]),
    __metadata("design:type", schema_1.ArraySchema)
], PlayerState.prototype, "piece", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "pieceX", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "pieceY", void 0);
__decorate([
    (0, schema_1.type)("number"),
    __metadata("design:type", Number)
], PlayerState.prototype, "dropInterval", void 0);
class TetrisState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.players = new schema_1.MapSchema();
    }
}
__decorate([
    (0, schema_1.type)({ map: PlayerState }),
    __metadata("design:type", Object)
], TetrisState.prototype, "players", void 0);
const pieces = [
    [1, 1, 1, 1], // I (4x1)
    [1, 1, 1, 1], // O (2x2, pero como 1D para simplificar)
    [1, 1, 1, 0, 1, 0], // T (3x2)
];
class TetrisRoom extends colyseus_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 2;
    }
    onCreate(options) {
        this.setState(new TetrisState());
        this.onMessage("move", (client, data) => this.handleMove(client, data));
        this.onMessage("rotate", (client) => this.handleRotate(client));
        this.setSimulationInterval((deltaTime) => this.update(deltaTime));
    }
    onJoin(client) {
        const player = new PlayerState();
        for (let i = 0; i < 200; i++) {
            player.board.push(0);
        }
        this.initializeBoard(player.board);
        this.state.players.set(client.sessionId, player);
        this.spawnPiece(client.sessionId);
    }
    onLeave(client) {
        this.state.players.delete(client.sessionId);
    }
    update(deltaTime) {
        const sessionIds = Array.from(this.state.players.keys());
        for (const sessionId of sessionIds) {
            const player = this.state.players.get(sessionId);
            if (player) {
                player.dropInterval -= deltaTime;
                if (player.dropInterval <= 0) {
                    this.movePiece(sessionId, 0, 1);
                    const updatedPlayer = this.state.players.get(sessionId);
                    if (updatedPlayer) {
                        updatedPlayer.dropInterval = 2000; // Reiniciar a 2000 ms
                    }
                }
            }
        }
    }
    initializeBoard(board) {
        for (let y = 18; y < 20; y++) {
            const row = Array(10).fill(1);
            const emptySpots = Math.floor(Math.random() * 3) + 1;
            for (let i = 0; i < emptySpots; i++) {
                let randomX;
                do {
                    randomX = Math.floor(Math.random() * 10);
                } while (row[randomX] === 0);
                row[randomX] = 0;
            }
            for (let x = 0; x < 10; x++) {
                board[y * 10 + x] = row[x];
            }
        }
    }
    spawnPiece(sessionId) {
        const player = this.state.players.get(sessionId);
        if (!player)
            return;
        const index = Math.floor(Math.random() * pieces.length);
        player.piece = new schema_1.ArraySchema(...pieces[index]);
        player.pieceX = Math.floor((10 - pieces[index].length / 10) / 2);
        player.pieceY = 0;
        if (this.checkCollision(player.board, player.piece, player.pieceX, player.pieceY)) {
            this.broadcast("gameOver", { playerId: sessionId, score: player.score });
            this.state.players.delete(sessionId);
        }
    }
    handleMove(client, data) {
        const player = this.state.players.get(client.sessionId);
        if (!player)
            return;
        this.movePiece(client.sessionId, data.dx, data.dy);
    }
    handleRotate(client) {
        const player = this.state.players.get(client.sessionId);
        if (!player)
            return;
        this.rotatePiece(client.sessionId);
    }
    movePiece(sessionId, dx, dy) {
        const player = this.state.players.get(sessionId);
        if (!player)
            return;
        const boardWidth = 10;
        const pieceWidth = Math.sqrt(player.piece.length);
        player.pieceX += dx;
        player.pieceY += dy;
        if (this.checkCollision(player.board, player.piece, player.pieceX, player.pieceY)) {
            player.pieceX -= dx;
            player.pieceY -= dy;
            if (dy > 0) {
                this.mergePiece(player.board, player.piece, player.pieceX, player.pieceY);
                this.clearLinesAndTransfer(sessionId);
                this.spawnPiece(sessionId);
            }
        }
    }
    rotatePiece(sessionId) {
        const player = this.state.players.get(sessionId);
        if (!player)
            return;
        // Determinar dimensiones de la pieza actual
        const pieceWidth = Math.sqrt(player.piece.length);
        const rotated = new Array(player.piece.length);
        // Calcular la rotación (90 grados en sentido horario)
        for (let y = 0; y < pieceWidth; y++) {
            for (let x = 0; x < pieceWidth; x++) {
                rotated[x * pieceWidth + (pieceWidth - 1 - y)] =
                    player.piece[y * pieceWidth + x];
            }
        }
        // Guardar la pieza original
        const oldPiece = new schema_1.ArraySchema(...player.piece);
        // Actualizar la pieza elemento por elemento
        for (let i = 0; i < rotated.length; i++) {
            player.piece[i] = rotated[i];
        }
        // Verificar colisión y revertir si es necesario
        if (this.checkCollision(player.board, player.piece, player.pieceX, player.pieceY)) {
            for (let i = 0; i < oldPiece.length; i++) {
                player.piece[i] = oldPiece[i];
            }
        }
    }
    checkCollision(board, piece, pieceX, pieceY) {
        const boardWidth = 10;
        const pieceWidth = Math.sqrt(piece.length);
        for (let y = 0; y < pieceWidth; y++) {
            for (let x = 0; x < pieceWidth; x++) {
                if (piece[y * pieceWidth + x]) {
                    // Solo verificamos bloques ocupados de la pieza
                    const newX = pieceX + x;
                    const newY = pieceY + y;
                    if (newX < 0 ||
                        newX >= boardWidth ||
                        newY >= 20 ||
                        (newY >= 0 && board[newY * boardWidth + newX] === 1) // Solo 1 bloquea
                    ) {
                        return true;
                    }
                }
            }
        }
        return false;
    }
    mergePiece(board, piece, pieceX, pieceY) {
        const boardWidth = 10;
        const pieceWidth = Math.sqrt(piece.length);
        for (let y = 0; y < pieceWidth; y++) {
            for (let x = 0; x < pieceWidth; x++) {
                if (piece[y * pieceWidth + x]) {
                    const newX = pieceX + x;
                    const newY = pieceY + y;
                    if (newY >= 0 && newY < 20) {
                        board[newY * boardWidth + newX] = 1;
                    }
                }
            }
        }
    }
    updateSpeed(player) {
        player.dropInterval = 2000; // Velocidad constante
    }
    clearLinesAndTransfer(sessionId) {
        const player = this.state.players.get(sessionId);
        if (!player)
            return;
        let linesCleared = false;
        for (let y = 19; y >= 0; y--) {
            const rowStart = y * 10;
            if (Array.from(player.board.slice(rowStart, rowStart + 10)).every((cell) => cell === 1)) {
                player.board.splice(rowStart, 10);
                player.board.unshift(...Array(10).fill(0));
                player.score += 10;
                this.updateSpeed(player);
                linesCleared = true;
            }
        }
        if (linesCleared) {
            this.state.players.forEach((opponent, id) => {
                if (id !== sessionId) {
                    let lastRow = Math.floor(opponent.board.findIndex((cell, i) => cell === 1 && i % 10 === 0) /
                        10);
                    if (lastRow === -1)
                        lastRow = 19;
                    const lastRowContent = opponent.board.slice(lastRow * 10, (lastRow + 1) * 10);
                    const inverseRow = lastRowContent.map((cell) => (cell === 1 ? 0 : 1));
                    const replacePosition = (lastRow - 1) * 10;
                    if (replacePosition >= 0) {
                        for (let i = 0; i < 10; i++) {
                            opponent.board[replacePosition + i] = inverseRow[i];
                        }
                    }
                }
            });
        }
    }
}
exports.TetrisRoom = TetrisRoom;
