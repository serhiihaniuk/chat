import type { ChatStreamRequest } from "@side-chat/chat-protocol";
import type { AuthContext, WorkspaceRef } from "#domain/authority";
import type { PreparedTurnContext, TurnPolicyDecision } from "#domain/capabilities-contract";
import type {
  AiRuntimePort,
  AssistantTurnLifecyclePort,
  AssistantTurnRef,
  ClockPort,
  ConversationTitleGenerationPort,
  ContextManagerPort,
  ConversationRef,
  ConversationRepositoryPort,
  HostCapabilityManifestPort,
  IdGeneratorPort,
  MessageRef,
  TurnEventLogPort,
  TurnGuardDecision,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
} from "#ports";
import type { PolicyPort } from "#policies/policy";
import type { ObservabilitySinkPort, RequestCorrelation } from "#services/observability";

/**
 * Input for one assistant turn.
 *
 * The HTTP app parses `ChatStreamRequest` and attaches `AuthContext` when
 * available. Core checks authority before using context, persistence, or model
 * execution; host context inside the request is page data only.
 */
export type StreamChatInput = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly request: ChatStreamRequest;
  readonly authContext: AuthContext | undefined;
  readonly traceId?: string | undefined;
};

/**
 * Ports needed by the stream-chat workflow.
 *
 * Composition binds these to real adapters and passes one plain `StreamChatPorts`
 * object into the pre-start and runner entrypoints — there is no Effect Layer or
 * service registry between the app and core. Keeping this type small makes it
 * obvious which outside systems the stream-chat workflow can touch, and keeps the
 * wiring readable for non-Effect adopters.
 */
export type StreamChatPorts = {
  readonly conversations: ConversationRepositoryPort;
  readonly assistantTurns: AssistantTurnLifecyclePort;
  readonly turnEventLog: TurnEventLogPort;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly runtime: AiRuntimePort;
  readonly conversationTitleGeneration: ConversationTitleGenerationPort;
  readonly clock: ClockPort;
  readonly ids: IdGeneratorPort;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort | undefined;
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
