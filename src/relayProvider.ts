import { inject, injectable } from "tsyringe";
import logger from "./logger.ts";
import { NRelay1, NPool } from "@nostrify/nostrify";

export interface IRelayProvider {
  getDefaultPool(): NPool<NRelay1>;
}

@injectable()
export class RelayProvider implements IRelayProvider {
  private logger = logger.extend(RelayProvider.name);
  private pool: NPool<NRelay1>;

  constructor() {
    this.logger = logger;

    const relays = ["wss://nos.lol", "wss://relay.damus.io", "wss://relay.primal.net", "wss://relay.stens.dev"];

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
  }

  getDefaultPool(): NPool<NRelay1> {
    return this.pool;
  }
}
