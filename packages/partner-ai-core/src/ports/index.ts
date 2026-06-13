import type {
  ActivityDetails,
  ActivityKind,
  ActivityStatus,
  ChatStreamRequest,
  ChatRequestMessage,
  ProtocolErrorCode,
  UsageMetadata,
} from "@side-chat/chat-protocol";
import type { Effect, Stream } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type {
  HostCapabilityManifest,
  PreparedContextBoard,
  PreparedTurnContext,
  TurnPolicyDecision,
} from "#domain/harness";

export type * from "./turn-guard.js";
export type * from "./rag-retriever.js";
export type * from "./memory-port.js";

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
  readonly nextEventId: () => string;
};

export type ConversationRef = WorkspaceRef & {
  readonly conversationId: string;
};

export type MessageRef = WorkspaceRef & {
  readonly conversationId: string;
  readonly messageId: string;
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
  }) => Effect.Effect<MessageRef, unknown>;
};

export type AssistantTurnFailureStatus =
  | "user_aborted"
  | "timed_out"
  | "provider_failed"
  | "tool_failed"
  | "persistence_failed";

export type AssistantTurnStatus = "running" | "completed" | AssistantTurnFailureStatus;

export type AssistantTurnRef = WorkspaceRef & {
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly status: AssistantTurnStatus;
  readonly inserted: boolean;
};

export type AssistantTurnLifecyclePort = {
  readonly startAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly conversation: ConversationRef;
    readonly userMessage: MessageRef;
    readonly request: ChatStreamRequest;
    readonly profileId: string;
    readonly profileVersion: string;
    readonly systemPromptId: string;
    readonly manifestHash: string;
    readonly providerId: string;
    readonly modelId: string;
    readonly now: string;
  }) => Effect.Effect<AssistantTurnRef, unknown>;
  readonly recordContextSnapshot: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly preparedContext: PreparedTurnContext;
    readonly hostContext: ChatStreamRequest["hostContext"];
    readonly manifestHash: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
  readonly completeAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly conversation: ConversationRef;
    readonly request: ChatStreamRequest;
    readonly assistantTurnId: string;
    readonly assistantContent: string;
    readonly finishReason: string;
    readonly usage?: UsageMetadata;
    readonly providerId: string;
    readonly modelId: string;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
  readonly failAssistantTurn: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
    readonly status: AssistantTurnFailureStatus;
    readonly errorCode: ProtocolErrorCode;
    readonly now: string;
  }) => Effect.Effect<void, unknown>;
};

export type HostCapabilityManifestPort = {
  readonly loadManifest: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly hostAppId: string;
  }) => Effect.Effect<HostCapabilityManifest, unknown>;
};

export type TurnPolicyResolverPort = {
  readonly resolveTurnPolicy: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly request: ChatStreamRequest;
    readonly manifest: HostCapabilityManifest;
    readonly manifestHash: string;
  }) => Effect.Effect<TurnPolicyDecision, unknown>;
};

export type ContextManagerPort = {
  readonly prepareTurnContext: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly conversation: ConversationRef;
    readonly request: ChatStreamRequest;
    readonly manifest: HostCapabilityManifest;
    readonly policyDecision: TurnPolicyDecision;
    readonly now: string;
    readonly abortSignal?: AbortSignal;
  }) => Effect.Effect<PreparedTurnContext, unknown>;
};

/**
 * One provider-neutral chat message core has approved for runtime execution.
 *
 * Invariant: it is intentionally plain text and role-only so provider-native message
 * parts, protocol DTOs, and UI concerns stay outside the core/runtime seam.
 */
export type RuntimeMessage = {
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
};

/**
 * Prepared per-turn request that core sends to the runtime.
 *
 * Core constructs these messages from the product request and prepared context.
 * The runtime may render profile/context system messages around them, but it
 * must not recover hidden host data or conversation history on its own.
 */
export type RuntimeRequest = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly executorId?: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly profileId: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard: PreparedContextBoard;
  readonly availableToolNames: readonly string[];
  readonly abortSignal?: AbortSignal;
};

export type RuntimeEventBase = {
  readonly requestId: string;
  readonly assistantTurnId: string;
  readonly sequence: number;
};

/**
 * Runtime event names are the boundary between agent-runtime and core.
 *
 * Source AI SDK can emit many provider-specific stream parts. Core only accepts
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
