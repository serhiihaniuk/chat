import type { JsonObject } from "@side-chat/chat-protocol";

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

export type RuntimeReasoningEvent = RuntimeEventBase & {
  readonly type: "runtime.reasoning";
  readonly summary: string;
};

export type RuntimeToolCallEvent = RuntimeEventBase & {
  readonly type: "runtime.tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly argumentsJson: JsonObject;
};

export type RuntimeToolResultEvent = RuntimeEventBase & {
  readonly type: "runtime.tool_result";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "completed" | "failed";
  readonly resultJson?: JsonObject;
  readonly errorCode?: RuntimeErrorCode;
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
  | RuntimeReasoningEvent
  | RuntimeToolCallEvent
  | RuntimeToolResultEvent
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

export const isRuntimeTerminalEvent = (
  event: RuntimeEvent,
): event is RuntimeTerminalEvent =>
  event.type === "runtime.completed" || event.type === "runtime.error";
