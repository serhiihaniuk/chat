import { DbRepositoryError } from "@side-chat/db";
import { Hono } from "hono";

import { readConversationHistory } from "#application/conversations/read-conversation-history";
import type { ConversationQueryStore } from "#application/ports/conversation-query-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";

import type { AuthVariables } from "../auth-middleware.js";
import { errorResponse, HTTP_ERROR } from "../error-response.js";
import { HTTP_HEADERS, QUERY_HTTP_ROUTES } from "../http-contract.js";

export type QueryRouteDependencies = Readonly<{
  queries: ConversationQueryStore;
  telemetry: Pick<TelemetrySink, "record">;
  model: Readonly<{ id: string; provider: string }>;
}>;

/** HTTP DTO ownership for durable conversation, history, discovery, and model reads. */
export function createQueryRoutes(dependencies: QueryRouteDependencies): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.get(QUERY_HTTP_ROUTES.CONVERSATIONS, async (context) => {
    const conversations = await dependencies.queries.listConversations(context.get("authContext"));
    return context.json({ conversations });
  });

  app.get(QUERY_HTTP_ROUTES.MODELS, (context) =>
    context.json({ models: [dependencies.model], defaultModelId: dependencies.model.id }),
  );

  app.get(QUERY_HTTP_ROUTES.MESSAGES, async (context) => {
    try {
      const messages = await readConversationHistory(
        dependencies,
        context.get("authContext"),
        context.req.param("conversationId"),
      );
      return context.json({ messages });
    } catch (error) {
      return mapHistoryError(requestId(context), error);
    }
  });

  app.get(QUERY_HTTP_ROUTES.ACTIVE_TURN, async (context) => {
    try {
      const activeTurn = await dependencies.queries.findActiveTurn(
        context.get("authContext"),
        context.req.param("conversationId"),
      );
      return context.json({ activeTurn: activeTurn ?? null });
    } catch (error) {
      if (isHiddenConversationError(error)) return context.json({ activeTurn: null });
      return errorResponse(
        requestId(context),
        HTTP_ERROR.INTERNAL_SERVER_ERROR,
        "Active turn discovery failed.",
      );
    }
  });

  return app;
}

function mapHistoryError(requestIdValue: string, error: unknown): Response {
  if (isHiddenConversationError(error)) {
    return errorResponse(requestIdValue, HTTP_ERROR.NOT_FOUND, "Conversation not found.");
  }
  return errorResponse(
    requestIdValue,
    HTTP_ERROR.INTERNAL_SERVER_ERROR,
    "Conversation history could not be loaded.",
  );
}

function isHiddenConversationError(error: unknown): boolean {
  return (
    error instanceof DbRepositoryError &&
    (error.code === "record_not_found" || error.code === "cross_tenant_access_denied")
  );
}

function requestId(context: { req: { header: (name: string) => string | undefined } }): string {
  return context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
}
