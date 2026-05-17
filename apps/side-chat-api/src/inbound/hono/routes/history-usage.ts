import type { Hono } from "hono";

import type { StreamChatDeps } from "#application/stream-chat.js";

/**
 * Non-stream chat support routes. They read through application ports so memory
 * and Postgres persistence stay interchangeable.
 */
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

  app.delete("/chat/history", async (c) => {
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

    if (!deps.conversations.resetHistory) {
      return c.json({ error: "Conversation reset is not configured" }, 501);
    }

    const usageReset = deps.usage.reset
      ? await deps.usage.reset({ workspaceId, userId, conversationId })
      : { deletedUsageRecords: 0 };
    const historyReset = await deps.conversations.resetHistory({
      workspaceId,
      userId,
      conversationId,
    });

    return c.json({
      conversationId,
      deletedMessages: historyReset.deletedMessages,
      deletedUsageRecords: usageReset.deletedUsageRecords,
    });
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
