import type { Telemetry } from "ai";

export type OtlpTelemetry = {
  readonly integration: Telemetry;
  readonly close: () => Promise<void>;
};

/**
 * Load the optional OTLP stack only when deployment config selects it.
 * Keeping every unstable exporter import here lets console/off deployments boot
 * even when optional exporter packages were omitted during installation.
 */
export async function createOtlpTelemetry(options: {
  readonly endpoint: string;
  readonly serviceName: string;
}): Promise<OtlpTelemetry> {
  const [aiOtel, exporterModule, resources, tracing, conventions] = await Promise.all([
    import("@ai-sdk/otel"),
    import("@opentelemetry/exporter-trace-otlp-http"),
    import("@opentelemetry/resources"),
    import("@opentelemetry/sdk-trace-node"),
    import("@opentelemetry/semantic-conventions"),
  ]);
  const exporter = new exporterModule.OTLPTraceExporter({
    url: options.endpoint,
  });
  const provider = new tracing.NodeTracerProvider({
    resource: resources.resourceFromAttributes({
      [conventions.ATTR_SERVICE_NAME]: options.serviceName,
    }),
    spanProcessors: [new tracing.BatchSpanProcessor(exporter)],
  });
  provider.register();
  return {
    integration: new aiOtel.OpenTelemetry({
      tracer: provider.getTracer(options.serviceName),
      embedding: false,
      headers: false,
      providerMetadata: false,
      reranking: false,
      runtimeContext: false,
      schema: false,
      toolChoice: false,
      usage: true,
    }),
    close: () => provider.shutdown(),
  };
}
