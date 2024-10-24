import { NRelay1, NPool, NStore, NCache, NostrFilter, NostrEvent } from "@nostrify/nostrify";
import { injectable } from "tsyringe";

import logger from "./logger.ts";
import { NOSTR_RELAYS } from "./env.ts";

export interface IRelayProvider {
  getDefaultPool(): NStore;
  getEvent(filter: NostrFilter, store?: NStore): Promise<NostrEvent | undefined>;
  cache: NStore;
}

@injectable()
export class RelayProvider implements IRelayProvider {
  private log = logger.extend(RelayProvider.name);
  private pool: NStore;

  cache: NStore;

  constructor() {
    const relays = NOSTR_RELAYS; //["wss://nos.lol", "wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.stens.dev"];

    this.pool = new NPool({
      open(url) {
        return new NRelay1(relays[0]);
      },
      reqRouter: async (filters) => {
        return new Map(
          relays.map((relay) => {
            return [relay, filters];
          }),
        );
      },
      eventRouter: async (event) => {
        return relays;
      },
    });

    this.cache = new NCache({ max: 1000 });
  }

  /** Returns a single event from the cache or the relay pool */
  async getEvent(filter: NostrFilter): Promise<NostrEvent | undefined> {
    const cached = await this.cache.query([filter]);
    if (cached[0]) return cached[0];

    const events = await this.pool.query([filter]);
    return events[0];
  }

  getDefaultPool(): NStore {
    return this.pool;
  }
}
