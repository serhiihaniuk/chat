import type { ActivityDetails, ActivityKind, ActivityStatus } from "@side-chat/chat-protocol";

/**
 * RuntimeEvent is the provider-neutral output boundary.
 *
 * AI SDK stream parts and provider-native chunks are normalized into this union
 * before anything leaves packages/agent-runtime.
 */
export type RuntimeEventBase = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
};

export type RuntimeStartedEvent = RuntimeEventBase & {
  readonly type: "runtime.started";
  readonly providerId: string;
  readonly modelId: string;
};

export type RuntimeOutputDeltaEvent = RuntimeEventBase & {
  readonly type: "runtime.output_delta";
  readonly content: string;
};

export type RuntimeActivityEvent = RuntimeEventBase & {
  readonly type: "runtime.activity";
  readonly activityId: string;
  readonly activityKind: ActivityKind;
  readonly status: ActivityStatus;
  readonly title: string;
  readonly body?: string;
  readonly details?: ActivityDetails;
};

export type RuntimeCompletedEvent = RuntimeEventBase & {
  readonly type: "runtime.completed";
  readonly finishReason: "stop" | "length" | "aborted";
  readonly usage?: RuntimeUsage;
};

export type RuntimeErrorEvent = RuntimeEventBase & {
  readonly type: "runtime.error";
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

export type RuntimeErrorCode =
  | "provider_unavailable"
  | "model_unavailable"
  | "tool_unavailable"
  | "tool_failed"
  | "timeout"
  | "aborted"
  | "internal_error";

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
  event.type === "runtime.completed" || event.type === "runtime.error";
