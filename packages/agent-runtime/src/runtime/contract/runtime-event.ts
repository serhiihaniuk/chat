import type { ActivityDetails, ActivityKind, ActivityStatus } from "@side-chat/chat-protocol";

export const RUNTIME_EVENT_TYPES = {
  STARTED: "runtime.started",
  OUTPUT_DELTA: "runtime.output_delta",
  ACTIVITY: "runtime.activity",
  COMPLETED: "runtime.completed",
  ERROR: "runtime.error",
} as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[keyof typeof RUNTIME_EVENT_TYPES];

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
 * RuntimeEvent is the provider-neutral output boundary.
 *
 * Source AI SDK stream parts and provider-native chunks are normalized into this union
 * before anything leaves packages/agent-runtime.
 */
export type RuntimeEventBase = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
};

export type RuntimeStartedEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.STARTED;
  readonly providerId: string;
  readonly modelId: string;
};

export type RuntimeOutputDeltaEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.OUTPUT_DELTA;
  readonly content: string;
};

export type RuntimeActivityEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.ACTIVITY;
  readonly activityId: string;
  readonly activityKind: ActivityKind;
  readonly status: ActivityStatus;
  readonly title: string;
  readonly body?: string;
  readonly details?: ActivityDetails;
};

export type RuntimeCompletedEvent = RuntimeEventBase & {
  readonly type: typeof RUNTIME_EVENT_TYPES.COMPLETED;
  readonly finishReason: RuntimeFinishReason;
  readonly usage?: RuntimeUsage;
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
 * Terminal detection is shared by tests and callers that need to close streams.
 *
 * Completion and error are both terminal; activity and output deltas are not.
 */
export const isRuntimeTerminalEvent = (event: RuntimeEvent): event is RuntimeTerminalEvent =>
  event.type === RUNTIME_EVENT_TYPES.COMPLETED || event.type === RUNTIME_EVENT_TYPES.ERROR;
