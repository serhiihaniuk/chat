import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { toActorId, type MessageRecord, type SidechatRepositories } from "@side-chat/db";
import type { ClockPort } from "@side-chat/partner-ai-core";
import { omitUndefinedProperties } from "@side-chat/shared";
import type { Hono } from "hono";

import { readTurnActivityEvents } from "#adapters/persistence/service-persistence-recorders";
import type { AuthContextVariables } from "../../middleware/auth-context.js";
import { errorMessage, jsonError } from "../../response/protocol-errors.js";
import { requireContextAuth } from "../types.js";

export const registerChatHistoryRoutes = (
  app: Hono<AuthContextVariables>,
  dependencies: { readonly repositories: SidechatRepositories; readonly clock: ClockPort },
) => {
  app.get("/chat/conversations", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const limit = readPositiveInteger(context.req.query("limit"), 25);
    const conversations = await dependencies.repositories.listConversations({
      workspaceId: authContext.workspaceId,
      subjectId: authContext.subject.subjectId,
      limit,
    });

    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      conversations: conversations.map((conversation) => ({
        conversationId: conversation.conversationId,
        title: conversation.titleText ?? "Untitled chat",
        status: conversation.status,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        lastMessageAt: conversation.lastMessageAt,
      })),
    });
  });

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
        messages: messages.map(toHistoryMessagePayload),
      });
    } catch (error) {
      return jsonError("not_found", errorMessage(error), 404);
    }
  });

  // One conversation's history plus its active turn, so a reconnecting client can
  // both render past messages and resume an in-flight turn from one read.
  app.get("/chat/conversations/:conversationId", async (context) => {
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
      const activeTurn = await dependencies.repositories.findActiveAssistantTurn({
        workspaceId: authContext.workspaceId,
        subjectId: authContext.subject.subjectId,
        conversationId,
      });
      return context.json({
        protocolVersion: SIDECHAT_PROTOCOL_VERSION,
        conversationId,
        messages: messages.map(toHistoryMessagePayload),
        activeTurn: activeTurn
          ? { assistantTurnId: activeTurn.assistantTurnId, status: activeTurn.status }
          : null,
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
        now: dependencies.clock.now(),
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

// One stored message as `HistoryMessage` (chat-protocol): the assistant's stored
// activity trace replays verbatim under `activity`, and the field is omitted for
// messages without one so the payload stays lean.
const toHistoryMessagePayload = (message: MessageRecord) =>
  omitUndefinedProperties({
    id: message.messageId,
    role: message.role,
    content: message.contentText,
    sequence: message.sequenceIndex,
    activity: readTurnActivityEvents(message.metadataJson),
  });

const readPositiveInteger = (rawValue: string | undefined, fallback: number): number => {
  if (!rawValue) return fallback;
  const parsed = Number(rawValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};
