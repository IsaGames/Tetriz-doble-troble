import { Room, Client } from "colyseus";
import { Schema, type, ArraySchema, MapSchema } from "@colyseus/schema";

class PlayerState extends Schema {
  @type("number") score: number = 0;
  @type(["number"]) board: ArraySchema<number> = new ArraySchema<number>();
  @type(["number"]) piece: ArraySchema<number> = new ArraySchema<number>();
  @type("number") pieceX: number = 0;
  @type("number") pieceY: number = 0;
  @type("number") dropInterval: number = 2000; // Velocidad fija inicial (2 segundos)
}

class TetrisState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

const pieces = [
  [1, 1, 1, 1], // I (4x1)
  [1, 1, 1, 1], // O (2x2, pero como 1D para simplificar)
  [1, 1, 1, 0, 1, 0], // T (3x2)
];

export class TetrisRoom extends Room<TetrisState> {
  maxClients = 2;

  onCreate(options: any) {
    this.setState(new TetrisState());
    this.onMessage("move", (client, data) => this.handleMove(client, data));
    this.onMessage("rotate", (client) => this.handleRotate(client));
    this.setSimulationInterval((deltaTime) => this.update(deltaTime));
  }

  onJoin(client: Client) {
    const player = new PlayerState();
    for (let i = 0; i < 200; i++) {
      player.board.push(0);
    }
    this.initializeBoard(player.board);
    this.state.players.set(client.sessionId, player);
    this.spawnPiece(client.sessionId);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  update(deltaTime: number) {
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

  initializeBoard(board: ArraySchema<number>) {
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

  spawnPiece(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const index = Math.floor(Math.random() * pieces.length);
    player.piece = new ArraySchema<number>(...pieces[index]);
    player.pieceX = Math.floor((10 - pieces[index].length / 10) / 2);
    player.pieceY = 0;
    if (
      this.checkCollision(
        player.board,
        player.piece,
        player.pieceX,
        player.pieceY
      )
    ) {
      this.broadcast("gameOver", { playerId: sessionId, score: player.score });
      this.state.players.delete(sessionId);
    }
  }

  handleMove(client: Client, data: { dx: number; dy: number }) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.movePiece(client.sessionId, data.dx, data.dy);
  }

  handleRotate(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.rotatePiece(client.sessionId);
  }

  movePiece(sessionId: string, dx: number, dy: number) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    const boardWidth = 10;
    const pieceWidth = Math.sqrt(player.piece.length);

    player.pieceX += dx;
    player.pieceY += dy;
    if (
      this.checkCollision(
        player.board,
        player.piece,
        player.pieceX,
        player.pieceY
      )
    ) {
      player.pieceX -= dx;
      player.pieceY -= dy;
      if (dy > 0) {
        this.mergePiece(
          player.board,
          player.piece,
          player.pieceX,
          player.pieceY
        );
        this.clearLinesAndTransfer(sessionId);
        this.spawnPiece(sessionId);
      }
    }
  }

  rotatePiece(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;

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
    const oldPiece = new ArraySchema<number>(...player.piece);

    // Actualizar la pieza elemento por elemento
    for (let i = 0; i < rotated.length; i++) {
      player.piece[i] = rotated[i];
    }

    // Verificar colisión y revertir si es necesario
    if (
      this.checkCollision(
        player.board,
        player.piece,
        player.pieceX,
        player.pieceY
      )
    ) {
      for (let i = 0; i < oldPiece.length; i++) {
        player.piece[i] = oldPiece[i];
      }
    }
  }

  checkCollision(
    board: ArraySchema<number>,
    piece: ArraySchema<number>,
    pieceX: number,
    pieceY: number
  ) {
    const boardWidth = 10;
    const pieceWidth = Math.sqrt(piece.length);
    for (let y = 0; y < pieceWidth; y++) {
      for (let x = 0; x < pieceWidth; x++) {
        if (piece[y * pieceWidth + x]) {
          // Solo verificamos bloques ocupados de la pieza
          const newX = pieceX + x;
          const newY = pieceY + y;
          if (
            newX < 0 ||
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

  mergePiece(
    board: ArraySchema<number>,
    piece: ArraySchema<number>,
    pieceX: number,
    pieceY: number
  ) {
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

  updateSpeed(player: PlayerState) {
    player.dropInterval = 2000; // Velocidad constante
  }

  clearLinesAndTransfer(sessionId: string) {
    const player = this.state.players.get(sessionId);
    if (!player) return;
    let linesCleared = false;

    for (let y = 19; y >= 0; y--) {
      const rowStart = y * 10;
      if (
        Array.from(player.board.slice(rowStart, rowStart + 10)).every(
          (cell) => cell === 1
        )
      ) {
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
          let lastRow = Math.floor(
            opponent.board.findIndex((cell, i) => cell === 1 && i % 10 === 0) /
              10
          );
          if (lastRow === -1) lastRow = 19;
          const lastRowContent = opponent.board.slice(
            lastRow * 10,
            (lastRow + 1) * 10
          );
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
