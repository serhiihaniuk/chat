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
  BLOCKED: "sidechat.blocked",
} as const;

export type SidechatEventType = (typeof SIDECHAT_EVENT_TYPES)[keyof typeof SIDECHAT_EVENT_TYPES];

/**
 * Why a turn ended in a safety stop instead of an answer.
 *
 * `content_filter` is a provider moderation stop; `safety_policy` is a
 * product/runtime safety stop. The browser shows `publicMessage`; it never
 * receives the raw provider reason.
 */
export const SIDECHAT_BLOCKED_REASONS = {
  CONTENT_FILTER: "content_filter",
  SAFETY_POLICY: "safety_policy",
} as const;

export type SidechatBlockedReason =
  (typeof SIDECHAT_BLOCKED_REASONS)[keyof typeof SIDECHAT_BLOCKED_REASONS];

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

/**
 * Safety-stop terminal: the turn was blocked before a usable answer completed.
 *
 * This is deliberately distinct from `sidechat.completed` so a filtered turn is
 * never rendered or persisted as a finished response.
 */
export type BlockedEvent = SidechatEventBase & {
  readonly type: typeof SIDECHAT_EVENT_TYPES.BLOCKED;
  readonly reason: SidechatBlockedReason;
  readonly publicMessage: string;
};

export const HISTORY_MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const;

export type HistoryMessageRole = (typeof HISTORY_MESSAGE_ROLES)[keyof typeof HISTORY_MESSAGE_ROLES];

/**
 * One stored transcript message, as returned by the conversation history
 * read-path (`readHistory` / `ReadHistoryResult`). This is a request/response
 * shape, not a stream event: no server emits it over the turn stream.
 *
 * `activity` is the turn's stored activity events (reasoning summaries, tool
 * calls, host commands) replayed verbatim, present on assistant messages only
 * when the service persists turn activity (`turnActivityHistory: "full"`). A
 * client folds them with the same reducer it uses for the live stream, so a
 * reloaded transcript shows the thinking the user watched live.
 */
export type HistoryMessage = {
  readonly id: MessageId;
  readonly role: HistoryMessageRole;
  readonly content: string;
  readonly sequence: ProtocolSequence;
  readonly activity?: readonly ActivityEvent[];
};

export type UsageMetadata = {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
};

export type TerminalEvent = CompletedEvent | ErrorEvent | BlockedEvent;
/**
 * All event shapes a browser client can receive for one Side Chat stream.
 */
export type SidechatStreamEvent =
  | StartedEvent
  | DeltaEvent
  | ActivityEvent
  | CompletedEvent
  | ErrorEvent
  | BlockedEvent;

/**
 * Tell whether this event closes the stream.
 *
 * After completed/error/blocked, another event in the same sequence is malformed.
 */
export const isTerminalEvent = (event: SidechatStreamEvent): event is TerminalEvent =>
  event.type === SIDECHAT_EVENT_TYPES.COMPLETED ||
  event.type === SIDECHAT_EVENT_TYPES.ERROR ||
  event.type === SIDECHAT_EVENT_TYPES.BLOCKED;
