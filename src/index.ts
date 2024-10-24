import "reflect-metadata";
import { container } from "tsyringe";

import { startup } from "./startup.ts";
import "jsr:@std/dotenv/load";
import Switchboard from "./network/switchboard.ts";

Deno.serve({ hostname: "0.0.0.0", port: 8000 }, (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  socket.addEventListener("open", () => {
    const switchboard = container.resolve<Switchboard>(Switchboard.name);
    switchboard.handleConnection(socket);
  });

  return response;
});

startup();
