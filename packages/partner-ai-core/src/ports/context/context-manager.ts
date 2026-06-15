import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { Effect } from "effect";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type {
  HostCapabilityManifest,
  PreparedTurnContext,
  TurnPolicyDecision,
} from "#domain/capabilities";
import type { ConversationRef, MessageRef } from "../lifecycle/conversation.js";

export type ContextManagerPort = {
  readonly prepareTurnContext: (input: {
    readonly authContext: AuthContext;
    readonly workspace: WorkspaceRef;
    readonly conversation: ConversationRef;
    readonly currentUserMessage: MessageRef;
    readonly request: ChatStreamRequest;
    readonly manifest: HostCapabilityManifest;
    readonly policyDecision: TurnPolicyDecision;
    readonly now: string;
    readonly abortSignal?: AbortSignal;
  }) => Effect.Effect<PreparedTurnContext, unknown>;
};
