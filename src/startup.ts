import { container } from "tsyringe";

import { Wallet } from "./pricing/wallet.js";
import { CashRegister } from "./pricing/cashRegister.js";
import { RelayProvider } from "./relayProvider.js";
import Switchboard, { type ISwitchboard } from "./network/switchboard.js";
import OutboundNetwork from "./network/outbound.js";
import PubkeyResolver from "./network/pubkeyResolver.js";
import { EventPublisher } from "./eventPublisher.js";
import { TrafficMeter } from "./network/monitoring/trafficMeter.js";

export function startup() {
  console.info("Running startup");

  container.registerSingleton(EventPublisher.name, EventPublisher);
  container.registerSingleton(RelayProvider.name, RelayProvider);
  container.registerSingleton(Wallet.name, Wallet);
  container.registerSingleton(CashRegister.name, CashRegister);

  container.registerSingleton(OutboundNetwork.name, OutboundNetwork);

  container.register(Switchboard.name, { useClass: Switchboard });
  container.register(PubkeyResolver.name, { useClass: PubkeyResolver });
  container.register(TrafficMeter.name, { useClass: TrafficMeter });

  console.info("All services registered");
  container.resolve<ISwitchboard>(Switchboard.name);
  console.info("Startup completed");
}
