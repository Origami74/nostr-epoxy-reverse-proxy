import { Proof, getEncodedToken } from "@cashu/cashu-ts";

export function getAmount(proofs: Proof[]): number {
  return proofs.reduce((total, proof) => total + proof.amount, 0);
}

export function toCashuToken(proofs: Proof[], mintUrl: string): string {
  return getEncodedToken({ token: [{ proofs: proofs, mint: mintUrl }] });
}
