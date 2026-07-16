# ADR 0003: Separate Operational Diagnostics From Product Telemetry

Status: accepted 2026-07-16 (rebaselined from the 2026-07-02 observability decision)

## Context

The service needs evidence for two different audiences. Operational diagnostics
explain boot, configuration, listeners, maintenance, readiness, and shutdown.
Product telemetry measures bounded lifecycle, capacity, Workflow, provider, and
stream outcomes. Combining them would either force process failures into a
product vocabulary or encourage telemetry records to carry private content.

This starter must also remain useful without an observability vendor. Local
development needs useful console output, while production integrations need a
small vendor-neutral seam that cannot break chat execution.

## Decision

Side Chat keeps two channels:

1. `DiagnosticLogger` owns leveled operational messages. It is a neutral shared
   interface used for process and infrastructure conditions that are not product
   measurements.
2. The service-local `TelemetrySink` owns allowlisted counters, gauges,
   histograms, and lifecycle records. Labels are bounded, content-free, and
   validated before a sink receives them.

Both channels are fail-open. A throwing or rejecting implementation may lose an
observation, but it must not reject a request, abort a stream, prevent shutdown,
or crash the process. Neither channel may contain prompts, model output, tool
payloads, credentials, provider errors, or private conversation data.

Local development uses readable console implementations. Production may enable
the optional OTLP exporter through resolved configuration; the exporter is not
loaded when disabled. Product code depends only on the channel interfaces, not
on an APM SDK.

## Alternatives rejected

- **One merged event vocabulary:** process diagnostics and product measurements
  have different consumers, cardinality constraints, and privacy rules.
- **Direct OpenTelemetry calls throughout the service:** vendor details would
  spread into product and Workflow code and make exporter failure load-bearing.
- **Verbose content logging:** a debug flag must never turn private assistant
  content into telemetry.
- **Silent local defaults:** developers need boot, readiness, maintenance, and
  shutdown evidence without first configuring a collector.

## Consequences

Every new observation must choose the correct channel and use bounded labels.
The two small interfaces add composition work, but keep privacy and failure
semantics explicit. [Telemetry operations](../operations/telemetry.md) owns the
current configuration, metric inventory, and exporter details.
