export const TELEMETRY_LABEL_ALLOWLIST = {
  providerKind: true,
  modelAlias: true,
  outcomeTag: true,
  toolName: true,
  operation: true,
} as const;

export type TelemetryLabelName = keyof typeof TELEMETRY_LABEL_ALLOWLIST;
export type TelemetryLabels = Readonly<Partial<Record<TelemetryLabelName, string>>>;

/** Drops unknown label keys at the telemetry boundary. */
export function sanitizeTelemetryLabels(
  labels: Readonly<Record<string, string | undefined>>,
): TelemetryLabels {
  return Object.fromEntries(
    Object.entries(labels).filter(
      (entry): entry is [TelemetryLabelName, string] =>
        entry[1] !== undefined && entry[0] in TELEMETRY_LABEL_ALLOWLIST,
    ),
  );
}

type AiTelemetryRecord = Readonly<{
  type:
    | "ai.operation.start"
    | "ai.step.start"
    | "ai.step.end"
    | "ai.language_model.start"
    | "ai.language_model.end"
    | "ai.tool.start"
    | "ai.tool.end"
    | "ai.operation.end"
    | "ai.operation.abort"
    | "ai.operation.error";
  labels?: TelemetryLabels | undefined;
  stepNumber?: number | undefined;
  durationMs?: number | undefined;
  responseTimeMs?: number | undefined;
  timeToFirstOutputMs?: number | undefined;
  outputTokensPerSecond?: number | undefined;
  finishReason?: string | undefined;
}>;

type ServiceTelemetryRecord = Readonly<{
  type:
    | "service.boot"
    | "service.shutdown.stage"
    | "capacity.admitted"
    | "capacity.queued"
    | "capacity.rejected"
    | "capacity.active"
    | "capacity.queue_wait"
    | "stream.dropped_unknown_chunk"
    | "stream.duplicate_terminal"
    | "stream.keepalive"
    | "stream.reconnect"
    | "turn.terminal"
    | "client_tool.wait"
    | "client_tool.output"
    | "tool_approval.wait"
    | "tool_approval.decision"
    | "workflow.nonterminal_stuck"
    | "persistence.history_drift"
    | "conversation.title_generated"
    | "conversation.title_skipped"
    | "conversation.title_error"
    | "workflow.journal_prune"
    | "workflow.journal_prune_error";
  labels?: TelemetryLabels | undefined;
  count?: number | undefined;
  value?: number | undefined;
  durationMs?: number | undefined;
  bytes?: number | undefined;
  oldestRunAgeMs?: number | undefined;
  oldestRunStartedAt?: string | undefined;
}>;

/**
 * Content-free telemetry contract. Identifiers used for event correlation stay
 * inside the SDK integration and are never exposed as labels or sink fields.
 */
export type TelemetryRecord = AiTelemetryRecord | ServiceTelemetryRecord;

/** Provider calls never record prompt, output, runtime context, or tool content. */
export const PRIVATE_TELEMETRY_OPTIONS = {
  recordInputs: false,
  recordOutputs: false,
  includeRuntimeContext: {},
} as const;

/** Records exclude prompts, outputs, tool payloads, identifiers, and raw errors. */
export interface TelemetrySink {
  readonly record: (record: TelemetryRecord) => void | Promise<void>;
}
