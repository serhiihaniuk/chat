import type { ProtocolErrorCode } from "../errors.js";
import type {
  ActivityId,
  AssistantTurnId,
  ConversationId,
  EventId,
  HostCommandId,
  JsonObject,
  MessageId,
  ProtocolEnvelope,
  ProtocolSequence,
  ToolCallId,
} from "../primitives.js";

export const SIDECHAT_EVENT_TYPES = {
  STARTED: "sidechat.started",
  DELTA: "sidechat.delta",
  ACTIVITY: "sidechat.activity",
  COMPLETED: "sidechat.completed",
  ERROR: "sidechat.error",
  HISTORY: "sidechat.history",
} as const;

export type SidechatEventType = (typeof SIDECHAT_EVENT_TYPES)[keyof typeof SIDECHAT_EVENT_TYPES];

export const ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
  HOST_COMMAND: "host_command",
} as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[keyof typeof ACTIVITY_KINDS];

export const ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type ActivityStatus = (typeof ACTIVITY_STATUSES)[keyof typeof ACTIVITY_STATUSES];

export type SidechatEventBase = ProtocolEnvelope & {
  readonly type: SidechatEventType;
  readonly eventId: EventId;
  readonly assistantTurnId: AssistantTurnId;
  readonly sequence: ProtocolSequence;
  readonly createdAt: string;
};

export type StartedEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.STARTED;
  readonly conversationId?: ConversationId;
};

export type DeltaEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.DELTA;
  readonly content: string;
};

export type ActivitySource = {
  readonly label: string;
  readonly url?: string;
};

export type ActivityImage = {
  readonly alt: string;
  readonly caption?: string;
  readonly mediaType: string;
  readonly data: string;
};

export type ActivityToolDetails = {
  readonly toolCallId: ToolCallId;
  readonly toolName: string;
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly sources?: readonly ActivitySource[];
  readonly errorCode?: ProtocolErrorCode;
};

export type ActivityHostCommandDetails = {
  readonly commandId: HostCommandId;
  readonly commandName: string;
  readonly payload: JsonObject;
  readonly result?: JsonObject;
};

export type ActivityDetails = {
  readonly sources?: readonly ActivitySource[];
  readonly images?: readonly ActivityImage[];
  readonly tool?: ActivityToolDetails;
  readonly hostCommand?: ActivityHostCommandDetails;
};

export type ActivityEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.ACTIVITY;
  readonly activityId: ActivityId;
  readonly activityKind: ActivityKind;
  readonly status: ActivityStatus;
  readonly title: string;
  readonly body?: string;
  readonly details?: ActivityDetails;
};

export type CompletedEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.COMPLETED;
  readonly finishReason: "stop" | "length" | "aborted";
  readonly usage?: UsageMetadata;
};

export type ErrorEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.ERROR;
  readonly code: ProtocolErrorCode;
  readonly message: string;
  readonly retryable: boolean;
};

export type HistoryEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.HISTORY;
  readonly messages: readonly HistoryMessage[];
};

export type HistoryMessage = {
  readonly id: MessageId;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly sequence: ProtocolSequence;
};

export type UsageMetadata = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type TerminalEvent = CompletedEvent | ErrorEvent;
/**
 * All event shapes a browser client can receive for one Side Chat stream.
 */
export type SidechatStreamEvent =
  | StartedEvent
  | DeltaEvent
  | ActivityEvent
  | CompletedEvent
  | ErrorEvent
  | HistoryEvent;

/**
 * Tell whether this event closes the stream.
 *
 * After completed/error, another event in the same sequence is malformed.
 */
export const isTerminalEvent = (event: SidechatStreamEvent): event is TerminalEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED || event.type === SIDECHAT_EVENT_TYPES.ERROR;
