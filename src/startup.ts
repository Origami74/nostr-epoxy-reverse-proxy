import { container } from "tsyringe";
import { Wallet } from "./pricing/wallet.ts";
import { CashRegister } from "./pricing/cashRegister.ts";
import { RelayProvider } from "./relayProvider.ts";

export function startup() {
  console.info("Running startup");

  container.registerSingleton(RelayProvider.name, RelayProvider);

  container.registerSingleton(Wallet.name, Wallet);
  container.registerSingleton(CashRegister.name, CashRegister);

  console.info("All services registered");
  console.info("Startup completed");
}
