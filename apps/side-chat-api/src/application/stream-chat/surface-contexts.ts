import type { SidechatRequest } from "@side-chat/shared-protocol";
import type { PageContextPort } from "#ports/index.js";
import type { StreamChatDeps } from "../stream-chat.js";

const surfaceContextLimit = 12;
const maxSurfaceContextResources = 4;

const shouldResolveSurfaceResource = (kind: string) =>
  kind === "grid" || kind === "table" || kind === "custom";

/**
 * Resolves host-visible resources, such as the Portfolio Worklist table, into
 * bounded model context before the model stream starts.
 */
export const resolveSurfaceContexts = async (
  deps: StreamChatDeps,
  request: SidechatRequest,
  userId: string,
  conversationId: string,
  pageContext: Awaited<ReturnType<PageContextPort["resolve"]>>,
) => {
  const workbenchTools = deps.workbenchTools;
  if (!workbenchTools?.surfaceContext) return undefined;

  const resources = (request.hostContext?.resources ?? [])
    .filter((resource) => shouldResolveSurfaceResource(resource.kind))
    .slice(0, maxSurfaceContextResources);

  return Promise.all(
    resources.map((resource) =>
      workbenchTools.surfaceContext!({
        workspaceId: request.workspaceId,
        userId,
        conversationId,
        pageContext,
        resourceId: resource.id,
        limit: surfaceContextLimit,
      }),
    ),
  );
};
