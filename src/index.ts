import "reflect-metadata";
import { container } from "tsyringe";
import { WebSocketServer } from "ws";

import { startup } from "./startup.js";
import Switchboard from "./network/switchboard.js";

const wss = new WebSocketServer({ port: 8000 });

wss.on("connection", (socket) => {
  const switchboard = container.resolve<Switchboard>(Switchboard.name);
  switchboard.handleConnection(socket);
});

startup();
