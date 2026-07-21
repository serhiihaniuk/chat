import { registerTelemetry, type Telemetry } from "ai";

import {
  PRIVATE_TELEMETRY_OPTIONS,
  sanitizeTelemetryLabels,
  type TelemetryLabels,
  type TelemetryRecord,
  type TelemetrySink,
} from "#application/ports/telemetry-sink";
import {
  installProcessTelemetrySink,
  recordProcessTelemetry,
} from "#application/telemetry/process-telemetry";

/**
 * `ai@7.0.32` callbacks that this adapter intentionally implements. The
 * workflow bridge may omit callbacks; every handler is therefore independent.
 */
export const AI_SDK_PINNED_TELEMETRY_ASSERTION_LIST = [
  "onStart",
  "onStepStart",
  "onStepEnd",
  "onLanguageModelCallStart",
  "onLanguageModelCallEnd",
  "onToolExecutionStart",
  "onToolExecutionEnd",
  "onEnd",
  "onAbort",
  "onError",
] as const satisfies readonly (keyof Telemetry)[];

export class TelemetryRegistrationError extends Error {
  readonly code = "telemetry_already_registered";
}

export { PRIVATE_TELEMETRY_OPTIONS };

export function registerServiceTelemetry(
  sink: TelemetrySink,
  additionalIntegrations: readonly Telemetry[] = [],
): void {
  if ((globalThis.AI_SDK_TELEMETRY_INTEGRATIONS?.length ?? 0) > 0) {
    throw new TelemetryRegistrationError(
      "AI SDK telemetry may be registered only once per process",
    );
  }
  const processSink = createFailOpenTelemetrySink(sink);
  installProcessTelemetrySink(processSink);
  registerTelemetry(createAiSdkTelemetry(processSink), ...additionalIntegrations);
  recordProcessTelemetry({ type: "service.boot" });
}

/** Record a bounded service event without allowing instrumentation to affect the caller. */
export const recordServiceTelemetry: TelemetrySink["record"] = recordProcessTelemetry;

/** Converts both synchronous throws and rejected promises into a no-op. */
export function createFailOpenTelemetrySink(sink: TelemetrySink): TelemetrySink {
  return {
    record: (record) => {
      try {
        void Promise.resolve(sink.record(record)).catch(() => undefined);
      } catch {
        // Telemetry is diagnostic and must never change a product outcome.
      }
    },
  };
}

export function createAiSdkTelemetry(sink: TelemetrySink): Telemetry {
  return new AiSdkTelemetryAdapter(createFailOpenTelemetrySink(sink));
}

class AiSdkTelemetryAdapter implements Telemetry {
  readonly #sink: TelemetrySink;

  constructor(sink: TelemetrySink) {
    this.#sink = sink;
  }

  onStart(event: Parameters<NonNullable<Telemetry["onStart"]>>[0]): void {
    this.#record({
      type: "ai.operation.start",
      labels: modelLabels(event, event.operationId),
    });
  }

  onStepStart(event: Parameters<NonNullable<Telemetry["onStepStart"]>>[0]): void {
    this.#record({
      type: "ai.step.start",
      labels: modelLabels(event),
      stepNumber: event.stepNumber,
    });
  }

  onStepEnd(event: Parameters<NonNullable<Telemetry["onStepEnd"]>>[0]): void {
    this.#record({
      type: "ai.step.end",
      labels: { ...modelLabels(event.model), outcomeTag: event.finishReason },
      stepNumber: event.stepNumber,
      finishReason: event.finishReason,
      ...performanceFields(event.performance),
    });
  }

  onLanguageModelCallStart(
    event: Parameters<NonNullable<Telemetry["onLanguageModelCallStart"]>>[0],
  ): void {
    this.#record({ type: "ai.language_model.start", labels: modelLabels(event) });
  }

  onLanguageModelCallEnd(
    event: Parameters<NonNullable<Telemetry["onLanguageModelCallEnd"]>>[0],
  ): void {
    this.#record({
      type: "ai.language_model.end",
      labels: { ...modelLabels(event), outcomeTag: event.finishReason },
      finishReason: event.finishReason,
      ...performanceFields(event.performance),
    });
  }

  onToolExecutionStart(event: Parameters<NonNullable<Telemetry["onToolExecutionStart"]>>[0]): void {
    this.#record({ type: "ai.tool.start", labels: toolLabels(event.toolCall.toolName) });
  }

  onToolExecutionEnd(event: Parameters<NonNullable<Telemetry["onToolExecutionEnd"]>>[0]): void {
    this.#record({
      type: "ai.tool.end",
      labels: {
        ...toolLabels(event.toolCall.toolName),
        outcomeTag: toolOutcome(event.toolOutput),
      },
      durationMs: finiteNumber(event.toolExecutionMs),
    });
  }

  onEnd(event: Parameters<NonNullable<Telemetry["onEnd"]>>[0]): void {
    const finalStep = readRecord(event)["finalStep"];
    const finalStepRecord = readRecord(finalStep);
    const finishReason = readString(event, "finishReason") ?? readString(finalStep, "finishReason");
    this.#record({
      type: "ai.operation.end",
      labels: compactLabels({
        ...modelLabels(readRecord(event)["model"] ?? finalStepRecord["model"]),
        outcomeTag: finishReason,
      }),
      stepNumber: readNumber(event, "stepNumber") ?? readNumber(finalStep, "stepNumber"),
      finishReason,
      ...performanceFields(finalStepRecord["performance"]),
    });
  }

  onAbort(): void {
    this.#record({ type: "ai.operation.abort" });
  }

  onError(): void {
    this.#record({ type: "ai.operation.error" });
  }

  #record(event: TelemetryRecord): void {
    void this.#sink.record(event);
  }
}

function modelLabels(value: unknown, operation?: string): TelemetryLabels {
  return compactLabels({
    providerKind: readString(value, "provider"),
    modelAlias: readString(value, "modelId"),
    operation,
  });
}

function toolLabels(toolName: unknown): TelemetryLabels {
  return compactLabels({ toolName: typeof toolName === "string" ? toolName : undefined });
}

function compactLabels(labels: {
  readonly providerKind?: string | undefined;
  readonly modelAlias?: string | undefined;
  readonly outcomeTag?: string | undefined;
  readonly toolName?: string | undefined;
  readonly operation?: string | undefined;
}): TelemetryLabels {
  return sanitizeTelemetryLabels(labels);
}

function performanceFields(value: unknown): Readonly<{
  durationMs?: number | undefined;
  responseTimeMs?: number | undefined;
  timeToFirstOutputMs?: number | undefined;
  outputTokensPerSecond?: number | undefined;
}> {
  const performance = readRecord(value);
  return {
    durationMs: readNumber(performance, "stepTimeMs") ?? readNumber(performance, "responseTimeMs"),
    responseTimeMs: readNumber(performance, "responseTimeMs"),
    timeToFirstOutputMs: readNumber(performance, "timeToFirstOutputMs"),
    outputTokensPerSecond: readNumber(performance, "outputTokensPerSecond"),
  };
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toolOutcome(value: unknown): string {
  return readString(value, "type") === "tool-result" ? "succeeded" : "failed";
}

function readString(value: unknown, key: string): string | undefined {
  const candidate = readRecord(value)[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  return finiteNumber(readRecord(value)[key]);
}

function readRecord(value: unknown): Readonly<Record<string, unknown>> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object";
}
