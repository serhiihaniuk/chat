import type {
  AuthContext,
  AgentRuntimePort,
  ContextManagerPort,
  HostCapabilityManifestPort,
  ObservabilitySinkPort,
  PolicyPort,
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
  readonly contextManager: ContextManagerPort;
  readonly runtime: AgentRuntimePort;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const requireContextAuth = (authContext: AuthContext | undefined) => {
  if (!authContext) {
    throw new Error("Protected route reached without AuthContext.");
  }
  return authContext;
};
