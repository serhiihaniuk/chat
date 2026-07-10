import type { LanguageModelUsage, TextStreamPart, ToolSet } from "ai";

import {
  AiRuntimeError,
  RUNTIME_BLOCKED_REASONS,
  RUNTIME_ERROR_CODES,
  RUNTIME_EVENT_TYPES,
  RUNTIME_FINISH_REASONS,
  type RuntimeEvent,
  type RuntimeFinishReason,
  type RuntimeUsage,
} from "@side-chat/ai-runtime-contract";
import type { RuntimeProviderRequest } from "../../turn/runtime-provider-request.js";

const AI_SDK_FINISH_REASON_LENGTH = "length" as const;
const AI_SDK_FINISH_REASON_CONTENT_FILTER = "content-filter" as const;
const AI_SDK_FINISH_REASON_ERROR = "error" as const;
const AI_SDK_FINISH_REASON_TOOL_CALLS = "tool-calls" as const;
const AI_SDK_PART_TYPE_ABORT = "abort" as const;

/**
 * Browser-safe text for a provider content-filter stop.
 *
 * The raw provider moderation reason never leaves this package; callers only see
 * this stable message on the blocked terminal event.
 */
export const RUNTIME_CONTENT_FILTER_PUBLIC_MESSAGE =
  "The assistant cannot complete this response because it was blocked by safety filtering.";

/**
 * Browser-safe text for an unexpected provider/SDK failure.
 *
 * Raw provider and SDK error strings can contain request internals; the public
 * boundary replaces them with this stable message and keeps only the runtime
 * error code for callers to branch on.
 */
export const RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE =
  "The assistant could not complete this response because of a provider error.";

/**
 * Browser-safe text for a caller-aborted turn.
 *
 * A stream that fails before it can emit an abort terminal (e.g. aborted during
 * stream open) returns this stable message to callers with the `aborted` code.
 */
export const RUNTIME_ABORTED_PUBLIC_MESSAGE =
  "The assistant response was stopped before it finished.";

/**
 * Normalize any thrown/streamed failure into a public-safe `AiRuntimeError`.
 *
 * Runtime-authored `AiRuntimeError`s already carry safe messages and pass
 * through. A caller abort (`AbortError`) keeps the honest `aborted` code so it is
 * never retried as a provider outage. Any other foreign SDK/provider error is
 * reduced to a stable public message so its raw text never crosses the boundary.
 */
export const toProviderRuntimeError = (error: unknown): AiRuntimeError => {
  if (error instanceof AiRuntimeError) return error;
  if (isAbortError(error)) {
    return new AiRuntimeError(RUNTIME_ERROR_CODES.ABORTED, RUNTIME_ABORTED_PUBLIC_MESSAGE);
  }
  return new AiRuntimeError(
    RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
    RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE,
  );
};

/** A `DOMException`/`Error` named `AbortError` is how a fetch/stream reports an abort. */
const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

/**
 * Emit the first event before any provider output is read.
 *
 * Target service/UI gets a concrete turn boundary immediately: which
 * provider/model is being used, which request is streaming, and where later
 * sequence numbers begin.
 */
export const createRuntimeStartedEvent = (
  request: RuntimeProviderRequest,
  sequence: number,
): RuntimeEvent => ({
  type: RUNTIME_EVENT_TYPES.STARTED,
  requestId: request.requestId,
  assistantTurnId: request.assistantTurnId,
  sequence,
  providerId: request.providerId,
  modelId: request.modelId,
});

/**
 * Handle AI SDK parts that become plain runtime events.
 *
 * Tool parts are handled elsewhere because they update activity rows. This file
 * only maps text deltas, final completion, and provider errors.
 */
export const mapAiSdkStreamPart = (
  request: RuntimeProviderRequest,
  part: TextStreamPart<ToolSet>,
  sequence: number,
): RuntimeEvent | undefined => {
  if (part.type === "text-delta") {
    return {
      type: RUNTIME_EVENT_TYPES.OUTPUT_DELTA,
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      content: part.text,
    };
  }
  if (part.type === AI_SDK_PART_TYPE_ABORT) {
    // The SDK enqueues an `abort` part (no finish) when the caller aborts the
    // stream. Map it to the aborted completion terminal so a caller using the
    // public abort signal never gets a terminal-less stream.
    return {
      type: RUNTIME_EVENT_TYPES.COMPLETED,
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      finishReason: RUNTIME_FINISH_REASONS.ABORTED,
    };
  }
  if (part.type === "finish") {
    // A content-filter stop is a safety terminal, not a completion. Mapping it to
    // `runtime.blocked` keeps it from ever being persisted or shown as a finished
    // answer.
    if (part.finishReason === AI_SDK_FINISH_REASON_CONTENT_FILTER) {
      return {
        type: RUNTIME_EVENT_TYPES.BLOCKED,
        requestId: request.requestId,
        assistantTurnId: request.assistantTurnId,
        sequence,
        reason: RUNTIME_BLOCKED_REASONS.CONTENT_FILTER,
        publicMessage: RUNTIME_CONTENT_FILTER_PUBLIC_MESSAGE,
      };
    }
    // An `error` finish reason accompanies an in-band `error` part that already
    // produced the terminal, so emit nothing here rather than a second, dishonest
    // `completed(stop)` terminal after the error.
    if (part.finishReason === AI_SDK_FINISH_REASON_ERROR) return undefined;
    return {
      type: RUNTIME_EVENT_TYPES.COMPLETED,
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      finishReason: mapFinishReason(part.finishReason),
      usage: toRuntimeUsage(part.totalUsage),
    };
  }
  if (part.type === "error") {
    // The raw `part.error` may carry provider internals; the browser only gets a
    // stable public message plus the runtime error code.
    return {
      type: RUNTIME_EVENT_TYPES.ERROR,
      requestId: request.requestId,
      assistantTurnId: request.assistantTurnId,
      sequence,
      code: RUNTIME_ERROR_CODES.PROVIDER_UNAVAILABLE,
      message: RUNTIME_PROVIDER_ERROR_PUBLIC_MESSAGE,
      retryable: true,
    };
  }
  return undefined;
};

/**
 * Map provider finish reasons to the smaller runtime set.
 *
 * The UI only needs normal stop, length limit, or tool-step limit. A final
 * `tool-calls` reason means the model still wanted another tool call, so it maps
 * to `tool_step_limit` instead of looking like a normal stop. Abort, filtering,
 * and provider errors are handled by their own terminal paths.
 */
const mapFinishReason = (reason: string): RuntimeFinishReason => {
  if (reason === AI_SDK_FINISH_REASON_LENGTH) return RUNTIME_FINISH_REASONS.LENGTH;
  if (reason === AI_SDK_FINISH_REASON_TOOL_CALLS) return RUNTIME_FINISH_REASONS.TOOL_STEP_LIMIT;
  return RUNTIME_FINISH_REASONS.STOP;
};

/**
 * Fill missing token counts with zero.
 *
 * Providers do not always report every count; callers should not have to branch
 * on missing usage fields.
 */
const toRuntimeUsage = (usage: LanguageModelUsage): RuntimeUsage => ({
  inputTokens: usage.inputTokens ?? 0,
  outputTokens: usage.outputTokens ?? 0,
  totalTokens: usage.totalTokens ?? 0,
});

type AiSdkPartType = TextStreamPart<ToolSet>["type"];

export type AiSdkPartClassification = "mapped" | "ignored" | "unknown";

/**
 * Classify every AI SDK stream part.
 *
 * Mapped parts become runtime events. Ignored parts are deliberate no-ops for
 * framing, streamed tool input, provider passthrough, or sources the timeline
 * does not render. The exhaustive `Record` makes a future SDK part fail at
 * compile time until it is classified.
 *
 * Source: one AI SDK stream part. Target: a runtime event or an intentional
 * no-op. Invariant: every SDK part type must be classified.
 */
const AI_SDK_PART_CLASSIFICATION: Record<AiSdkPartType, AiSdkPartClassification> = {
  "text-delta": "mapped",
  finish: "mapped",
  error: "mapped",
  abort: "mapped",
  "reasoning-delta": "mapped",
  "tool-input-start": "mapped",
  "tool-call": "mapped",
  "tool-result": "mapped",
  "tool-error": "mapped",
  start: "ignored",
  "start-step": "ignored",
  "finish-step": "ignored",
  "text-start": "ignored",
  "text-end": "ignored",
  "reasoning-start": "ignored",
  "reasoning-end": "ignored",
  "tool-input-delta": "ignored",
  "tool-input-end": "ignored",
  "tool-output-denied": "ignored",
  "tool-approval-request": "ignored",
  source: "ignored",
  file: "ignored",
  raw: "ignored",
};

const isKnownAiSdkPartType = (type: string): type is AiSdkPartType =>
  Object.hasOwn(AI_SDK_PART_CLASSIFICATION, type);

/**
 * Classify an AI SDK stream part so the runner can log a genuinely unknown one
 * rather than dropping it silently. A `string` is taken (not `AiSdkPartType`) so
 * a value outside the compiled union resolves to `unknown` at runtime.
 */
export const classifyAiSdkPart = (type: string): AiSdkPartClassification =>
  isKnownAiSdkPartType(type) ? AI_SDK_PART_CLASSIFICATION[type] : "unknown";
