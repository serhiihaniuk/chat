import type {
  DiagnosticLogFields,
  DiagnosticLogger,
  DiagnosticLogLevel,
  JsonObject,
  JsonValue,
} from "@side-chat/shared";
import type { ObservabilityRecord, ObservabilitySinkPort } from "@side-chat/partner-ai-core";
import { Effect } from "effect";

/**
 * Render `ObservabilityRecord`s as one compact diagnostic line each.
 *
 * This is the real, shipped telemetry sink — the dev default and the adopter
 * recipe in one. Turn lifecycle (`received` / `started` / terminals) and the
 * transport terminals log at `info`; the raw runtime-event stream and subscriber
 * churn log at `debug`, except a tool or host-command activity, which is
 * interesting enough to surface at `info` with its name and status. The record's
 * `attributes` are already redacted upstream, and the logger redacts again, so no
 * secret reaches the console at any level. Fail-open: rendering never throws back
 * to the core workflow.
 */
export const createConsoleObservabilitySink = (
  logger: DiagnosticLogger,
): ObservabilitySinkPort => ({
  record: (record) =>
    Effect.sync(() => {
      try {
        const line = describeRecord(record);
        logger[levelForRecord(record)](line.message, line.fields);
      } catch {
        // A telemetry line is never worth faulting a turn (see `plan/27` for the
        // core-side fail-open wrapper this complements).
      }
    }),
});

// Turn lifecycle + transport terminals are info; the raw runtime-event stream and
// subscriber/replay churn are debug (a tool/host-command activity is the one
// runtime_event promoted to info, decided per record below).
const INFO_LIFECYCLE_STATES: ReadonlySet<ObservabilityRecord["lifecycleState"]> = new Set([
  "received",
  "started",
  "completed",
  "failed",
  "turn_cancelled",
  "turn_reaped",
  "run_finished",
]);

const levelForRecord = (record: ObservabilityRecord): DiagnosticLogLevel => {
  // A failed persistence read during replay is a real fault, not routine churn.
  if (record.lifecycleState === "event_read_failed") return "warn";
  if (record.lifecycleState === "runtime_event") {
    return isSurfacedActivity(record.attributes) ? "info" : "debug";
  }
  return INFO_LIFECYCLE_STATES.has(record.lifecycleState) ? "info" : "debug";
};

// A tool or host-command activity is worth an info line; reasoning/progress
// activities and output deltas stay at debug so the default console is readable.
const isSurfacedActivity = (attributes: JsonObject): boolean =>
  readString(attributes, "eventType") === "runtime.activity" &&
  (readString(attributes, "activityKind") === "tool" ||
    readString(attributes, "activityKind") === "host_command");

const describeRecord = (
  record: ObservabilityRecord,
): { readonly message: string; readonly fields: DiagnosticLogFields } => {
  const turn = shortId(record.assistantTurnId);
  const state = record.lifecycleState;
  if (state === "received") {
    return { message: "turn received", fields: compact({ req: shortId(record.requestId) }) };
  }
  if (state === "started") {
    return { message: "turn started", fields: compact({ turn, model: record.modelId }) };
  }
  if (state === "runtime_event") return describeRuntimeEvent(record, turn);
  if (state === "completed") {
    return { message: "turn completed", fields: compact({ turn, latencyMs: record.latencyMs }) };
  }
  if (state === "failed") {
    return {
      message: "turn failed",
      fields: compact({ turn, latencyMs: record.latencyMs, error: record.errorCode }),
    };
  }
  // Every remaining transport lifecycle state shares one point-in-time shape.
  // A zero latency is meaningless for an instantaneous event, so drop it.
  return {
    message: transportMessage(state),
    fields: compact({
      turn,
      latencyMs: record.latencyMs > 0 ? record.latencyMs : undefined,
      error: record.errorCode,
    }),
  };
};

const describeRuntimeEvent = (
  record: ObservabilityRecord,
  turn: string | undefined,
): { readonly message: string; readonly fields: DiagnosticLogFields } => {
  if (!isSurfacedActivity(record.attributes)) {
    return {
      message: "runtime event",
      fields: compact({ turn, event: readString(record.attributes, "eventType") }),
    };
  }
  const kind = readString(record.attributes, "activityKind");
  return {
    message: "activity",
    fields: compact({
      turn,
      kind,
      name: readActivityName(record.attributes),
      status: readString(record.attributes, "status"),
    }),
  };
};

// The activity name lives under the redaction-safe `activityMeta` — a tool's
// `toolName` or a host command's `commandName`.
const readActivityName = (attributes: JsonObject): string | undefined => {
  const meta = readObject(attributes, "activityMeta");
  if (!meta) return undefined;
  return (
    readString(readObject(meta, "tool") ?? {}, "toolName") ??
    readString(readObject(meta, "hostCommand") ?? {}, "commandName")
  );
};

const transportMessage = (state: ObservabilityRecord["lifecycleState"]): string =>
  state.replace(/_/gu, " ");

const shortId = (id: string | undefined): string | undefined =>
  id ? id.slice(Math.max(0, id.length - 8)) : undefined;

const readString = (source: JsonObject, key: string): string | undefined => {
  const value = source[key];
  return typeof value === "string" ? value : undefined;
};

const readObject = (source: JsonObject, key: string): JsonObject | undefined => {
  const value = source[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  // Only the JsonObject member of JsonValue remains; Array.isArray does not narrow
  // a readonly array out of the union, so assert the sole survivor.
  return value as JsonObject;
};

// Drop undefined fields so a line only carries what it actually has.
const compact = (fields: Record<string, JsonValue | undefined>): JsonObject => {
  const output: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) output[key] = value;
  }
  return output;
};
