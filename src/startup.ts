import { container } from "tsyringe";

import { Wallet } from "./pricing/wallet.ts";
import { CashRegister } from "./pricing/cashRegister.ts";
import { RelayProvider } from "./relayProvider.ts";
import Switchboard, { type ISwitchboard } from "./network/switchboard.ts";
import OutboundNetwork from "./network/outbound.ts";
import PubkeyResolver from "./network/pubkeyResolver.ts";
import { EventPublisher } from "./eventPublisher.ts";
import { TrafficMeter } from "./network/monitoring/trafficMeter.ts";

export function startup() {
  console.info("Running startup");

  container.registerSingleton(EventPublisher.name, EventPublisher);
  container.registerSingleton(RelayProvider.name, RelayProvider);
  container.registerSingleton(Wallet.name, Wallet);
  container.registerSingleton(CashRegister.name, CashRegister);
  container.registerSingleton(Switchboard.name, Switchboard);
  container.registerSingleton(OutboundNetwork.name, OutboundNetwork);
  container.register(PubkeyResolver.name, PubkeyResolver);

  container.register(TrafficMeter.name, {useClass: TrafficMeter});

  console.info("All services registered");
  container.resolve<ISwitchboard>(Switchboard.name);
  console.info("Startup completed");
}
