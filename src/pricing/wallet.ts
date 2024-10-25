import { injectable } from "tsyringe";
import { CashuMint, CashuWallet, Proof } from "@cashu/cashu-ts";
import { bytesToHex } from "@noble/hashes/utils";

import { getAmount, toCashuToken } from "../helpers/money.js";
import { MINT_URL, PRIVATE_KEY } from "../env.js";

export interface IWallet {
  add(proofs: Proof[]): Promise<number>;
  withdrawAll(pubkey?: string): Promise<Proof[]>;
  remove(proofs: Proof[]): number;

  mintUrl: string;
}

@injectable()
export class Wallet implements IWallet {
  private nutSack: Proof[] = [];

  private relayPrivateKey: string = bytesToHex(PRIVATE_KEY);
  public mintUrl: string = MINT_URL;
  private mint = new CashuMint(this.mintUrl);
  private cashuWallet = new CashuWallet(this.mint);

  /**
   * Redeems tokens and adds them to wallet.
   * Returns total amount in wallet
   */
  public async add(proofs: Proof[]): Promise<number> {
    const received = await this.cashuWallet.receiveTokenEntry(
      { proofs, mint: this.mintUrl },
      { privkey: this.relayPrivateKey },
    );

    this.nutSack = [...this.nutSack, ...received];

    const receivedAmount = getAmount(proofs);
    const nutSackAmount = getAmount(this.nutSack);
    console.log(`Received ${receivedAmount} sats, wallet now contains ${nutSackAmount} sats`);

    return nutSackAmount;
  }

  /**
   * Removes proofs from wallet
   * Returns total amount in wallet
   */
  public remove(proofsToRemove: Proof[]): number {
    this.nutSack = this.nutSack.filter((proof) => !proofsToRemove.includes(proof));

    const removedAmount = getAmount(proofsToRemove);
    const nutSackAmount = getAmount(this.nutSack);
    console.log(`Removed ${removedAmount} sats, wallet now contains ${nutSackAmount} sats`);

    return nutSackAmount;
  }

  /**
   * If a pubkey is passed, the tokens will be locked to that pubkey.
   */
  public async withdrawAll(pubkey: string | undefined): Promise<Proof[]> {
    const nuts = this.nutSack;
    this.remove(nuts);

    // if (pubkey) {
    //   return await this.cashuWallet.receiveTokenEntry(
    //     { proofs: nuts, mint: this.mintUrl },
    //     { privkey: this.relayPrivateKey, pubkey: `02${pubkey}` },
    //   );
    // } else {
    return await this.cashuWallet.receiveTokenEntry(
      { proofs: nuts, mint: this.mintUrl },
      { privkey: this.relayPrivateKey },
    );
    // }
  }
}
