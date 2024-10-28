import { inject, injectable } from "tsyringe";

import logger from "../logger.js";
import { CashRegister, type ICashRegister } from "./cashRegister.js";
import { PROFIT_PAYOUT_INTERVAL_SECONDS } from "../env.js";

@injectable()
export default class Payout {
  private log = logger.extend("Payout");

  private cashRegister: ICashRegister;

  running = false;
  interval = PROFIT_PAYOUT_INTERVAL_SECONDS * 1000;

  constructor(
    @inject(CashRegister.name) cashRegister: ICashRegister,
  ) {
    this.cashRegister = cashRegister;
  }

  async payout(ignoreThreshold: boolean = false) {
    this.log("Operator payout - Starting");
    await this.cashRegister.payoutOwner(ignoreThreshold);
    this.log("Operator payout - Done");
  }

  private async update() {
    if (!this.running) return;
    await this.payout();

    setTimeout(this.update.bind(this), this.interval);
  }

  async start() {
    if (this.running) return;
    this.running = true;

    await this.update();
    this.log(`Started`);
  }

  async stop() {
    this.log("Stopping payout");
    this.running = false;
    await this.payout(true);
  }
}
