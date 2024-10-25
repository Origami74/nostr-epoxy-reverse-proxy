import { inject, injectable } from "tsyringe";
import { WebSocket, MessageEvent, ErrorEvent as CustomErrorEvent } from "ws";
import { Proof } from "@cashu/cashu-ts";

import { MINT_UNIT, MINT_URL, PRICE_PER_KIB, UPSTREAM } from "../env.js";
import OutboundNetwork, { type IOutboundNetwork } from "./outbound.js";
import logger from "../logger.js";
import { CashRegister, type ICashRegister } from "../pricing/cashRegister.js";
import { TrafficMeter, type ITrafficMeter } from "./monitoring/trafficMeter.js";
import PubkeyResolver, { type IPubkeyResolver } from "./pubkeyResolver.js";

export interface ISwitchboard {
  handleConnection(source: WebSocket): void;
}

@injectable()
export default class Switchboard implements ISwitchboard {
  private log = logger.extend("Switchboard");
  private cashRegister: ICashRegister;
  private network: IOutboundNetwork;
  private resolve: IPubkeyResolver;

  private socketConnection = new Map<WebSocket, WebSocket>();
  private socketCleanup = new Map<WebSocket, () => void>();
  private trafficMeter: ITrafficMeter;

  constructor(
    @inject(OutboundNetwork.name) network: IOutboundNetwork,
    @inject(CashRegister.name) cashRegister: ICashRegister,
    @inject(TrafficMeter.name) trafficMonitor: ITrafficMeter,
    @inject(PubkeyResolver.name) resolve: IPubkeyResolver,
  ) {
    this.network = network;
    this.cashRegister = cashRegister;
    this.trafficMeter = trafficMonitor;
    this.resolve = resolve;
  }

  // connect an incoming socket to the relay (optional)
  connectSocketToRelay(source: WebSocket, relay?: WebSocket) {
    // Disconnect any existing connections before binding new one
    this.socketCleanup.get(source)?.();

    // deno-lint-ignore no-explicit-any
    let buffer: any[] = [];

    // Source listeners
    const handleSourceMessage = async (event: MessageEvent) => {
      if (typeof event.data === "string" && event.data.startsWith('["PROXY')) {
        // handle "PROXY" message
        try {
          const message = JSON.parse(event.data) as [string, string] | [string, string, Proof[]];
          if (!Array.isArray(message) || message[0] !== "PROXY") throw new Error("Broken proxy message");

          let targetUrl = message[1];
          const paymentProofs = message[2] as undefined | Proof[];

          // customer is paying
          if (paymentProofs) {
            const collectedAmount = await this.cashRegister.collectPayment(paymentProofs);

            // Set the traffic meter
            const allowanceInKiB = collectedAmount / PRICE_PER_KIB;
            this.trafficMeter.set(allowanceInKiB);

            // resolve pubkey
            if (targetUrl.match(/[0-9a-f]{64}/)) {
              const pubkey = targetUrl;
              const addresses = await this.resolve.lookup(pubkey);

              // TODO: add fallback logic
              targetUrl = this.network.filterAddresses(addresses)[0];
              if (!targetUrl) throw new Error("Failed to find good address for pubkey");
            }

            // create upstream socket
            const upstream = new WebSocket(targetUrl, { agent: this.network.agent });
            upstream.binaryType = "arraybuffer"; // Needed to prevent having to convert Node Buffers to ArrayBuffers

            this.connectSocketToUpstream(source, upstream);
          } else {
            // tell user they have to pay
            source.send(
              JSON.stringify([
                "PROXY",
                "PAYMENT_REQUIRED",
                {
                  price: PRICE_PER_KIB,
                  mint: MINT_URL,
                  unit: MINT_UNIT,
                },
              ]),
            );
          }
        } catch (error) {
          console.error(error);
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
      const handleRelayMessage = (event: MessageEvent) => {
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
  connectSocketToUpstream(source: WebSocket, remote: WebSocket) {
    // Disconnect any existing connections before binding new one
    this.socketCleanup.get(source)?.();

    source.send(JSON.stringify(["PROXY", "CONNECTING"]));

    // Source listeners
    const handleSourceMessage = (event: MessageEvent) => {
      const meterRunning = this.trafficMeter.measureUpstream(event.data);

      if (!meterRunning) {
        this.log("Source went bankrupt, closing connection.")
        source.close(1000, "Connection bankrupted");
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
    const handleRemoteMessage = (event: MessageEvent) => {
      const meterRunning = this.trafficMeter.measureDownstream(event.data);

      if (!meterRunning) {
        this.log("Source went bankrupt, closing connection.")
        source.close(1000, "Connection bankrupted");
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

  private forwardEvent(downstream: WebSocket, event: MessageEvent) {
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
    let relay: WebSocket | undefined;
    if (UPSTREAM) {
      // connect the socket to the relay
      relay = new WebSocket(UPSTREAM, { agent: this.network.agent });
      relay.binaryType = "arraybuffer"; // Needed to prevent having to convert Node Buffers to ArrayBuffers
    }

    // connect the source to the relay
    this.connectSocketToRelay(source, relay);
  }
}
