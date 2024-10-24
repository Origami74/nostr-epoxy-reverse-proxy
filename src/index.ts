import "reflect-metadata";
import { container } from "tsyringe";

import { startup } from "./startup.js";
import Switchboard from "./network/switchboard.js";
import { WebSocketServer } from "ws";

// Deno.serve({ hostname: "0.0.0.0", port: 8000 }, (req) => {
//   if (req.headers.get("upgrade") != "websocket") {
//     return new Response(null, { status: 501 });
//   }

//   const { socket, response } = Deno.upgradeWebSocket(req);
//   socket.addEventListener("open", () => {
//     const switchboard = container.resolve<Switchboard>(Switchboard.name);
//     switchboard.handleConnection(socket);
//   });

//   return response;
// });

const wss = new WebSocketServer({ port: 8000 });

wss.on("connection", (socket) => {
  const switchboard = container.resolve<Switchboard>(Switchboard.name);
  // @ts-expect-error
  switchboard.handleConnection(socket);
});

startup();
