import { injectable, inject } from "tsyringe";
import { Proof } from "@cashu/cashu-ts";

import type { IWallet } from "./wallet.ts";
import { Wallet } from "./wallet.ts";
import { EventPublisher } from "../eventPublisher.ts";
import type { IEventPublisher } from "../eventPublisher.ts";
import logger from "../logger.ts";
import { Payment } from "../types/payment.ts";
import { getAmount } from "../helpers/money.ts";

export interface ICashRegister {
  collectPayment(payment: Payment): Promise<number>;
}

@injectable()
export class CashRegister implements ICashRegister {
  private log = logger.extend(`CashRegister`);
  private profitsPubkey: string = getRequiredEnv("PROFITS_PUBKEY"); // TODO: set default
  private profitsPayoutThreshold: number = Number(getRequiredEnv("PROFIT_PAYOUT_THRESHOLD")) ?? 0;
  private profitPubkeyLockEnabled: boolean = getRequiredEnv("PROFITS_PUBKEY_LOCK") === "true";

  private wallet: IWallet;
  private eventPublisher: IEventPublisher;

  constructor(@inject(Wallet.name) wallet: IWallet, @inject(EventPublisher.name) eventPublisher: IEventPublisher) {
    this.wallet = wallet;
    this.eventPublisher = eventPublisher;
  }

  public async collectPayment(payment: Payment): Promise<number> {
    try {
      const amountInWallet = await this.wallet.add(payment.proofs, payment.mint);
      

      // TODO: extract payout to background job
      if (amountInWallet >= this.profitsPayoutThreshold) {
        await this.payoutOwner();
      }

      return getAmount(payment.proofs);
    } catch (e) {
      console.error("Payment failed: Error redeeming cashu tokens", e);
      throw new Error("Payment failed");
    }
  }

  private async payoutOwner() {
    const cashuToken = await this.wallet.takeAllAsCashuToken();


    try {
      this.eventPublisher.publishDM(
        this.profitsPubkey,
        `Here's your profits from your relay proxying service. At ${new Date().toUTCString()}.\n ${cashuToken}`,
      );
    } catch (e) {
      console.error("Failed to forward payment in dm", e);
    }

    // We can safely remove deez nuts after sending it to the profits pubkey
    this.wallet.remove(nuts);
  }
}
