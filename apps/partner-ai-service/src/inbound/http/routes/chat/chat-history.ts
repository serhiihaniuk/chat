import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { toActorId } from "@side-chat/db";
import type { Hono } from "hono";

import type { AuthContextVariables } from "../../middleware/auth-context.js";
import { errorMessage, jsonError } from "../../response/protocol-errors.js";
import { requireContextAuth, type RouteDependencies } from "../types.js";

export const registerChatHistoryRoutes = (
  app: Hono<AuthContextVariables>,
  dependencies: Pick<RouteDependencies, "repositories">,
) => {
  app.get("/chat/history/:conversationId", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const conversationId = context.req.param("conversationId");
    const limit = readPositiveInteger(context.req.query("limit"), 50);

    try {
      const messages = await dependencies.repositories.readConversationHistory({
        workspaceId: authContext.workspaceId,
        subjectId: authContext.subject.subjectId,
        conversationId,
        limit,
      });
      return context.json({
        protocolVersion: SIDECHAT_PROTOCOL_VERSION,
        conversationId,
        messages: messages.map((message) => ({
          id: message.messageId,
          role: message.role,
          content: message.contentText,
          sequence: message.sequenceIndex,
        })),
      });
    } catch (error) {
      return jsonError("not_found", errorMessage(error), 404);
    }
  });

  app.delete("/chat/history/:conversationId", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const conversationId = context.req.param("conversationId");

    try {
      const reset = await dependencies.repositories.resetConversation({
        workspaceId: authContext.workspaceId,
        subjectId: authContext.subject.subjectId,
        actorId: toActorId(authContext.actor.subjectId),
        conversationId,
        requestId: `reset:${conversationId}`,
        now: authContext.issuedAt,
      });
      return context.json({
        protocolVersion: SIDECHAT_PROTOCOL_VERSION,
        conversationId: reset.conversationId,
        status: reset.status,
      });
    } catch (error) {
      return jsonError("not_found", errorMessage(error), 404);
    }
  });
};

const readPositiveInteger = (rawValue: string | undefined, fallback: number): number => {
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
