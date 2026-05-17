import {
  validateHostCommand,
  type HostCommand,
  type SidechatRequest,
} from "@side-chat/shared-protocol";
import type { PageContextPort } from "#ports/index.js";
import type { StreamChatDeps } from "../stream-chat.js";
import { isUnknownRecord } from "../../shared/unknown-record.js";

const surfaceContextLimit = 12;
const maxSurfaceContextResources = 4;

const shouldResolveSurfaceResource = (kind: string) =>
  kind === "grid" || kind === "table";

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

  await synchronizeFreshHostSurfaceState(deps, request, userId, conversationId);

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

const synchronizeFreshHostSurfaceState = async (
  deps: StreamChatDeps,
  request: SidechatRequest,
  userId: string,
  conversationId: string,
) => {
  if (!deps.hostSurfaceState) return;

  const commands = (request.hostContext?.resources ?? [])
    .map(createFreshViewCommand)
    .filter((command): command is Extract<HostCommand, { type: "grid.applyView" }> =>
      Boolean(command),
    );

  for (const command of commands) {
    await deps.hostSurfaceState.applyCommand({
      workspaceId: request.workspaceId,
      userId,
      conversationId,
      command,
    });
  }
};

const createFreshViewCommand = (
  resource: NonNullable<
    NonNullable<SidechatRequest["hostContext"]>["resources"]
  >[number],
) => {
  if (!isUnknownRecord(resource.metadata)) return undefined;
  const currentView = resource.metadata.currentView;
  if (!isUnknownRecord(currentView)) return undefined;

  const command = validateHostCommand({
    type: "grid.applyView",
    resourceId: resource.id,
    view: currentView,
  });

  if (!command.ok || command.data.type !== "grid.applyView") {
    return undefined;
  }

  return command.data;
};
