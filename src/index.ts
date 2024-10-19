import {
  nip19,
} from "nostr-tools";
import { RawData, WebSocket } from "ws";
import "jsr:@std/dotenv/load";
import { hexToBytes } from "@noble/hashes/utils";

// bind/unbind
// middleware for defaultRelay


const relayUrl = Deno.env.get("RELAY_URL")

console.log(`proxying to ${relayUrl}`);

const socketCleanup = new Map<WebSocket, () => void>;


function connectSockets(source: WebSocket, dest: WebSocket) {
  // Disconnect any existing connections before binding new one
  socketCleanup.get(source)?.()

  const forwardMessageToDest = (event: MessageEvent, isBinary) => {
    dest.send(event.data, { binary: isBinary })
  };

  const forwardMessageToSource = (event: MessageEvent, isBinary) => {
    source.send(event.data, { binary: isBinary })
  };

  const forwardErrorToSource = (err) => {
    console.log(`Connection error to ${dest.url()}`, err)
    source.send(JSON.stringify(["PROXY", "ERROR", err.message]));
  };

  const forwardCloseToDest = () => {
    dest.close()
  };

  const forwardCloseToSource = () => {
    source.close()
  };

  // Assign forwards
  source.addEventListener('message', forwardMessageToDest)
  dest.addEventListener('message', forwardMessageToSource)

  source.addEventListener('close', forwardCloseToDest)
  dest.addEventListener('close', forwardCloseToSource)

  dest.addEventListener('error', forwardErrorToSource)

  // Save forwards for later cleanup
  socketCleanup.set(source, () => {
    source.removeEventListener('message', forwardMessageToDest)
    dest.removeEventListener('message', forwardMessageToSource)

    source.removeEventListener('close', forwardCloseToDest)
    dest.removeEventListener('close', forwardCloseToSource)

    dest.removeEventListener('error', forwardErrorToSource)

    dest.close();
  })
}

function handleCustomerMessage(customerSocket: WebSocket, message: MessageEvent, useBuffer: boolean, buffer: MessageEvent[]) {
  try {
    // Parse JSON from the raw buffer
    const data = JSON.parse(typeof message === 'string' ? message : message.data.toString('utf-8'));

    if (!Array.isArray(data)) throw new Error('Message is not an array');

    console.log(`message from consumer: ${message.data}`)

    if(useBuffer){
      buffer.push(message)
      return;
    }

    const targetUrl = data[1];
    if(data[0] == 'PROXY' && targetUrl) {
      const customerDestSocket = new WebSocket(targetUrl)
      customerSocket.send(JSON.stringify(["PROXY", "CONNECTING"]));

      connectSockets(customerSocket, customerDestSocket)

      customerDestSocket.addEventListener('open', () => {
        useBuffer = false;
        customerSocket.send(JSON.stringify(["PROXY", "CONNECTED"]));
      })
      return;
    }
  } catch (err) {
    console.log("error processing message", err)
  }
}

Deno.serve((req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket: customerSocket, response } = Deno.upgradeWebSocket(req);
  let useBuffer = true;
  let buffer: MessageEvent[] = []

  customerSocket.addEventListener("open", () => {
    console.log("a customer connected");

    customerSocket.addEventListener("message", (message) => {
      handleCustomerMessage(customerSocket, message, useBuffer, buffer)
    })

    let defaultRelaySocket: WebSocket | undefined;
    defaultRelaySocket = new WebSocket(relayUrl)

    defaultRelaySocket.addEventListener("open", () => {
      console.log("connected to default relay!");

      connectSockets(customerSocket, defaultRelaySocket)

      // Send all buffered items to destination
      console.log("replaying buffer to defaultRelaySocket")
      useBuffer = false;
      buffer.forEach(bufferedMessage => {
        handleCustomerMessage(customerSocket, destSocket, bufferedMessage, useBuffer, buffer)
      })
      buffer = []
    });
  });

  return response;
});