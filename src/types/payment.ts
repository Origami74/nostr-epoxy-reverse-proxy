import { Proof } from "@cashu/cashu-ts";

export type Payment = {
  proofs: Proof[];
  mint: string;
};
