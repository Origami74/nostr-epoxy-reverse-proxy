import { injectable } from "tsyringe";
import { CashuMint, CashuWallet, Proof, getEncodedToken } from "@cashu/cashu-ts";

import { MINT_URL, PRIVATE_KEY } from "../env.ts";

export interface IWallet {
  add(proofs: Proof[], mintUrl: string): Promise<number>;
  takeAll(pubkey?: string): Promise<Proof[]>;
  remove(proofs: Proof[]): number;
  toCashuToken(proofs: Proof[]): string;
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

    const receivedAmount = proofs.reduce((total, proof) => total + proof.amount, 0);
    const nutSackAmount = this.nutSack.reduce((total, proof) => total + proof.amount, 0);
    console.log(`Received ${receivedAmount} sats, wallet now contains ${nutSackAmount} sats`);

    return nutSackAmount;
  }

  /**
   * Removes proofs from wallet
   * Returns total amount in wallet
   */
  public remove(proofsToRemove: Proof[]): number {
    this.nutSack = this.nutSack.filter((proof) => !proofsToRemove.includes(proof));

    const removedAmount = proofsToRemove.reduce((total, proof) => total + proof.amount, 0);
    const nutSackAmount = this.nutSack.reduce((total, proof) => total + proof.amount, 0);
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

  public toCashuToken(proofs: Proof[]): string {
    return getEncodedToken({ token: [{ proofs: proofs, mint: this.mintUrl }] });
  }
}
