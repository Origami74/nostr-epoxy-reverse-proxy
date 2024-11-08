import { injectable, inject } from "tsyringe";

import { unixNow } from "../helpers/date.js";
import { RelayProvider, type IRelayProvider } from "../relayProvider.js";
import { TRANSPORT_METHODS_ANNOUNCEMENT_KIND } from "../const.js";

export interface IPubkeyResolver {
  lookup(pubkey: string): Promise<Map<string, string>>;
}

@injectable()
export default class PubkeyResolver implements IPubkeyResolver {
  private relays: IRelayProvider;
  private lookups = new Map<string, number>();

  constructor(@inject(RelayProvider.name) relays: IRelayProvider) {
    this.relays = relays;
  }

  async lookup(pubkey: string): Promise<Map<string, string>> {
    const pool = this.relays.getDefaultPool();
    const cache = this.relays.cache;

    const last = this.lookups.get(pubkey);

    const filter = { authors: [pubkey], kinds: [TRANSPORT_METHODS_ANNOUNCEMENT_KIND] };

    // no cache or expired
    if (last === undefined || last > unixNow()) {
      this.lookups.set(pubkey, unixNow() + 60 * 60);

      const events = await pool.query([filter]);
      for (const event of events) {
        await cache.event(event);
      }
    }

    const events = await cache.query([filter]);

    const addresses: Map<string, string> = new Map<string, string>();
    for (const event of events) {
      event.tags.forEach((tag) => {
        if(!tag[1]){
          console.log(`invalid tag ${tag}`);
          return false;
        }
        addresses.set(tag[0], tag[1]);
      });
    }

    return addresses;
  }
}
