import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { SidechatRepositories } from "@side-chat/db";
import type { Hono } from "hono";

import type { AuthContextVariables } from "../../middleware/auth-context.js";
import { requireContextAuth } from "../types.js";

export const registerChatUsageRoute = (
  app: Hono<AuthContextVariables>,
  repositories: SidechatRepositories,
) => {
  app.get("/usage", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const summary = await repositories.readUsageSummary({ workspaceId: authContext.workspaceId });
    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      workspaceId: authContext.workspaceId,
      ...summary,
    });
  });
};
