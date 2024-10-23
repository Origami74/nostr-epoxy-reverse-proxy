import { inject, injectable } from "tsyringe";
import { WebSocket as CustomWebSocket } from "ws";

import OutboundNetwork from "./proxy.ts";
import logger from "../logger.ts";
import { CashRegister, type ICashRegister } from "../pricing/cashRegister.ts";

const UPSTREAM = Deno.env.get("UPSTREAM");

const socketCleanup = new Map<WebSocket, () => void>();

function connectSockets(source: WebSocket, dest: CustomWebSocket) {
  // Disconnect any existing connections before binding new one
  socketCleanup.get(source)?.();

  const forwardMessageToDest = (event: MessageEvent) => {
    // Prevent proxy request from being forwarded to destination
    if (event.data.startsWith('["PROXY')) {
      return;
    }

    dest.send(event.data);
  };

  const forwardMessageToSource = (event: MessageEvent) => {
    source.send(event.data);
  };

  const forwardErrorToSource = (err) => {
    this.log(`Connection error to ${dest.url}`, err);
    source.send(JSON.stringify(["PROXY", "ERROR", err.message]));
  };

  const forwardCloseToDest = () => {
    if (dest.readyState === WebSocket.OPEN) {
      dest.close();
    }
  };

  const forwardCloseToSource = () => {
    source.close();
  };

  // Assign forwards
  source.addEventListener("message", forwardMessageToDest);
  dest.addEventListener("message", forwardMessageToSource);

  source.addEventListener("close", forwardCloseToDest);
  dest.addEventListener("close", forwardCloseToSource);

  // TODO: If dest opens, but source is already closed, then close/cleanup dest.

  dest.addEventListener("error", forwardErrorToSource);

  // Save forwards for later cleanup
  socketCleanup.set(source, () => {
    source.removeEventListener("message", forwardMessageToDest);
    dest.removeEventListener("message", forwardMessageToSource);

    source.removeEventListener("close", forwardCloseToDest);
    dest.removeEventListener("close", forwardCloseToSource);

    dest.removeEventListener("error", forwardErrorToSource);

    dest.close();
  });
}

async function handleCustomerMessage(
  customerSocket: WebSocket,
  message: MessageEvent,
  useBuffer: boolean,
  buffer: MessageEvent[],
): Promise<void> {
  try {
    const data = JSON.parse(message.data);

    if (!Array.isArray(data)) throw new Error("Message is not an array");

    this.log(`message from consumer: ${message.data}`);

    if (useBuffer) {
      buffer.push(message);
      return;
    }

    const targetUrl = data[1];
    const payment: Payment | undefined = data[2];

    if (data[0] == "PROXY" && targetUrl) {
      const userPaid = await this.cashRegister.collectPayment(payment);

      if (!userPaid) {
        customerSocket.send(JSON.stringify(["PROXY", "PAYMENT_REQUIRED", products]));
        return;
      }

      const customerDestSocket = new CustomWebSocket(targetUrl);
      customerSocket.send(JSON.stringify(["PROXY", "CONNECTING"]));

      connectSockets(customerSocket, customerDestSocket);

      customerDestSocket.addEventListener("open", () => {
        useBuffer = false;
        customerSocket.send(JSON.stringify(["PROXY", "CONNECTED"]));
      });
      return;
    }
  } catch (err) {
    this.log(`error processing message: ${err.message}`);
  }
}

export interface ISwitchboard {}

@injectable()
export default class Switchboard implements ISwitchboard {
  private log = logger.extend("Switchboard");
  private cashRegister: ICashRegister;
  private network: OutboundNetwork;

  constructor(
    @inject(OutboundNetwork.name) network: OutboundNetwork,
    @inject(CashRegister.name) cashRegister: ICashRegister,
  ) {
    this.network = network;
    this.cashRegister = cashRegister;
  }

  handleConnection(downstream: WebSocket) {
    let buffer: any[] = [];
    let upstream: CustomWebSocket | undefined;

    // handle incoming messages
    const handleMessage = async (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as string[];
        if (!Array.isArray(message)) throw new Error("Message is not an array");

        if (message[0] === "PROXY" && message[1]) {
          const payment = message[1];
          const userPaid = await this.cashRegister.collectPayment(payment);

          if (!userPaid) {
            downstream.send(JSON.stringify(["PROXY", "PAYMENT_REQUIRED", products]));
            return;
          }

          const customerDestSocket = new CustomWebSocket(targetUrl);
          downstream.send(JSON.stringify(["PROXY", "CONNECTING"]));

          connectSockets(downstream, customerDestSocket);

          customerDestSocket.addEventListener("open", () => {
            useBuffer = false;
            downstream.send(JSON.stringify(["PROXY", "CONNECTED"]));
          });
        } else if (upstream?.readyState !== WebSocket.OPEN) {
          // buffer message for upstream
          buffer.push(event.data);
        }
      } catch (error) {}
    };

    // connect to the upstream relay by default
    let upstreamRelay: CustomWebSocket | undefined;
    if (UPSTREAM) {
      upstreamRelay = new CustomWebSocket(UPSTREAM, { agent: this.network.agent });

      upstreamRelay.addEventListener("open", () => {
        this.log("Connected to upstream relay!");

        connectSockets(downstream, upstreamRelay!);

        // Send all buffered items to destination
        this.log("replaying buffer to defaultRelaySocket");
        useBuffer = false;
        buffer.forEach((bufferedMessage) => {
          handleCustomerMessage(downstream, bufferedMessage, useBuffer, buffer);
        });
        buffer = [];
      });
    }
  }
}
