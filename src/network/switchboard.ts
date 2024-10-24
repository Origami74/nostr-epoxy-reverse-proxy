import { inject, injectable } from "tsyringe";
import { Buffer, Blob } from "node:buffer";
import { WebSocket as CustomWebSocket, MessageEvent as CustomMessageEvent, ErrorEvent as CustomErrorEvent } from "ws";
import { PRICE_PER_KIB, UPSTREAM } from "../env.ts";
import OutboundNetwork from "./outbound.ts";
import logger from "../logger.ts";
import { CashRegister, type ICashRegister } from "../pricing/cashRegister.ts";
import { TrafficMeter, type ITrafficMeter } from "./monitoring/trafficMeter.ts";
import type { Payment } from "../types/payment.ts";

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

          // customer is paying
          if (payment) {
            const collectedAmount = await this.cashRegister.collectPayment(payment);

            // Set the traffic meter
            const allowanceInKiB = collectedAmount / PRICE_PER_KIB;
            this.trafficMeter.set(allowanceInKiB);

            // create upstream socket
            const upstream = new CustomWebSocket(targetUrl, { agent: this.network.agent });
            upstream.binaryType = "arraybuffer"; // Needed to prevent having to convert Node Buffers to ArrayBuffers

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
          relay.send(event.data, { binary: typeof event.data != "string" });
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
        this.forwardEvent(source, event);
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
          for (const data of buffer) relay.send(data, { binary: typeof data != "string" });
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

    source.send(JSON.stringify(["PROXY", "CONNECTING"]));

    // Source listeners
    const handleSourceMessage = (event: MessageEvent) => {
      const meterRunning = this.trafficMeter.measureUpstream(event.data);

      if (!meterRunning) {
        source.close(1, "Connection bankrupted");
        remote.close(); // TODO: Cleanup
        return;
      }

      // send data to remote
      if (remote.readyState === WebSocket.OPEN) {
        remote.send(event.data, { binary: typeof event.data != "string" });
      }
    };

    const handleSourceClose = () => {
      if (remote.readyState === WebSocket.OPEN) remote.close();
    };

    // Remote listeners
    const handleRemoteMessage = (event: CustomMessageEvent) => {
      const meterRunning = this.trafficMeter.measureDownstream(event.data);

      if (!meterRunning) {
        source.close(1, "Connection bankrupted");
        remote.close(); // TODO: Cleanup
        return;
      }

      this.forwardEvent(source, event);
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

  private forwardEvent(downstream: WebSocket, event: CustomMessageEvent) {
    if (typeof event.data == "string") {
      downstream.send(event.data);
    } else if (event.data instanceof ArrayBuffer) {
      downstream.send(event.data);
    } else {
      console.log("Unexpected type of event.data");
    }
  }

  handleConnection(source: WebSocket) {
    // connect to the upstream relay by default
    let relay: CustomWebSocket | undefined;
    if (UPSTREAM) {
      // connect the socket to the relay
      relay = new CustomWebSocket(UPSTREAM, { agent: this.network.agent });
      relay.binaryType = "arraybuffer"; // Needed to prevent having to convert Node Buffers to ArrayBuffers
    }

    // connect the source to the relay
    this.connectSocketToRelay(source, relay);
  }
}
