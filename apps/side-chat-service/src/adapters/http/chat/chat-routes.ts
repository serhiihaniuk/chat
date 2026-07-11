import { Hono } from "hono";

import { cancelTurn } from "#application/turn/cancel-turn";
import { runTurn, type RunTurnDependencies } from "#application/turn/execution/run-turn";
import { TurnRejectedError } from "#application/turn/turn-errors";
import type { TurnModelPolicy } from "#application/turn/turn-model-policy";

import type { AuthVariables } from "../auth-middleware.js";
import { errorResponse, HTTP_ERROR, turnRejectionResponse } from "../error-response.js";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "../http-contract.js";
import { parseCancelRequest, parseChatRequest } from "./chat-request-schema.js";
import { createChatStreamResponse, type OutboundTransformFactory } from "./chat-stream-response.js";

export type ChatRouteDependencies = RunTurnDependencies &
  Readonly<{
    keepaliveIntervalMs: number;
    outboundTransforms?: readonly OutboundTransformFactory[];
    selectModel: TurnModelPolicy;
  }>;

/** HTTP owns validation and stream encoding; application services own turn policy and state. */
export function createChatRoutes(dependencies: ChatRouteDependencies): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.post(CHAT_HTTP_ROUTES.START, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const request = await parseChatRequest(await safeJson(context.req.raw));
    if (!request) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid chat request.");
    }

    try {
      const running = await runTurn(dependencies, {
        auth: context.get("authContext"),
        requestId: request.requestId,
        conversationId: request.conversationId,
        messages: request.messages,
        acceptedUserMessage: request.acceptedUserMessage,
        clientTools: request.clientTools,
        modelId: dependencies.selectModel(request.requestedModelId),
      });
      return createChatStreamResponse({
        stream: running.stream,
        runId: running.runId,
        keepaliveIntervalMs: dependencies.keepaliveIntervalMs,
        outboundTransforms: dependencies.outboundTransforms ?? [],
      });
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  app.post(CHAT_HTTP_ROUTES.CANCEL, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const request = parseCancelRequest(await safeJson(context.req.raw));
    if (!request) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid cancel request.");
    }
    try {
      await cancelTurn(dependencies.turns, dependencies.execution, {
        auth: context.get("authContext"),
        conversationId: request.conversationId,
        runId: context.req.param("runId"),
      });
      return context.json({
        cancelled: true,
        runId: context.req.param("runId"),
      });
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  return app;
}

function mapTurnError(requestId: string, error: unknown): Response {
  if (error instanceof TurnRejectedError) {
    return turnRejectionResponse(requestId, error);
  }
  return errorResponse(
    requestId,
    HTTP_ERROR.INTERNAL_SERVER_ERROR,
    "The turn could not be started.",
  );
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
