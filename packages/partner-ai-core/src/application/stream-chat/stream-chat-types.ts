import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type {
  AgentRuntimePort,
  ClockPort,
  ConversationRef,
  ConversationRepositoryPort,
  IdGeneratorPort,
} from "#ports";
import type { PolicyPort } from "#policies/policy";
import type { ObservabilitySinkPort, RequestCorrelation } from "#services/observability";

/**
 * Input for one assistant turn.
 *
 * The HTTP app parses `ChatStreamRequest` and supplies trusted `AuthContext`.
 * Core treats host context inside the request as product data only; it does not
 * use it to establish tenant, workspace, or user authority.
 */
export type StreamChatInput = {
  readonly workspace: WorkspaceRef;
  readonly request: ChatStreamRequest;
  readonly authContext: AuthContext | undefined;
  readonly providerId: string;
  readonly modelId: string;
  readonly traceId?: string;
};

/**
 * Ports needed by the stream-chat workflow.
 *
 * The native `streamChatEffect` entrypoint reads the same capabilities from an
 * Effect Layer. Keeping this type small makes it obvious which outside systems
 * the stream-chat workflow can touch.
 */
export type StreamChatPorts = {
  readonly conversations: ConversationRepositoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies?: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

/**
 * State created before the protocol stream opens.
 *
 * Everything here is known before `sidechat.started` is emitted, so failures in
 * this phase can still become request-level HTTP errors instead of partial SSE
 * streams.
 */
export type PreparedStreamChatTurn = {
  readonly authContext: AuthContext;
  readonly correlation: RequestCorrelation;
  readonly startedAt: string;
  readonly conversation: ConversationRef;
  readonly assistantTurnId: string;
};
