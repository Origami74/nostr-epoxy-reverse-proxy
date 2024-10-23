import { NPool, NRelay, NStore } from "@nostrify/nostrify";
import { injectable, inject } from "tsyringe";
import { unixNow } from "../helpers/date.ts";

export interface IResolve {
  lookup(pubkey: string): Promise<string[]>;
}

@injectable()
export default class Resolve implements IResolve {
  private lookups = new Map<string, number>();
  private pool: Nool<NRelay>;
  private store: NStore;

  constructor(@inject("NPool") pool: NPool<NRelay>, @inject("NStore") store: NStore) {
    this.pool = pool;
    this.store = store;
  }

  async lookup(pubkey: string) {
    const last = this.lookups.get(pubkey);

    const filter = { authors: [pubkey], "#p": [pubkey], kinds: [30166] };

    // no cache or expired
    if (last === undefined || last > unixNow()) {
      this.lookups.set(pubkey, unixNow() + 60 * 60);

      const events = await this.pool.query([filter]);
      for (const event of events) {
        await this.store.event(event);
      }
    }

    const events = await this.store.query([filter]);

    const addresses: string[] = [];
    for (const event of events) {
      const url = event.tags.find((t) => t[0] === "d")?.[1];
      if (url) addresses.push(url);
    }
    return addresses;
  }
}
