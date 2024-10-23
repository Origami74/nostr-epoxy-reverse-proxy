import { NPool, NRelay, NSecSigner, NStore } from "@nostrify/nostrify";
import {} from "";

import { unixNow } from "../helpers/date.ts";
import logger from "../logger.ts";

function buildGossipTemplate(self: string, address: string, network: string) {
  return {
    kind: 30166,
    content: "",
    tags: [
      ["d", address],
      ["n", network],
      ["p", self],
      ["T", "Proxy"],
    ],
    created_at: unixNow(),
  };
}

export default class Gossip {
  log = logger.extend("Gossip");
  signer: NSecSigner;
  pool: NPool<NRelay>;
  store: NStore;

  running = false;
  // default every 10 minute
  interval = 10 * 60_000;
  broadcastRelays: string[] = [];

  constructor(signer: NSecSigner, pool: NPool<NRelay>, store: NStore) {
    this.signer = signer;
    this.pool = pool;
    this.store = store;
  }

  async gossip() {
    const pubkey = await this.signer.getPublicKey();

    if (this.broadcastRelays.length === 0) return;

    if (this.network.hyper.available && this.network.hyper.address) {
      console.log("Publishing hyper gossip");
      await this.pool.publish(
        this.broadcastRelays,
        await this.signer.signEvent(buildGossipTemplate(pubkey, this.network.hyper.address, "hyper")),
      );
    }

    if (this.network.tor.available && this.network.tor.address) {
      console.log("Publishing tor gossip");
      await this.pool.publish(
        this.broadcastRelays,
        await this.signer.signEvent(buildGossipTemplate(pubkey, this.network.tor.address, "tor")),
      );
    }

    if (this.network.i2p.available && this.network.i2p.address) {
      console.log("Publishing i2p gossip");
      await this.pool.publish(
        this.broadcastRelays,
        await this.signer.signEvent(buildGossipTemplate(pubkey, this.network.i2p.address, "i2p")),
      );
    }
  }

  private async update() {
    if (!this.running) return;
    await this.gossip();

    setTimeout(this.update.bind(this), this.interval);
  }

  start() {
    if (this.running) return;
    this.running = true;

    console.log(`Starting gossip on ${this.broadcastRelays.join(", ")}`);
    setTimeout(this.update.bind(this), 5000);
  }

  stop() {
    console.log("Stopping gossip");
    this.running = false;
  }
}
