import { injectable } from "tsyringe";
import {Buffer} from 'node:buffer'

export interface ITrafficMeter {
    measureUpstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean;
    measureDownstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean;
}

@injectable()
export class TrafficMeter {
    private dataUpstream: number = 0; // customer to server
    private dataDownstream: number = 0; // server to customer

    private countdownMeter = 0;

    public measureUpstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean{
        const size = Buffer.byteLength(data);
        this.dataUpstream += size
        console.log(`Upstream measurement: ${size}`);
        console.log(`Total Data up/down in bytes: ${this.dataUpstream}/${this.dataDownstream} = ${this.getTotal()}`);

        this.countdownMeter -= size;
        return this.meterIsRunning();
    }

    public measureDownstream(data: string | Buffer | NodeJS.ArrayBufferView | ArrayBuffer | SharedArrayBuffer): boolean{
        const size = Buffer.byteLength(data);
        this.dataDownstream += size
        console.log(`Downstream measurement: ${size}`);
        console.log(`Total Data up/down in bytes: ${this.dataUpstream}/${this.dataDownstream} = ${this.getTotal()}`);

        this.countdownMeter -= size;
        return this.meterIsRunning();
    }

    public set = (value: number) => this.countdownMeter = value;

    public getTotal = () => this.dataUpstream + this.dataDownstream;

    public meterIsRunning = () => this.countdownMeter > 0;
}