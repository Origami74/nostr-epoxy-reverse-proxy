import { container, inject, injectable } from "tsyringe";
import logger from "./logger.ts";
import { unixNow } from "./helpers/date.ts";
import { RelayProvider } from "./relayProvider.ts";
import type { IRelayProvider } from "./relayProvider.ts";
import { NRelay, NSecSigner } from "@nostrify/nostrify";

export interface IEventPublisher {
  publish(kind: number, tags: string[][], content: string): Promise<void>;
  publishDM(destPubKey: string, content: string): Promise<void>;
}

@injectable()
export class EventPublisher implements IEventPublisher {
  private relay: NRelay;
  private logger = logger.extend(EventPublisher.name);

  private privateKey: string;
  private signer: NSecSigner;
  private signerPubkey: string;

  constructor(@inject(RelayProvider.name) relayProvider: IRelayProvider) {
    this.logger = logger;
    this.relay = relayProvider.getDefaultPool();

    this.privateKey = getRequiredEnv("PRIVATE_KEY");
    this.signer = new NSecSigner(this.privateKey);
    this.signerPubkey = this.signer.getPublicKey();
  }

  public async publish(kind: number, tags: string[][], content: string): Promise<void> {
    var note = {
      kind: kind,
      pubkey: this.signerPubkey,
      content: content,
      created_at: unixNow(),
      tags: tags,
    };
    const envt = await this.signer.signEvent(note);

    await this.relay.event(envt);
  }

  public async publishDM(destPubKey: string, content: string): Promise<void> {
    const encryptedDmContent = await this.signer.nip04.encrypt(
      destPubKey, content
    );

    const privateMessage = {
      created_at: Math.floor(Date.now() / 1000),
      kind: 4,
      tags: [["p", destPubKey]],
      content: encryptedDmContent,
    };

    await this.publish(
      4,
      [["p", destPubKey]],
      encryptedDmContent
    );
  }
}
