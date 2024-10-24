import { inject, injectable } from "tsyringe";
import { Buffer } from "node:buffer";
import { WebSocket as CustomWebSocket, MessageEvent as CustomMessageEvent, ErrorEvent as CustomErrorEvent } from "ws";

import OutboundNetwork from "./outbound.ts";
import logger from "../logger.ts";
import { CashRegister, type ICashRegister } from "../pricing/cashRegister.ts";
import { TrafficMeter, type ITrafficMeter } from "./monitoring/trafficMeter.ts";
import type { Payment } from "../types/payment.ts";

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

export interface ISwitchboard {
  handleConnection(source: WebSocket): void;
}

@injectable()
export default class Switchboard implements ISwitchboard {
  private log = logger.extend("Switchboard");
  private cashRegister: ICashRegister;
  private network: OutboundNetwork;

  private socketConnection = new Map<WebSocket, CustomWebSocket>();

  private socketCleanup = new Map<WebSocket, () => void>();
  private trafficMeter: ITrafficMeter;

  constructor(
    @inject(OutboundNetwork.name) network: OutboundNetwork,
    @inject(CashRegister.name) cashRegister: ICashRegister,
    @inject(TrafficMeter.name) trafficMonitor: ITrafficMeter,
  ) {
    this.network = network;
    this.cashRegister = cashRegister;
    this.trafficMeter = trafficMonitor;
  }

  // connect an incoming socket to the relay (optional)
  connectSocketToRelay(source: WebSocket, relay?: CustomWebSocket) {
    // Disconnect any existing connections before binding new one
    this.socketCleanup.get(source)?.();

    let buffer: any[] = [];

    // Source listeners
    const handleSourceMessage = async (event: MessageEvent) => {
      if (typeof event.data === "string" && event.data.startsWith('["PROXY')) {
        // handle "PROXY" message
        try {
          const message = JSON.parse(event.data) as string[];
          if (!Array.isArray(message) || message[0] !== "PEROXY") throw new Error("Broken proxy message");

          const targetUrl = message[1];
          const payment: Payment = JSON.parse(message[2]);

          // user is paying
          if (payment) {
            const collectedAmount = await this.cashRegister.collectPayment(payment);

            // add allowance to the meter
            // this.trafficMeter.set(payment.)

            // create upstream socket
            const upstream = new CustomWebSocket(targetUrl, { agent: this.network.agent });
            this.connectSocketToUpstream(source, upstream);
          } else {
            // tell user they have to pay
            source.send(JSON.stringify(["PROXY", "PAYMENT_REQUIRED", 1000000]));
          }
        } catch (error) {
          if (error instanceof Error) source.send(JSON.stringify(["PROXY", "ERROR", error.message]));
        }
      } else if (relay) {
        // there is a relay, either forward or buffer message
        if (relay.readyState === WebSocket.CONNECTING) {
          // upstream is connecting, buffer message
          buffer.push(event.data);
        } else if (relay.readyState === WebSocket.OPEN) {
          // upstgream is connected, forward message
          relay.send(event.data);
        }
      }
    };
    const handleSourceClose = () => {
      if (relay && relay.readyState === WebSocket.OPEN) relay.close();
    };

    // Relay listeners
    let relayCleanup: (() => void) | undefined = undefined;
    if (relay) {
      const handleRelayMessage = (event: CustomMessageEvent) => {
        if (Array.isArray(event.data)) {
          source.send(Buffer.concat(event.data));
        } else source.send(event.data);
      };
      const handleRelayError = (err: CustomErrorEvent) => {
        this.log(`Connection error to ${relay.url}`, err);
        // close source socket because relay is unreachable
        source.close();
      };
      const handleRelayClose = () => {
        if (source.readyState === WebSocket.OPEN) source.close();
      };
      const handleRelayConnected = () => {
        if (source.readyState !== WebSocket.OPEN) {
          // close the relay connection if the source isn't open
          relay.close();
        } else {
          // replay buffer
          for (const data of buffer) relay.send(data);
          buffer = [];
        }
      };

      // add listeners
      relay.addEventListener("open", handleRelayConnected);
      relay.addEventListener("message", handleRelayMessage);
      relay.addEventListener("close", handleRelayClose);
      relay.addEventListener("error", handleRelayError);

      this.socketConnection.set(source, relay);
      relayCleanup = () => {
        relay.removeEventListener("open", handleRelayConnected);
        relay.removeEventListener("message", handleRelayMessage);
        relay.removeEventListener("close", handleRelayClose);
        relay.removeEventListener("error", handleRelayError);

        this.socketConnection.delete(source);
      };
    }

    // Assign source listeners
    source.addEventListener("message", handleSourceMessage);
    source.addEventListener("close", handleSourceClose);

    // Save forwards for later cleanup
    this.socketCleanup.set(source, () => {
      source.removeEventListener("message", handleSourceMessage);
      source.removeEventListener("close", handleSourceClose);

      relayCleanup?.();
      relay?.close();
    });
  }

  // connects an incoming socket to a remote relay
  connectSocketToUpstream(source: WebSocket, remote: CustomWebSocket) {
    // Disconnect any existing connections before binding new one
    this.socketCleanup.get(source)?.();

    let dataSent = 0;
    let dataReceived = 0;
    let totalDataTransfer = () => dataSent + dataReceived;

    source.send(JSON.stringify(["PROXY", "CONNECTING"]));

    // Source listeners
    const handleSourceMessage = (event: MessageEvent) => {
      this.trafficMeter.measureOut(event.data);
      dataSent += Buffer.byteLength(event.data, "utf-8");
      console.log(`Sent: ${event.data}`);
      console.log(`Total Data Sent/Received in bytes: ${dataSent}/${dataReceived} total ${totalDataTransfer()}`);

      // send data to remote
      if (remote.readyState === WebSocket.OPEN) {
        remote.send(event.data);
      }
    };

    const handleSourceClose = () => {
      if (remote.readyState === WebSocket.OPEN) remote.close();
    };

    // Remote listeners
    const handleRemoteMessage = (event: CustomMessageEvent) => {
      // TODO: maybe also measure the data here?
      if (Array.isArray(event.data)) {
        source.send(Buffer.concat(event.data));
      } else {
        source.send(event.data);
      }
    };
    const handleRemoteConnected = () => {
      source.send(JSON.stringify(["PROXY", "CONNECTED"]));
    };

    const handleRemoteError = (err: CustomErrorEvent) => {
      this.log(`Connection error to ${remote.url}`, err);
      source.send(JSON.stringify(["PROXY", "ERROR", err.message]));
    };
    const handleRemoteClose = () => {
      // TODO: forward code and reason
      if (source.readyState === WebSocket.OPEN) source.close();
    };

    source.addEventListener("message", handleSourceMessage);
    source.addEventListener("close", handleSourceClose);

    remote.addEventListener("open", handleRemoteConnected);
    remote.addEventListener("message", handleRemoteMessage);
    remote.addEventListener("error", handleRemoteError);
    remote.addEventListener("close", handleRemoteClose);

    this.socketConnection.set(source, remote);

    // set cleanup
    this.socketCleanup.set(source, () => {
      source.removeEventListener("message", handleSourceMessage);
      source.removeEventListener("close", handleSourceClose);

      remote.removeEventListener("open", handleRemoteConnected);
      remote.removeEventListener("error", handleRemoteError);
      remote.removeEventListener("message", handleRemoteMessage);
      remote.removeEventListener("close", handleRemoteClose);

      remote.close();
      this.socketConnection.delete(source);
    });
  }

  handleConnection(source: WebSocket) {
    // connect to the upstream relay by default
    let relay: CustomWebSocket | undefined;
    if (UPSTREAM) {
      // connect the socket to the relay
      relay = new CustomWebSocket(UPSTREAM, { agent: this.network.agent });
    }

    // connect the source to the relay
    this.connectSocketToRelay(source, relay);
  }
}
