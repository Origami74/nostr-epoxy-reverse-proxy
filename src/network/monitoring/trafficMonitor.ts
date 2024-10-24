import { createCollection } from 'measured-core';
import type { Buffer } from "node:buffer";



export class TrafficMonitor{

    const metrics = createCollection();
    public async measure(){

    }

    private measureDataSize = (data: Buffer) => {
        metrics.meter('data.processed.bytes').mark(data.length);
        // Process your data here
    };

    // Using the method
const testData = Buffer.from('Some data to process');
dataProcessingMethod(testData);

// Expose metrics for debugging
console.log(metrics.toJSON());
}
