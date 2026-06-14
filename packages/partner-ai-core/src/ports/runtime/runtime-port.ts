import type { JsonObject } from "@side-chat/shared";
import type { Stream } from "effect";
import type { PreparedContextBoard } from "#domain/capabilities";

/**
 * One provider-neutral chat message core has approved for runtime execution.
 *
 * Invariant: it is intentionally plain text and role-only so provider-native
 * message parts, protocol DTOs, and UI concerns stay outside the core/runtime
 * seam.
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
  readonly systemInstructions: string;
  readonly messages: readonly RuntimeMessage[];
  readonly contextBoard: PreparedContextBoard;
  readonly availableToolNames: readonly string[];
  readonly toolScope?: RuntimeToolScope;
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

export type RuntimeUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
};

export const RUNTIME_ACTIVITY_KINDS = {
  PROGRESS: "progress",
  REASONING: "reasoning",
  TOOL: "tool",
} as const;

export type RuntimeActivityKind =
  (typeof RUNTIME_ACTIVITY_KINDS)[keyof typeof RUNTIME_ACTIVITY_KINDS];

export const RUNTIME_ACTIVITY_STATUSES = {
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export type RuntimeActivityStatus =
  (typeof RUNTIME_ACTIVITY_STATUSES)[keyof typeof RUNTIME_ACTIVITY_STATUSES];

export type RuntimeActivitySource = {
  readonly label: string;
  readonly url?: string;
};

export type RuntimeActivityImage = {
  readonly alt: string;
  readonly caption?: string;
  readonly mediaType: string;
  readonly data: string;
};

export type RuntimeActivityToolDetails = {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input?: JsonObject;
  readonly result?: JsonObject;
  readonly sources?: readonly RuntimeActivitySource[];
  readonly errorCode?: string;
};

export type RuntimeActivityDetails = {
  readonly sources?: readonly RuntimeActivitySource[];
  readonly images?: readonly RuntimeActivityImage[];
  readonly tool?: RuntimeActivityToolDetails;
};

export type RuntimeToolScope = {
  readonly hostAppId: string;
  readonly workspaceId: string;
  readonly subjectId: string;
  readonly conversationId: string;
  readonly assistantTurnId: string;
  readonly profileId: string;
  readonly allowedHostCommandNames?: readonly string[];
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
  readonly activityKind: RuntimeActivityKind;
  readonly status: RuntimeActivityStatus;
  readonly title: string;
  readonly body?: string;
  readonly details?: RuntimeActivityDetails;
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
