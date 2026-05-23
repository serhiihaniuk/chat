import type { ProtocolErrorCode } from "../errors.js";
import type { JsonObject, ProtocolEnvelope } from "../primitives.js";

export const SIDECHAT_EVENT_TYPES = {
  started: "sidechat.started",
  delta: "sidechat.delta",
  reasoning: "sidechat.reasoning",
  tool: "sidechat.tool",
  hostCommand: "sidechat.host_command",
  completed: "sidechat.completed",
  error: "sidechat.error",
  history: "sidechat.history",
} as const;

export type SidechatEventType =
  (typeof SIDECHAT_EVENT_TYPES)[keyof typeof SIDECHAT_EVENT_TYPES];

export type SidechatEventBase = ProtocolEnvelope & {
  readonly type: SidechatEventType;
  readonly eventId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
  readonly createdAt: string;
};

export type StartedEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.started;
  readonly conversationId?: string;
};

export type DeltaEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.delta;
  readonly content: string;
};

export type ReasoningEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.reasoning;
  readonly summary: string;
};

export type ToolEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.tool;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly status: "started" | "completed" | "failed";
  readonly result?: JsonObject;
  readonly errorCode?: ProtocolErrorCode;
};

export type HostCommandEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.hostCommand;
  readonly commandId: string;
  readonly commandName: string;
  readonly payload: JsonObject;
};

export type CompletedEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.completed;
  readonly finishReason: "stop" | "length" | "aborted";
  readonly usage?: UsageMetadata;
};

export type ErrorEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.error;
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

export type HistoryEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.history;
  readonly messages: readonly HistoryMessage[];
};

export type HistoryMessage = {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly sequence: number;
};

export type UsageMetadata = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type TerminalEvent = CompletedEvent | ErrorEvent;
export type SidechatStreamEvent =
  | StartedEvent
  | DeltaEvent
  | ReasoningEvent
  | ToolEvent
  | HostCommandEvent
  | CompletedEvent
  | ErrorEvent
  | HistoryEvent;

export const isTerminalEvent = (
  event: SidechatStreamEvent,
): event is TerminalEvent =>
  event.type === SIDECHAT_EVENT_TYPES.completed ||
  event.type === SIDECHAT_EVENT_TYPES.error;
