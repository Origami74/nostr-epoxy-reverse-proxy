import { injectable } from "tsyringe";
import { Buffer } from "node:buffer";

export interface ITrafficMeter {
  measureUpstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean;
  measureDownstream(
    data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer | Buffer[],
  ): boolean;

  set(value: number): void;
  getTotal(): number;
  meterIsRunning(): boolean;
}

@injectable()
export class TrafficMeter {
  private totalUpstreamKiB: number = 0; // customer to server
  private totalDownstreamKiB: number = 0; // server to customer

  private countdownMeterKiB = 0;

  public measureUpstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean {
    if (!this.meterIsRunning()) {
      return false;
    }

    const sizeKiB = Buffer.byteLength(data) / 1024;
    this.totalUpstreamKiB += sizeKiB;
    console.log(`Upstream measurement: ${sizeKiB}`);
    console.log(
      `Total Data up/down in bytes: ${this.totalUpstreamKiB}/${this.totalDownstreamKiB} = ${this.getTotal()}`,
    );

    this.countdownMeterKiB -= sizeKiB;
    return this.meterIsRunning();
  }

  public measureDownstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean {
    if (!this.meterIsRunning()) {
      return false;
    }

    const sizeKiB = Buffer.byteLength(data) / 1024;
    this.totalDownstreamKiB += sizeKiB;
    console.log(`Downstream measurement: ${sizeKiB}`);
    console.log(
      `Total Data up/down in bytes: ${this.totalUpstreamKiB}/${this.totalDownstreamKiB} = ${this.getTotal()}`,
    );

    this.countdownMeterKiB -= sizeKiB;
    return this.meterIsRunning();
  }

  public set = (value: number) => (this.countdownMeterKiB = value);

  public getTotal = () => this.totalUpstreamKiB + this.totalDownstreamKiB;

  public meterIsRunning = () => this.countdownMeterKiB > 0;
}
