export type TelemetryRecord = Readonly<{
  type: "service.boot" | "ai.operation.start" | "ai.operation.end" | "ai.operation.error";
  operationId?: string | undefined;
}>;

/** Records are intentionally bounded: prompts, outputs, tool payloads, and errors are excluded. */
export interface TelemetrySink {
  readonly record: (record: TelemetryRecord) => void | Promise<void>;
}
