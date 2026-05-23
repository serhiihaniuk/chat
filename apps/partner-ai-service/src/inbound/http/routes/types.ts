import type {
  AuthContext,
  AgentRuntimePort,
  ObservabilitySinkPort,
  PolicyPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";

export type RouteDependencies = {
  readonly workspace: WorkspaceRef;
  readonly repositories: SidechatRepositories;
  readonly runtime: AgentRuntimePort;
  readonly providerId: string;
  readonly modelId: string;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const requireContextAuth = (authContext: AuthContext | undefined) => {
  if (!authContext) {
    throw new Error("Protected route reached without AuthContext.");
  }
  return authContext;
};
