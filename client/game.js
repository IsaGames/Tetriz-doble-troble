document.addEventListener("DOMContentLoaded", async () => {
  const client = new Colyseus.Client("wss://tetris-server-iez8.onrender.com"); // Usa wss para WebSocket seguro
  // const client = new Colyseus.Client("ws://localhost:2567");
  const room = await client.joinOrCreate("tetris");

  const canvas1 = document.getElementById("tetrisCanvas1");
  const canvas2 = document.getElementById("tetrisCanvas2");
  const ctx1 = canvas1.getContext("2d");
  const ctx2 = canvas2.getContext("2d");
  const blockSizeActive = 30;
  const blockSizeOpponent = 15;
  let playerId = null;
  let isPaused = false;

  room.onStateChange((state) => {
    playerId = room.sessionId;
    const players = state.players;
    const activePlayer = players.get(playerId);
    const opponent = Array.from(players).find(([id]) => id !== playerId)?.[1];

    renderBoard(
      ctx1,
      activePlayer.board,
      blockSizeActive,
      activePlayer.piece,
      activePlayer.pieceX,
      activePlayer.pieceY
    );
    if (opponent) {
      renderBoard(
        ctx2,
        opponent.board,
        blockSizeOpponent,
        opponent.piece,
        opponent.pieceX,
        opponent.pieceY
      );
    }
    document.getElementById("score1").textContent = activePlayer.score;
    document.getElementById("score2").textContent = opponent
      ? opponent.score
      : 0;
  });

  room.onMessage("gameOver", (data) => {
    if (data.playerId === playerId) {
      alert(`Game Over! Tu puntaje: ${data.score}`);
    } else {
      alert(`¡El adversario perdió! Su puntaje: ${data.score}`);
    }
  });

  document.addEventListener("keydown", (e) => {
    if (isPaused) return;
    switch (e.key) {
      case "ArrowLeft":
        room.send("move", { dx: -1, dy: 0 });
        break;
      case "ArrowRight":
        room.send("move", { dx: 1, dy: 0 });
        break;
      case "ArrowUp":
        room.send("rotate");
        break;
      case "ArrowDown":
        room.send("move", { dx: 0, dy: 1 });
        break;
      case "p":
      case "P":
        isPaused = !isPaused;
        break;
    }
  });

  function renderBoard(ctx, board, size, piece, pieceX, pieceY) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 10; x++) {
        if (board[y * 10 + x]) {
          ctx.fillStyle = "blue";
          ctx.fillRect(x * size, y * size, size - 1, size - 1);
        }
      }
    }
    if (piece) {
      ctx.fillStyle = "red";
      const pieceWidth = Math.sqrt(piece.length);
      for (let y = 0; y < pieceWidth; y++) {
        for (let x = 0; x < pieceWidth; x++) {
          if (piece[y * pieceWidth + x]) {
            ctx.fillRect(
              (pieceX + x) * size,
              (pieceY + y) * size,
              size - 1,
              size - 1
            );
          }
        }
      }
    }
  }
});
