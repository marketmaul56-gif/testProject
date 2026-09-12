import {
  metrics,
  SpanStatusCode,
  trace,
  type Attributes,
} from "@opentelemetry/api";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

const tracer = trace.getTracer("ai-native-skill-platform");
const meter = metrics.getMeter("ai-native-skill-platform");

export const authorityDeliveryCounter = meter.createCounter("authority.delivery.total", {
  description: "Trusted authority deliveries completed by event type and outcome.",
});
export const dependencyFailureCounter = meter.createCounter("dependency.failure.total", {
  description: "Bounded dependency failures classified without learner authority mutation.",
});
export const verifierDuration = meter.createHistogram("verifier.duration.ms", {
  description: "Authoritative verifier execution duration in milliseconds.",
  unit: "ms",
});

export type TelemetryRuntime = Readonly<{
  enabled: boolean;
  shutdown(): Promise<void>;
}>;

function otlpUrl(endpoint: string, signal: "traces" | "metrics"): string {
  return `${endpoint.replace(/\/$/, "")}/v1/${signal}`;
}

export function startTelemetry(serviceName: string): TelemetryRuntime {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    return Object.freeze({ enabled: false, async shutdown() {} });
  }

  process.env.OTEL_SERVICE_NAME ??= serviceName;
  const timeoutMillis = Number(process.env.OTEL_EXPORTER_OTLP_TIMEOUT ?? 5_000);
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({ url: otlpUrl(endpoint, "traces"), timeoutMillis }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: otlpUrl(endpoint, "metrics"), timeoutMillis }),
      exportIntervalMillis: 30_000,
      exportTimeoutMillis: timeoutMillis,
    }),
  });
  sdk.start();
  return Object.freeze({
    enabled: true,
    async shutdown() { await sdk.shutdown(); },
  });
}

export async function withSpan<T>(name: string, attributes: Attributes, work: () => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const value = await work();
      span.setStatus({ code: SpanStatusCode.OK });
      return value;
    } catch (error) {
      span.recordException(error instanceof Error ? error : new Error("unknown operation failure"));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
