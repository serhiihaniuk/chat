export type TelemetryRecord = Readonly<{
  type:
    | "service.boot"
    | "ai.operation.start"
    | "ai.operation.end"
    | "ai.operation.error"
    | "persistence.history_drift"
    | "conversation.title_generated"
    | "conversation.title_skipped"
    | "conversation.title_error"
    | "workflow.journal_prune"
    | "workflow.journal_prune_error";
  operationId?: string | undefined;
}>;

/** Provider calls never record prompt, output, or tool content. */
export const PRIVATE_TELEMETRY_OPTIONS = {
  recordInputs: false,
  recordOutputs: false,
} as const;

/** Records are intentionally bounded: prompts, outputs, tool payloads, and errors are excluded. */
export interface TelemetrySink {
  readonly record: (record: TelemetryRecord) => void | Promise<void>;
}
