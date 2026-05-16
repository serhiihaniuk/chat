import type {
  HostGridViewState,
  HostSurfaceStatePort,
} from "#ports/index.js";

export const createMemoryHostSurfaceState = (): HostSurfaceStatePort => {
  const views = new Map<string, Map<string, HostGridViewState>>();

  const makeKey = (
    workspaceId: string,
    userId: string,
    conversationId: string | undefined,
  ) => `${workspaceId}:${userId}:${conversationId ?? "latest"}`;

  const setView = (
    workspaceId: string,
    userId: string,
    conversationId: string | undefined,
    resourceId: string,
    view: HostGridViewState | undefined,
  ) => {
    const key = makeKey(workspaceId, userId, conversationId);
    const resourceViews = views.get(key) ?? new Map<string, HostGridViewState>();
    if (view) {
      resourceViews.set(resourceId, view);
    } else {
      resourceViews.delete(resourceId);
    }
    views.set(key, resourceViews);
  };

  return {
    async applyCommand({ workspaceId, userId, conversationId, command }) {
      if (command.type === "grid.applyView") {
        const view = {
          filters: command.view.filters,
          sort: command.view.sort,
          highlightRowIds: command.view.highlightRowIds,
        };
        setView(workspaceId, userId, conversationId, command.resourceId, view);
        setView(workspaceId, userId, undefined, command.resourceId, view);
      }

      if (command.type === "grid.clearView") {
        setView(
          workspaceId,
          userId,
          conversationId,
          command.resourceId,
          undefined,
        );
        setView(workspaceId, userId, undefined, command.resourceId, undefined);
      }
    },
    async getGridView({ workspaceId, userId, conversationId, resourceId }) {
      const exact = views
        .get(makeKey(workspaceId, userId, conversationId))
        ?.get(resourceId);
      if (exact) return exact;
      return views.get(makeKey(workspaceId, userId, undefined))?.get(resourceId);
    },
  };
};
