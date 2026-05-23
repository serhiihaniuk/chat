import type {
  AuthContext,
  ObservabilitySinkPort,
  PolicyPort,
  WorkspaceRef,
} from "@side-chat/partner-ai-core";
import type { SidechatRepositories } from "@side-chat/db";

export const DEFAULT_PROVIDER_ID = "fake";
export const DEFAULT_MODEL_ID = "fake-echo";

export type RouteDependencies = {
  readonly workspace: WorkspaceRef;
  readonly repositories: SidechatRepositories;
  readonly policies: PolicyPort;
  readonly observability?: ObservabilitySinkPort;
};

export const requireContextAuth = (authContext: AuthContext | undefined) => {
  if (!authContext) {
    throw new Error("Protected route reached without AuthContext.");
  }
  return authContext;
};
