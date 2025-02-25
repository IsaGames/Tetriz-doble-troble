import { Server } from "colyseus";
import * as http from "http";
import { TetrisRoom } from "./TetrisRoom";

const port = 2567;
const server = http.createServer();
const gameServer = new Server({ server });

gameServer.define("tetris", TetrisRoom);
gameServer.listen(port);
console.log(`Server running on ws://localhost:${port}`);
