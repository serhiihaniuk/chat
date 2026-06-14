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
