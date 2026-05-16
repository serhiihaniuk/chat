import type { Hono } from "hono";

import type { StreamChatDeps } from "#application/stream-chat.js";

export const registerHistoryUsageRoutes = (
  app: Hono,
  deps: StreamChatDeps,
) => {
  app.get("/chat/history", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const isAuthorized = await deps.auth.authorize(
      workspaceId,
      deps.config.defaultUserId(),
    );
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rows = await deps.conversations.readSeededHistory(
      workspaceId,
      conversationId,
    );
    return c.json({ conversationId, messages: rows });
  });

  app.get("/chat/usage", async (c) => {
    const workspaceId = c.req.query("workspaceId") ?? "";
    const conversationId = c.req.query("conversationId") ?? "";

    if (!workspaceId || !conversationId) {
      return c.json(
        { error: "workspaceId and conversationId are required" },
        400,
      );
    }

    const userId = deps.config.defaultUserId();
    const isAuthorized = await deps.auth.authorize(workspaceId, userId);
    if (!isAuthorized) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const usage = await deps.usage.latest({
      workspaceId,
      userId,
      conversationId,
    });
    return c.json({ conversationId, usage: usage ?? null });
  });
};
