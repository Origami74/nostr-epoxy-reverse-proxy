import { container } from "tsyringe";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { PeriodicExportingMetricReader, MeterProvider } from "@opentelemetry/sdk-metrics";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { envDetector, processDetector, Resource } from "@opentelemetry/resources";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";

import { Wallet } from "./pricing/wallet.js";
import { CashRegister } from "./pricing/cashRegister.js";
import { RelayProvider } from "./relayProvider.js";
import Switchboard, { type ISwitchboard } from "./network/switchboard.js";
import OutboundNetwork from "./network/outbound.js";
import PubkeyResolver from "./network/pubkeyResolver.js";
import { EventPublisher } from "./eventPublisher.js";
import Gossip from "./network/gossip.js";
import Payout from "./pricing/payout.js";

export function startup() {
  console.info("Running startup");

  container.registerSingleton(EventPublisher.name, EventPublisher);
  container.registerSingleton(RelayProvider.name, RelayProvider);
  container.registerSingleton(Wallet.name, Wallet);
  container.registerSingleton(CashRegister.name, CashRegister);
  container.registerSingleton(OutboundNetwork.name, OutboundNetwork);

  container.register(Switchboard.name, { useClass: Switchboard });
  container.register(PubkeyResolver.name, { useClass: PubkeyResolver });

  // Background Services
  container.registerSingleton(Gossip.name, Gossip);
  container.registerSingleton(Payout.name, Payout);

  console.info("All services registered");
  const gossip = container.resolve<Gossip>(Gossip.name);
  const payout = container.resolve<Payout>(Payout.name);

  setupOtel();

  gossip.start();
  payout.start();

  process.on("SIGTERM", async () => {
    gossip.stop()
    await payout.stop()
  });

  console.info("Startup completed");
}

function setupOtel() {
  const prometheusExporter = new PrometheusExporter(
    {
      // @ts-expect-error
      startServer: true,
      port: 9090,
    },
    () => {
      console.log("prometheus scrape endpoint: http://localhost:" + "9090" + "/metrics");
    },
  );

  const otlpMetricExporter = new OTLPMetricExporter({
    url: "http://localhost:4317/v1/metrics",
  });

  const otlpMetricReader = new PeriodicExportingMetricReader({
    exporter: otlpMetricExporter,
    exportIntervalMillis: 1000,
  });

  const logExporter = new OTLPLogExporter({
    url: "http://localhost:4317/v1/logs",
  });

  const otlpLogProcessor = new BatchLogRecordProcessor(logExporter);

  const sdk = new NodeSDK({
    resourceDetectors: [envDetector, processDetector],
    resource: new Resource({
      [ATTR_SERVICE_NAME]: "nerp-otel",
    }),

    instrumentations: [getNodeAutoInstrumentations()],
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
    metricReader: otlpMetricReader,
    logRecordProcessor: otlpLogProcessor,
  });

  sdk.start();

  process.on("SIGTERM", () => {
    sdk
      .shutdown()
      .then(() => console.log("OpenTelemetry terminated"))
      .catch((error) => console.log("Error terminating tracing", error))
      .finally(() => process.exit(0));
  });

  const meterProvider = new MeterProvider({ readers: [prometheusExporter] });
  const meter = meterProvider.getMeter("bla");

  const counter = meter.createCounter("my-loop", { description: "this is how many loops i did" });

  for (let i = 0; i < 100; i++) {
    counter.add(1);
  }
}
