import type { Stream } from "effect";
import type { JsonObject } from "@side-chat/shared";
import type {
  AssistantTurnId,
  ConversationId,
  ExecutorId,
  HostAppId,
  ModelId,
  ProviderId,
  RequestId,
  RuntimeActivityId,
  RuntimeSequence,
  SubjectId,
  WorkspaceId,
} from "./runtime-ids.js";
import type {
  RuntimeActivityDetails,
  RuntimeActivityKind,
  RuntimeActivityStatus,
} from "./runtime-activity.js";

/**
 * Provider-neutral runtime boundary shared by product core and runtime engines.
 *
 * Product core sends one final model request through `AiRuntimePort`. The
 * runtime boundary emits normalized RuntimeEvents and hides provider-native
 * parts, executable tools, and AI SDK details behind their own package boundary.
 * Branded ids live in `runtime-ids.ts`; update this file when the request, event,
 * or port contract changes, not when a specific provider or executor changes.
 */

export * from "./runtime-ids.js";
export * from "./runtime-activity.js";

export type AiRuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export const RUNTIME_REASONING_EFFORTS = {
  NONE: "none",
  MINIMAL: "minimal",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  XHIGH: "xhigh",
} as const;

export type RuntimeReasoningEffort =
  (typeof RUNTIME_REASONING_EFFORTS)[keyof typeof RUNTIME_REASONING_EFFORTS];

/**
 * Provider-neutral reasoning request selected before runtime execution.
 *
 * Core may pass this when a turn chooses a backend-allowed reasoning effort.
 * Provider adapters decide how to translate the effort into their SDK options;
 * provider-native option names stay outside this contract.
 */
export type RuntimeReasoningPolicy = {
  readonly effort: RuntimeReasoningEffort;
};

/**
 * Provider-neutral model call settings applied to one turn's generation.
 *
 * Ordinary sampling/output knobs plus the tool-loop step cap, all optional so an
 * absent bag changes nothing. Top-level model settings (not provider-native
 * options); the runtime spreads them in and `maxToolSteps` becomes the stop cap.
 */
export type RuntimeCallSettings = {
  readonly temperature?: number | undefined;
  readonly maxOutputTokens?: number | undefined;
  readonly topP?: number | undefined;
  readonly stopSequences?: readonly string[] | undefined;
  /** Max tool-loop steps before generation stops; absent uses the runtime default. */
  readonly maxToolSteps?: number | undefined;
};

/**
 * App-owned scope passed to executable runtime tools.
 *
 * Core has already selected the tool names before this crosses the runtime
 * boundary. The scope gives a tool enough product identity for app-side auth,
 * logging, cancellation, and host-command checks without exposing assistant
 * profile selection or prompt-building details to runtime.
 */
export type AiToolScope = {
  readonly hostAppId: HostAppId;
  readonly workspaceId: WorkspaceId;
  readonly subjectId: SubjectId;
  readonly conversationId: ConversationId;
  readonly assistantTurnId: AssistantTurnId;
  readonly hostCommands?: readonly AiHostCommandDescriptor[] | undefined;
};

/**
 * One host command the host app declared as available for this turn.
 *
 * The host owns these and they vary by page, so they ride in per turn (from the
 * request) rather than from static server config. The runtime exposes each as a
 * model-callable tool; `inputSchema` is the JSON Schema for the command payload.
 */
export type AiHostCommandDescriptor = {
  readonly commandName: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

/**
 * Final request product core sends to a runtime implementation.
 *
 * Provider, model, executor, messages, and tool names are already resolved.
 * Runtime may validate ids and resolve executable registrations, but it must
 * not reopen profile policy, prepend prompt text, or gather context.
 */
export type AiRuntimeRequest = {
  readonly requestId: RequestId;
  readonly assistantTurnId: AssistantTurnId;
  readonly executorId: ExecutorId;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly reasoning?: RuntimeReasoningPolicy | undefined;
  readonly callSettings?: RuntimeCallSettings | undefined;
  readonly messages: readonly AiRuntimeMessage[];
  readonly toolNames: readonly string[];
  readonly toolScope: AiToolScope;
  readonly abortSignal?: AbortSignal | undefined;
};

export const RUNTIME_EVENT_TYPES = {
  STARTED: "runtime.started",
  OUTPUT_DELTA: "runtime.output_delta",
  ACTIVITY: "runtime.activity",
  COMPLETED: "runtime.completed",
  ERROR: "runtime.error",
  BLOCKED: "runtime.blocked",
} as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[keyof typeof RUNTIME_EVENT_TYPES];

/**
 * Why a provider stopped a turn for safety reasons.
 *
 * `content_filter` is a provider content-moderation stop; `safety_policy` is a
 * runtime/product safety stop. Both mean the user request did not complete, so
 * preserve them as blocked terminals instead of ordinary completion.
 */
export const RUNTIME_BLOCKED_REASONS = {
  CONTENT_FILTER: "content_filter",
  SAFETY_POLICY: "safety_policy",
} as const;

export type RuntimeBlockedReason =
  (typeof RUNTIME_BLOCKED_REASONS)[keyof typeof RUNTIME_BLOCKED_REASONS];

/**
 * Runtime failure codes that callers can branch on.
 *
 * Specific SDK or provider error objects are not part of this contract.
 */
export const RUNTIME_ERROR_CODES = {
  PROVIDER_UNAVAILABLE: "provider_unavailable",
  MODEL_UNAVAILABLE: "model_unavailable",
  EXECUTOR_UNAVAILABLE: "executor_unavailable",
  TOOL_UNAVAILABLE: "tool_unavailable",
  TOOL_FAILED: "tool_failed",
  // A runtime tool and a host command declared the same name for one turn; the
  // request is rejected rather than silently letting one shadow the other.
  TOOL_CONFLICT: "tool_conflict",
  TIMEOUT: "timeout",
  ABORTED: "aborted",
  INTERNAL_ERROR: "internal_error",
} as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];

export const RUNTIME_FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  ABORTED: "aborted",
  // The tool loop hit its configured `maxToolSteps` while the model still wanted
  // to call tools. Distinct from `stop` so a capped (truncated) turn is
  // observable, never a silent normal completion.
  TOOL_STEP_LIMIT: "tool_step_limit",
} as const;

export type RuntimeFinishReason =
  (typeof RUNTIME_FINISH_REASONS)[keyof typeof RUNTIME_FINISH_REASONS];

/**
 * Fields every runtime event carries.
 *
 * `sequence` increases in emit order for one assistant turn.
 */
export type RuntimeEventBase = {
  readonly requestId: RequestId;
  readonly assistantTurnId: AssistantTurnId;
  readonly sequence: RuntimeSequence;
};

export type RuntimeStartedEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.STARTED;
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
};

export type RuntimeOutputDeltaEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.OUTPUT_DELTA;
  readonly content: string;
};

export type RuntimeActivityEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.ACTIVITY;
  readonly activityId: RuntimeActivityId;
  readonly activityKind: RuntimeActivityKind;
  readonly status: RuntimeActivityStatus;
  readonly title: string;
  readonly body?: string | undefined;
  readonly details?: RuntimeActivityDetails | undefined;
};

export type RuntimeCompletedEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.COMPLETED;
  readonly finishReason: RuntimeFinishReason;
  readonly usage?: RuntimeUsage | undefined;
};

export type RuntimeErrorEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.ERROR;
  readonly code: RuntimeErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

/**
 * Safety stop terminal: the request did not complete because it was filtered.
 *
 * `publicMessage` is already browser-safe; this event hides the raw provider
 * reason inside the runtime/provider package.
 */
export type RuntimeBlockedEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.BLOCKED;
  readonly reason: RuntimeBlockedReason;
  readonly publicMessage: string;
};

export type RuntimeEvent =
  | RuntimeStartedEvent
  | RuntimeOutputDeltaEvent
  | RuntimeActivityEvent
  | RuntimeCompletedEvent
  | RuntimeErrorEvent
  | RuntimeBlockedEvent;

export type RuntimeTerminalEvent = RuntimeCompletedEvent | RuntimeErrorEvent | RuntimeBlockedEvent;

export type RuntimeUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

/**
 * Expected runtime failures use the same code set as runtime error events.
 *
 * Invariant: Effect failures and streamed `runtime.error` payloads stay aligned
 * without leaking provider-specific error classes over package boundaries.
 */
export class AiRuntimeError extends Error {
  readonly code: RuntimeErrorCode;

  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "AiRuntimeError";
    this.code = code;
  }
}

/**
 * Stream of runtime events produced by an executor.
 *
 * Failures use AiRuntimeError; thrown SDK/tool values should be converted
 * before they reach callers.
 */
export type AiRuntimeEventStream = Stream.Stream<RuntimeEvent, AiRuntimeError>;

export type AiRuntimePort = {
  readonly streamEffect: (request: AiRuntimeRequest) => AiRuntimeEventStream;
};

/**
 * Terminal detection is shared by tests and callers that need to close streams.
 *
 * Completion, error, and blocked are terminal; activity and output deltas are not.
 */
export const isRuntimeTerminalEvent = (event: RuntimeEvent): event is RuntimeTerminalEvent =>
  event.type === RUNTIME_EVENT_TYPES.COMPLETED ||
  event.type === RUNTIME_EVENT_TYPES.ERROR ||
  event.type === RUNTIME_EVENT_TYPES.BLOCKED;
