import type { AuthContext, StreamChatPorts, WorkspaceRef } from "@side-chat/partner-ai-core";

/**
 * Everything the chat-stream route needs to reach core.
 *
 * The route receives the fully wired `StreamChatPorts` from composition plus the
 * request envelope (workspace and host app id). It never rebuilds policy,
 * storage, or runtime wiring.
 */
export type RouteDependencies = {
  readonly workspace: WorkspaceRef;
  readonly hostAppId: string;
  readonly ports: StreamChatPorts;
};

export const requireContextAuth = (authContext: AuthContext | undefined) => {
  if (!authContext) {
    throw new Error("Protected route reached without AuthContext.");
  }
  return authContext;
};
