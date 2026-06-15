import type {
  AuthContext,
  AgentRuntimePort,
  ContextManagerPort,
  ConversationTitleGenerationPort,
  HostCapabilityManifestPort,
  MemoryPort,
  ObservabilitySinkPort,
  PolicyPort,
  TurnGuardRegistryPort,
  TurnPolicyResolverPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";

export type RouteDependencies = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly repositories: SidechatRepositories;
  readonly hostCapabilities: HostCapabilityManifestPort;
  readonly turnPolicies: TurnPolicyResolverPort;
  readonly turnGuards: TurnGuardRegistryPort;
  readonly contextManager: ContextManagerPort;
  readonly memory: MemoryPort;
  readonly runtime: AgentRuntimePort;
  readonly conversationTitleGeneration: ConversationTitleGenerationPort;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort | undefined;
};

export const requireContextAuth = (authContext: AuthContext | undefined) => {
  if (!authContext) {
    throw new Error("Protected route reached without AuthContext.");
  }
  return authContext;
};
