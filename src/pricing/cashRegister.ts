import { injectable, inject } from "tsyringe";
import { Proof } from "@cashu/cashu-ts";

import type { IWallet } from "./wallet.js";
import { Wallet } from "./wallet.js";
import { EventPublisher } from "../eventPublisher.js";
import type { IEventPublisher } from "../eventPublisher.js";
import logger from "../logger.js";
import { getAmount, toCashuToken } from "../helpers/money.js";
import { PROFIT_PAYOUT_THRESHOLD, PROFITS_PUBKEY } from "../env.js";

export interface ICashRegister {
  collectPayment(proofs: Proof[]): Promise<number>;
  payoutOwner(ignoreThreshold: boolean): Promise<void>;
}

@injectable()
export class CashRegister implements ICashRegister {
  private log = logger.extend(`CashRegister`);
  private profitsPubkey: string = PROFITS_PUBKEY;
  private profitsPayoutThreshold: number = PROFIT_PAYOUT_THRESHOLD;

  private wallet: IWallet;
  private eventPublisher: IEventPublisher;

  constructor(@inject(Wallet.name) wallet: IWallet, @inject(EventPublisher.name) eventPublisher: IEventPublisher) {
    this.wallet = wallet;
    this.eventPublisher = eventPublisher;
  }

  public async collectPayment(proofs: Proof[]): Promise<number> {
    try {
      await this.wallet.add(proofs);
      return getAmount(proofs);
    } catch (e) {
      console.error("Payment failed: Error redeeming cashu tokens", e);
      throw new Error("Payment failed");
    }
  }

  public async payoutOwner(ignoreThreshold: boolean = false) {
    const balance = this.wallet.getBalance()
    if(!ignoreThreshold && balance < this.profitsPayoutThreshold){
      this.log(`Balance of ${balance} not enough for payout threshold of ${this.profitsPayoutThreshold}, skipping payout...`)
      return;
    }

    const nuts = await this.wallet.withdrawAll();

    try {
      const cashuToken = toCashuToken(nuts, this.wallet.mintUrl);
      await this.eventPublisher.publishDM(
        this.profitsPubkey,
        `Here's your profits from your relay proxying service. At ${new Date().toUTCString()}.\n ${cashuToken}`,
      );
    } catch (e) {
      console.error("Failed to forward payment in dm", e);

      // NOTE: this will not work if the nuts are locked to the profitsPubkey
      await this.wallet.add(nuts);
    }
  }
}
