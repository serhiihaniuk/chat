import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { PreparedTurnContext, TurnPolicyDecision } from "#domain/harness";
import type {
  AgentRuntimePort,
  AssistantTurnLifecyclePort,
  AssistantTurnRef,
  ClockPort,
  ContextManagerPort,
  ConversationRef,
  ConversationRepositoryPort,
  HostCapabilityManifestPort,
  IdGeneratorPort,
  MemoryPort,
  MessageRef,
  TurnGuardDecision,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
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
  readonly hostAppId: string;
  readonly request: ChatStreamRequest;
  readonly authContext: AuthContext | undefined;
  readonly traceId?: string;
  readonly abortSignal?: AbortSignal;
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
  readonly assistantTurns: AssistantTurnLifecyclePort;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly memory: MemoryPort;
  readonly runtime: AgentRuntimePort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies: PolicyPort;
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
  readonly userMessage: MessageRef;
  readonly assistantTurn: AssistantTurnRef;
  readonly assistantTurnId: string;
  readonly manifestHash: string;
  readonly policyDecision: TurnPolicyDecision;
  readonly turnGuardDecisions: readonly TurnGuardDecision[];
  readonly preparedContext: PreparedTurnContext;
};
