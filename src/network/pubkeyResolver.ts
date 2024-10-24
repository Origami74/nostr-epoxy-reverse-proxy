import { injectable, inject } from "tsyringe";

import { unixNow } from "../helpers/date.js";
import { RelayProvider, type IRelayProvider } from "../relayProvider.js";

export interface IPubkeyResolver {
  lookup(pubkey: string): Promise<string[]>;
}

@injectable()
export default class PubkeyResolver implements IPubkeyResolver {
  private relays: IRelayProvider;
  private lookups = new Map<string, number>();

  constructor(@inject(RelayProvider.name) relays: IRelayProvider) {
    this.relays = relays;
  }

  async lookup(pubkey: string) {
    const pool = this.relays.getDefaultPool();
    const cache = this.relays.cache;

    const last = this.lookups.get(pubkey);

    const filter = { authors: [pubkey], "#p": [pubkey], kinds: [30166] };

    // no cache or expired
    if (last === undefined || last > unixNow()) {
      this.lookups.set(pubkey, unixNow() + 60 * 60);

      const events = await pool.query([filter]);
      for (const event of events) {
        await cache.event(event);
      }
    }

    const events = await cache.query([filter]);

    const addresses: string[] = [];
    for (const event of events) {
      const url = event.tags.find((t) => t[0] === "d")?.[1];
      if (url) addresses.push(url);
    }
    return addresses;
  }
}
