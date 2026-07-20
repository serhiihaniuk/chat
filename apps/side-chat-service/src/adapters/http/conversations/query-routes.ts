import { Hono } from "hono";
import type { SideChatReasoningSupport } from "@side-chat/stream-profile";

import {
  readConversationHistory,
  readConversationState,
  type StructuredPartCatalogs,
} from "#application/conversations/read-conversation-history";
import {
  DEFAULT_HISTORY_PAGE_LIMIT,
  type ConversationHistoryQuery,
  type ConversationQueryStore,
} from "#application/ports/conversation-query-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import { toServerToolCatalog, type ServerToolDefinition } from "@side-chat/side-chat-server";
import { TURN_REJECTION_CODES } from "#application/turn/turn-errors";

import type { AuthVariables } from "../auth-middleware.js";
import { errorResponse, HTTP_ERROR } from "../error-response.js";
import { HTTP_HEADERS, QUERY_HTTP_ROUTES } from "../http-contract.js";

export type QueryRouteDependencies = Readonly<{
  queries: ConversationQueryStore;
  telemetry: Pick<TelemetrySink, "record">;
  modelCatalog: Readonly<{
    models: readonly Readonly<{
      id: string;
      provider: string;
      contextWindowTokens: number;
      reasoning?: SideChatReasoningSupport | undefined;
    }>[];
    defaultModelId: string;
  }>;
  /** Current tool/data schemas honored when validating persisted history parts. */
  structuredPartCatalogs?: StructuredPartCatalogs | undefined;
  /** Current trusted server catalog; only its display projection is exposed. */
  serverTools: readonly ServerToolDefinition[];
}>;

/** HTTP DTO ownership for durable conversation, history, discovery, and model reads. */
export function createQueryRoutes(dependencies: QueryRouteDependencies): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.get(QUERY_HTTP_ROUTES.CONVERSATIONS, async (context) => {
    const auth = context.get("authContext");
    const [conversations, activeTurns] = await Promise.all([
      dependencies.queries.listConversations(auth),
      dependencies.queries.listActiveTurns(auth),
    ]);
    const runningConversationIds = [...new Set(activeTurns.map((turn) => turn.conversationId))];
    return context.json({ conversations, runningConversationIds });
  });

  app.get(QUERY_HTTP_ROUTES.MODELS, (context) => context.json(dependencies.modelCatalog));

  app.get(QUERY_HTTP_ROUTES.TOOLS, (context) =>
    context.json({ tools: toServerToolCatalog(dependencies.serverTools) }),
  );

  app.get(QUERY_HTTP_ROUTES.MESSAGES, async (context) => {
    const parsed = parseHistoryQuery(context);
    if (!parsed.ok) {
      return errorResponse(requestId(context), HTTP_ERROR.BAD_REQUEST, parsed.message);
    }
    try {
      const history = await readConversationHistory(
        dependencies,
        context.get("authContext"),
        context.req.param("conversationId"),
        parsed.query,
      );
      return context.json(history);
    } catch (error) {
      return mapHistoryError(requestId(context), error);
    }
  });

  app.get(QUERY_HTTP_ROUTES.STATE, async (context) => {
    try {
      const state = await readConversationState(
        dependencies,
        context.get("authContext"),
        context.req.param("conversationId"),
      );
      return context.json(state);
    } catch (error) {
      return mapHistoryError(requestId(context), error);
    }
  });

  return app;
}

type QueryReader = Readonly<{
  req: { query: (name: string) => string | undefined };
}>;

type ParsedHistoryQuery =
  | Readonly<{ ok: true; query: ConversationHistoryQuery }>
  | Readonly<{ ok: false; message: string }>;

/** Read the optional backward-paging cursor from the request, rejecting malformed values. */
function parseHistoryQuery(context: QueryReader): ParsedHistoryQuery {
  const query: { beforeSequenceIndex?: number; limit?: number } = {};

  const beforeRaw = context.req.query("before");
  if (beforeRaw !== undefined) {
    const before = Number(beforeRaw);
    if (!Number.isInteger(before) || before < 0) {
      return {
        ok: false,
        message: "Query parameter 'before' must be a non-negative integer.",
      };
    }
    query.beforeSequenceIndex = before;
  }

  const limitRaw = context.req.query("limit");
  if (limitRaw !== undefined) {
    const limit = Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1) {
      return {
        ok: false,
        message: "Query parameter 'limit' must be a positive integer.",
      };
    }
    query.limit = Math.min(limit, DEFAULT_HISTORY_PAGE_LIMIT);
  }

  return { ok: true, query };
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

// An unknown or cross-tenant conversation must read as absent, never as a 500.
// The Postgres store reports it with `DbRepositoryError` codes; the in-memory
// store reports it with `TurnRejectedError` codes — both are hidden here so a
// every selected-conversation read resolves through the same hidden 404 contract.
const HIDDEN_CONVERSATION_CODES: ReadonlySet<string> = new Set([
  "record_not_found",
  "cross_tenant_access_denied",
  TURN_REJECTION_CODES.NOT_FOUND,
  TURN_REJECTION_CODES.FORBIDDEN,
]);

function isHiddenConversationError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) return false;
  return typeof error.code === "string" && HIDDEN_CONVERSATION_CODES.has(error.code);
}

function requestId(context: { req: { header: (name: string) => string | undefined } }): string {
  return context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
}
