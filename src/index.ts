import 'reflect-metadata';
import { startup } from "./startup.ts";
import "jsr:@std/dotenv/load";
import { WebSocket as ProxyWebSocket } from "ws";

const relayPrivateKey = Deno.env.get("RELAY_PRIVATEKEY");
const relayUrl = Deno.env.get("UPSTREAM");

console.log(`Proxy ${relayUrl}`);

Deno.serve({ hostname: "0.0.0.0", port: 8000 }, (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket: customerSocket, response } = Deno.upgradeWebSocket(req);
  let useBuffer = true;
  let buffer: MessageEvent[] = [];

  customerSocket.addEventListener("open", () => {
    console.log("a customer connected");

    customerSocket.addEventListener("message", (message) => {
      handleCustomerMessage(customerSocket, message, useBuffer, buffer);
    });

    let defaultRelaySocket: ProxyWebSocket | undefined;
    defaultRelaySocket = new ProxyWebSocket(relayUrl);

    defaultRelaySocket.addEventListener("open", () => {
      console.log("connected to default relay!");

      connectSockets(customerSocket, defaultRelaySocket);

      // Send all buffered items to destination
      console.log("replaying buffer to defaultRelaySocket");
      useBuffer = false;
      buffer.forEach((bufferedMessage) => {
        handleCustomerMessage(customerSocket, bufferedMessage, useBuffer, buffer);
      });
      buffer = [];
    });
  });

  return response;
});

startup();
