import type { Stream } from "effect";
import { brandNumber, brandString, type Brand, type JsonObject } from "@side-chat/shared";

/**
 * Provider-neutral runtime boundary shared by product core and runtime engines.
 *
 * Product core sends one final model request through `AiRuntimePort`; runtime
 * implementations emit normalized RuntimeEvents and keep provider-native parts,
 * executable tools, and AI SDK details behind their own package boundary.
 * Update this file when the core-to-runtime contract changes, not when a
 * specific provider or executor changes internally.
 */

export type RequestId = Brand<string, "RequestId">;
export type AssistantTurnId = Brand<string, "AssistantTurnId">;
export type HostAppId = Brand<string, "HostAppId">;
export type WorkspaceId = Brand<string, "WorkspaceId">;
export type SubjectId = Brand<string, "SubjectId">;
export type ConversationId = Brand<string, "ConversationId">;
export type ExecutorId = Brand<string, "ExecutorId">;
export type ProviderId = Brand<string, "ProviderId">;
export type ModelId = Brand<string, "ModelId">;
export type RuntimeActivityId = Brand<string, "RuntimeActivityId">;
export type ToolCallId = Brand<string, "ToolCallId">;
export type RuntimeSequence = Brand<number, "RuntimeSequence">;

export const toRequestId = (value: string): RequestId => brandString<"RequestId">(value);
export const toAssistantTurnId = (value: string): AssistantTurnId =>
  brandString<"AssistantTurnId">(value);
export const toHostAppId = (value: string): HostAppId => brandString<"HostAppId">(value);
export const toWorkspaceId = (value: string): WorkspaceId => brandString<"WorkspaceId">(value);
export const toSubjectId = (value: string): SubjectId => brandString<"SubjectId">(value);
export const toConversationId = (value: string): ConversationId =>
  brandString<"ConversationId">(value);
export const toExecutorId = (value: string): ExecutorId => brandString<"ExecutorId">(value);
export const toProviderId = (value: string): ProviderId => brandString<"ProviderId">(value);
export const toModelId = (value: string): ModelId => brandString<"ModelId">(value);
export const toRuntimeActivityId = (value: string): RuntimeActivityId =>
  brandString<"RuntimeActivityId">(value);
export const toToolCallId = (value: string): ToolCallId => brandString<"ToolCallId">(value);
export const toRuntimeSequence = (value: number): RuntimeSequence =>
  brandNumber<"RuntimeSequence">(value);

export type AiRuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
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
  readonly allowedHostCommandNames?: readonly string[] | undefined;
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
  readonly messages: readonly AiRuntimeMessage[];
  readonly toolNames: readonly string[];
  readonly toolScope: AiToolScope;
  readonly abortSignal?: AbortSignal | undefined;
};

export const RUNTIME_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
} as const;

export type RuntimeActivityKind =
  (typeof RUNTIME_ACTIVITY_KINDS)[keyof typeof RUNTIME_ACTIVITY_KINDS];

/**
 * Statuses for one visible runtime activity row.
 *
 * The same `activityId` may move from running to completed or failed. That
 * means "update this row", not "render a new assistant message".
 */
export const RUNTIME_ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type RuntimeActivityStatus =
  (typeof RUNTIME_ACTIVITY_STATUSES)[keyof typeof RUNTIME_ACTIVITY_STATUSES];

export type RuntimeActivitySource = {
  readonly label: string;
  readonly url?: string | undefined;
};

export type RuntimeActivityImage = {
  readonly alt: string;
  readonly caption?: string | undefined;
  readonly mediaType: string;
  readonly data: string;
};

/**
 * Visible state for one tool call.
 *
 * `toolCallId` is the row identity while input, result, or error information
 * arrives. Tool exceptions are reduced to `errorCode`; callers should not
 * expect a thrown value here.
 */
export type RuntimeActivityToolDetails = {
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly input?: JsonObject | undefined;
  readonly result?: JsonObject | undefined;
  readonly sources?: readonly RuntimeActivitySource[] | undefined;
  readonly errorCode?: string | undefined;
};

/**
 * Optional details attached to an activity row.
 *
 * Tool input and result stay with the activity that produced them. They do not
 * become separate chat messages.
 */
export type RuntimeActivityDetails = {
  readonly sources?: readonly RuntimeActivitySource[] | undefined;
  readonly images?: readonly RuntimeActivityImage[] | undefined;
  readonly tool?: RuntimeActivityToolDetails | undefined;
};

export const RUNTIME_EVENT_TYPES = {
  STARTED: "runtime.started",
  OUTPUT_DELTA: "runtime.output_delta",
  ACTIVITY: "runtime.activity",
  COMPLETED: "runtime.completed",
  ERROR: "runtime.error",
} as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[keyof typeof RUNTIME_EVENT_TYPES];

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
  TIMEOUT: "timeout",
  ABORTED: "aborted",
  INTERNAL_ERROR: "internal_error",
} as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[keyof typeof RUNTIME_ERROR_CODES];

export const RUNTIME_FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  ABORTED: "aborted",
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

export type RuntimeEvent =
  | RuntimeStartedEvent
  | RuntimeOutputDeltaEvent
  | RuntimeActivityEvent
  | RuntimeCompletedEvent
  | RuntimeErrorEvent;

export type RuntimeTerminalEvent = RuntimeCompletedEvent | RuntimeErrorEvent;

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
 * Completion and error are both terminal; activity and output deltas are not.
 */
export const isRuntimeTerminalEvent = (event: RuntimeEvent): event is RuntimeTerminalEvent =>
  event.type === RUNTIME_EVENT_TYPES.COMPLETED || event.type === RUNTIME_EVENT_TYPES.ERROR;
