import { injectable } from "tsyringe";
import { CashuMint, CashuWallet, Proof, getEncodedToken } from "@cashu/cashu-ts";

import { MINT_URL, PRIVATE_KEY } from "../env.ts";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import { getRequiredEnv } from "../helpers/env.ts";
import { toCashuToken } from "../helpers/money.ts";

export interface IWallet {
  add(proofs: Proof[], mintUrl: string): Promise<number>;
  takeAll(pubkey?: string): Promise<Proof[]>;
  takeAlAsCashuToken(pubkey?: string): Promise<string>;
  remove(proofs: Proof[]): number;
}

@injectable()
export class Wallet implements IWallet {
  private nutSack: Proof[] = [];

  private relayPrivateKey = PRIVATE_KEY;
  private mintUrl = MINT_URL;
  private mint = new CashuMint(this.mintUrl);
  private cashuWallet = new CashuWallet(this.mint);

  /**
   * Redeems tokens and adds them to wallet.
   * Returns total amount in wallet
   */
  public async add(proofs: Proof[], mintUrl: string): Promise<number> {
    const redeemedProofs = await this.cashuWallet.receiveTokenEntry(
      { proofs: proofs, mint: mintUrl },
      { privkey: this.relayPrivateKey },
    );

    this.nutSack = this.nutSack.concat(redeemedProofs);

    const receivedAmount = this.getAmount(proofs);
    const nutSackAmount = this.getAmount(this.nutSack);
    console.log(`Received ${receivedAmount} sats, wallet now contains ${nutSackAmount} sats`);

    return nutSackAmount;
  }

  /**
   * Removes proofs from wallet
   * Returns total amount in wallet
   */
  public remove(proofsToRemove: Proof[]): number {
    this.nutSack = this.nutSack.filter((proof) => !proofsToRemove.includes(proof));

    const removedAmount = this.getAmount(proofsToRemove);
    const nutSackAmount = this.getAmount(this.nutSack);
    console.log(`Removed ${removedAmount} sats, wallet now contains ${nutSackAmount} sats`);

    return nutSackAmount;
  }

  /**
   * If a pubkey is passed, the tokens will be locked to that pubkey.
   */
  public async takeAll(pubkey: string | undefined): Promise<Proof[]> {
    if (pubkey) {
      return await this.cashuWallet.receiveTokenEntry(
        { proofs: this.nutSack, mint: this.mintUrl },
        { privkey: this.relayPrivateKey, pubkey: `02${pubkey}` },
      );
    } else {
      return await this.cashuWallet.receiveTokenEntry(
        { proofs: this.nutSack, mint: this.mintUrl },
        { privkey: this.relayPrivateKey },
      );
    }
  }

  /**
   * If a pubkey is passed, the tokens will be locked to that pubkey.
   */
  public async takeAllAsCashuToken(pubkey: string | undefined): Promise<string> {
    const nuts = await this.takeAll(pubkey);

    return toCashuToken(nuts, this.mintUrl);
  }
}
