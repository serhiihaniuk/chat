import type {
  ActivityDetails,
  ActivityKind,
  ActivityStatus,
  ChatRequestMessage,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import type { Effect, Stream } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";

/**
 * Ports are the core package's dependencies, not implementations.
 *
 * `partner-ai-core` owns the assistant workflow, but the app owns databases,
 * runtime providers, tools, clocks, ids, policies, and telemetry. Each port
 * describes the smallest capability the workflow needs from those systems.
 */
export type ClockPort = {
  readonly now: () => string;
};

export type IdGeneratorPort = {
  readonly nextConversationId: () => string;
  readonly nextAssistantTurnId: () => string;
  readonly nextEventId: () => string;
};

export type ConversationRef = WorkspaceRef & {
  readonly conversationId: string;
};

export type ConversationRepositoryPort = {
  readonly ensureConversation: (input: {
    readonly authContext: AuthContext;
    readonly requestedConversationId?: string;
    readonly fallbackConversationId: string;
  }) => Effect.Effect<ConversationRef, unknown>;
  readonly appendUserMessage: (input: {
    readonly authContext: AuthContext;
    readonly conversationId: string;
    readonly message: ChatRequestMessage;
  }) => Effect.Effect<void, unknown>;
};

export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

export type RuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly messages: readonly RuntimeMessage[];
};

export type RuntimeEventBase = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
};

/**
 * Runtime event names are the boundary between agent-runtime and core.
 *
 * The AI SDK can emit many provider-specific stream parts. Core only accepts
 * this smaller union so protocol mapping, persistence, and UI behavior never
 * depend on provider-native names.
 */
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
  readonly usage?: UsageMetadata;
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

/**
 * AgentRuntimePort is the only model/runtime capability core knows about.
 *
 * `streamEffect` is the native path because AI turns are long-running streams
 * that can fail, be cancelled, or be observed. Transport adapters may convert
 * the stream at the edge, but core ports stay Effect-native.
 */
export type AgentRuntimePort = {
  readonly streamEffect: (request: RuntimeRequest) => Stream.Stream<RuntimeEvent, unknown>;
};
