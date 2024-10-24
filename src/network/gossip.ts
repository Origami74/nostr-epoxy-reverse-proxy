import { inject, injectable } from "tsyringe";

import logger from "../logger.ts";
import OutboundNetwork from "./outbound.ts";
import { EventPublisher } from "../eventPublisher.ts";
import type { IEventPublisher } from "../eventPublisher.ts";
import {
  MINT_UNIT,
  SERVICE_ABOUT,
  SERVICE_PICTURE,
  SERVICE_NAME,
  CLEARNET_URL,
  TOR_URL,
  I2P_URL,
  MINT_URL,
  PRICE_PER_KIB,
} from "../env.ts";
import { PROXY_ADVERTIZEMENT_KIND } from "../const.ts";
import { RelayProvider, type IRelayProvider } from "../relayProvider.ts";

// function buildGossipTemplate(self: string, address: string, network: string) {
//   return {
//     kind: 30166,
//     content: "",
//     tags: [
//       ["d", address],
//       ["n", network],
//       ["p", self],
//       ["T", "Proxy"],
//     ],
//     created_at: unixNow(),
//   };
// }

@injectable()
export default class Gossip {
  private log = logger.extend("Gossip");

  private network: OutboundNetwork;
  private publisher: IEventPublisher;
  private relays: IRelayProvider;

  running = false;
  // default every 10 minutes
  interval = 10 * 60_000;

  constructor(
    @inject(OutboundNetwork.name) network: OutboundNetwork,
    @inject(EventPublisher.name) publisher: IEventPublisher,
    @inject(RelayProvider.name) relays: IRelayProvider,
  ) {
    this.network = network;
    this.publisher = publisher;
    this.relays = relays;
  }

  async gossip() {
    // if (this.network.tor.available && this.network.tor.address) {
    //   console.log("Publishing tor gossip");
    //   await this.pool.publish(
    //     this.broadcastRelays,
    //     await this.signer.signEvent(buildGossipTemplate(pubkey, this.network.tor.address, "tor")),
    //   );
    // }
    // if (this.network.i2p.available && this.network.i2p.address) {
    //   console.log("Publishing i2p gossip");
    //   await this.pool.publish(
    //     this.broadcastRelays,
    //     await this.signer.signEvent(buildGossipTemplate(pubkey, this.network.i2p.address, "i2p")),
    //   );
    // }
    // const tags: string[][] = []
    // await this.publisher.publish(SELF_MONITOR_KIND, tags,'');
  }

  private getProfileJson() {
    return {
      name: SERVICE_NAME,
      about: SERVICE_ABOUT,
      picture: SERVICE_PICTURE,
    };
  }

  async updateProfile() {
    const pubkey = await this.publisher.getPubkey();
    const current = await this.relays.getEvent({ kinds: [0], authors: [pubkey] });

    const profile: Record<string, string> = {};

    if (current) {
      try {
        const metadata = JSON.parse((await current).content);
        Object.assign(profile, metadata);
      } catch (error) {
        console.log("Failed to parse profile event", error, current);
      }
    }

    Object.assign(profile, this.getProfileJson());

    const content = JSON.stringify(profile);
    await this.publisher.publish(0, [], content);
  }

  async advertize() {
    const content = JSON.stringify(this.getProfileJson());
    const tags: string[][] = [];

    tags.push(["price", String(PRICE_PER_KIB), MINT_UNIT]);
    tags.push(["mint", MINT_URL, MINT_UNIT]);

    // advertize outbound networks
    if (this.network.clearnet) tags.push(["n", "clearnet"]);
    if (this.network.tor) tags.push(["n", "tor"]);
    if (this.network.i2p) tags.push(["n", "i2p"]);

    // advertize inbound urls
    if (CLEARNET_URL) tags.push(["url", CLEARNET_URL, "clearnet"]);
    if (TOR_URL) tags.push(["url", TOR_URL, "tor"]);
    if (I2P_URL) tags.push(["url", I2P_URL, "i2p"]);

    await this.publisher.publish(PROXY_ADVERTIZEMENT_KIND, tags, content);
  }

  private async update() {
    if (!this.running) return;
    await this.gossip();
    await this.advertize();

    setTimeout(this.update.bind(this), this.interval);
  }

  async start() {
    if (this.running) return;
    this.running = true;

    await this.updateProfile();

    console.log(`Starting gossip`);
    setTimeout(this.update.bind(this), 5000);
  }

  stop() {
    console.log("Stopping gossip");
    this.running = false;
  }
}
