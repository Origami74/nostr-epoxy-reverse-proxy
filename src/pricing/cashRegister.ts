import { injectable, inject } from "tsyringe";
import { Proof } from "@cashu/cashu-ts";
import type { IWallet } from "./wallet.ts";
import { Wallet } from "./wallet.ts";
import { EventPublisher } from "../eventPublisher.ts";
import type { IEventPublisher } from "../eventPublisher.ts";
import logger from "../logger.ts";
import { Payment } from "../types/payment.ts";

export interface ICashRegister {
  collectPayment(payment: Payment): Promise<boolean>;
}

@injectable()
export class CashRegister implements ICashRegister {
  private log = logger.extend(`CashRegister`);
  private profitsPubkey: string = Deno.env.get("PROFITS_PUBKEY"); // TODO: set default
  private profitsPayoutThreshold: number = Number(Deno.env.get("PROFIT_PAYOUT_THRESHOLD")) ?? 0;
  private profitPubkeyLockEnabled: boolean = Deno.env.get("PROFITS_PUBKEY_LOCK") === "true";

  private wallet: IWallet;
  private eventPublisher: IEventPublisher;

  constructor(@inject(Wallet.name) wallet: IWallet, @inject(EventPublisher.name) eventPublisher: IEventPublisher) {
    this.wallet = wallet;
    this.eventPublisher = eventPublisher;
  }

  public async collectPayment(payment: Payment): Promise<boolean> {
    if (!payment) {
      return false;
    }

    try {
      await this.wallet.add(payment);

      return true;
    } catch (e) {
      console.error("Payment failed: Error redeeming cashu tokens", e);
      return false;
    }
  }

  private async handlePayment(proofs: Proof[]) {
    const nutSackAmount = await this.wallet.add(proofs);

    if (nutSackAmount >= this.profitsPayoutThreshold) {
      await this.payoutOwner();
    }
  }

  private async payoutOwner() {
    const nuts: Proof[] = await this.wallet.takeAll();

    const cashuToken = this.wallet.toCashuToken(nuts);

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
