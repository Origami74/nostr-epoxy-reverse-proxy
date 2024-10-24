import { inject, injectable } from "tsyringe";
import { NStore, NSecSigner } from "@nostrify/nostrify";

import logger from "./logger.ts";
import { unixNow } from "./helpers/date.ts";
import { RelayProvider } from "./relayProvider.ts";
import type { IRelayProvider } from "./relayProvider.ts";
import { PRIVATE_KEY } from "./env.ts";

export interface IEventPublisher {
  publish(kind: number, tags: string[][], content: string): Promise<void>;
  publishDM(destPubKey: string, content: string): Promise<void>;
  getPubkey(): Promise<string>;
}

@injectable()
export class EventPublisher implements IEventPublisher {
  private pool: NStore;
  private cache: NStore;
  private log = logger.extend(EventPublisher.name);

  private signer: NSecSigner;
  pubkey?: string;

  constructor(@inject(RelayProvider.name) relayProvider: IRelayProvider) {
    this.pool = relayProvider.getDefaultPool();
    this.cache = relayProvider.cache;

    this.signer = new NSecSigner(PRIVATE_KEY);
  }

  async getPubkey() {
    if (this.pubkey) return this.pubkey;
    return (this.pubkey = await this.signer.getPublicKey());
  }

  public async publish(kind: number, tags: string[][], content: string): Promise<void> {
    const note = {
      kind: kind,
      pubkey: await this.getPubkey(),
      content: content,
      created_at: unixNow(),
      tags: tags,
    };
    const event = await this.signer.signEvent(note);

    await this.cache.event(event);
    await this.pool.event(event);
  }

  public async publishDM(destPubKey: string, content: string): Promise<void> {
    const encryptedDmContent = await this.signer.nip04.encrypt(destPubKey, content);

    const privateMessage = {
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [["p", destPubKey]],
      content: encryptedDmContent,
    };

    await this.publish(4, [["p", destPubKey]], encryptedDmContent);
  }
}
