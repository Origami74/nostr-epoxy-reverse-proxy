import { inject, injectable } from "tsyringe";

import logger from "../logger.js";
import OutboundNetwork from "./outbound.js";
import { EventPublisher } from "../eventPublisher.js";
import type { IEventPublisher } from "../eventPublisher.js";
import {
  PRICE_UNIT,
  SERVICE_ABOUT,
  SERVICE_PICTURE,
  SERVICE_NAME,
  MINT_URL,
  PRICE_PER_MIN,
  INBOUND_TOR,
  INBOUND_I2P,
  INBOUND_CLEARNET,
  INBOUND_HYPER,
} from "../env.js";
import { PROXY_ADVERTIZEMENT_KIND, TRANSPORT_METHODS_ANNOUNCEMENT_KIND, SELF_MONITOR_KIND } from "../const.js";
import { RelayProvider, type IRelayProvider } from "../relayProvider.js";

function livenessTags(self: string, address: string, network: string) {
  return [
    ["d", address],
    ["n", network],
    ["p", self],
    ["T", "Proxy"],
  ];
}

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
    const pubkey = await this.publisher.getPubkey();

    if (INBOUND_TOR) {
      this.log("Published tor gossip");
      await this.publisher.publish(SELF_MONITOR_KIND, livenessTags(pubkey, INBOUND_TOR, "tor"), "");
    }
    if (INBOUND_I2P) {
      await this.publisher.publish(SELF_MONITOR_KIND, livenessTags(pubkey, INBOUND_I2P, "i2p"), "");
      this.log("Published i2p gossip");
    }
    if (INBOUND_CLEARNET) {
      await this.publisher.publish(SELF_MONITOR_KIND, livenessTags(pubkey, INBOUND_CLEARNET, "clearnet"), "");
      this.log("Published clearnet gossip");
    }

    const tags: string[][] = [];
    await this.publisher.publish(SELF_MONITOR_KIND, tags, "");
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
        this.log("Failed to parse profile event", error, current);
      }
    }

    Object.assign(profile, this.getProfileJson());

    const content = JSON.stringify(profile);
    await this.publisher.publish(0, [], content);

    this.log("Published profile");
  }

  async advertise() {
    const content = JSON.stringify(this.getProfileJson());
    const tags: string[][] = [];

    tags.push(["price", String(PRICE_PER_MIN), PRICE_UNIT]);
    tags.push(["mint", MINT_URL, PRICE_UNIT]);

    // advertize outbound networks
    if (this.network.clearnet) tags.push(["n", "clearnet"]);
    if (this.network.tor) tags.push(["n", "tor"]);
    if (this.network.i2p) tags.push(["n", "i2p"]);

    // advertize inbound urls
    if (INBOUND_CLEARNET) tags.push(["url", INBOUND_CLEARNET, "clearnet"]);
    if (INBOUND_TOR) tags.push(["url", INBOUND_TOR, "tor"]);
    if (INBOUND_I2P) tags.push(["url", INBOUND_I2P, "i2p"]);

    await this.publisher.publish(PROXY_ADVERTIZEMENT_KIND, tags, content);

    this.log("Published advertizement");
  }

  async advertiseNip37() {
    const tags: string[][] = [];

    // advertise nip37
    this.log("Advertise nip37");


    // advertize inbound urls
    if (INBOUND_CLEARNET) tags.push(["clearnet", INBOUND_CLEARNET]);
    if (INBOUND_TOR) tags.push(["tor", INBOUND_TOR]);
    if (INBOUND_I2P) tags.push(["i2p", INBOUND_I2P]);
    if (INBOUND_HYPER) tags.push(["hyper", INBOUND_HYPER]);

    await this.publisher.publish(TRANSPORT_METHODS_ANNOUNCEMENT_KIND, tags);

    this.log("Published nip37");
  }

  private async update() {
    if (!this.running) return;
    await this.gossip();
    await this.advertise();
    await this.advertiseNip37();

    setTimeout(this.update.bind(this), this.interval);
  }

  async start() {
    if (this.running) return;
    this.running = true;

    await this.updateProfile();
    await this.update();
    this.log(`Started`);
  }

  stop() {
    this.log("Stopping gossip");
    this.running = false;
  }
}
