import type { ChatStreamRequest, ProtocolErrorCode, UsageMetadata } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { PreparedTurnContext } from "#domain/capabilities";
import type { ConversationRef, MessageRef } from "./conversation.js";

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

/**
 * Store the lifecycle of one assistant reply.
 *
 * Start it, save the prepared context, then write either completed or failed.
 */
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
    readonly usage?: UsageMetadata | undefined;
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
  /**
   * Read the control state finalize needs to terminalize a turn honestly.
   *
   * `status` is the durable turn status (so the abnormal finalizer can skip the
   * status write once a real terminal already won the running-guard), and
   * `cancelRequested` reflects the durable cancel intent (so an interrupt is
   * classified as a user abort only when a cancel was actually requested).
   * Returns `undefined` for an unknown or cross-workspace turn.
   */
  readonly readTurnControlState: (input: {
    readonly authContext: AuthContext;
    readonly assistantTurnId: string;
  }) => Effect.Effect<TurnControlState | undefined, unknown>;
};

/** Durable control facts an abnormal finalize reads to terminalize honestly. */
export type TurnControlState = {
  readonly status: AssistantTurnStatus;
  readonly cancelRequested: boolean;
};
