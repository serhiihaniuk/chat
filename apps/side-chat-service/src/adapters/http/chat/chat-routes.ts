import { Hono } from "hono";

import { cancelTurn } from "#application/turn/cancel-turn";
import { runTurn, type RunTurnDependencies } from "#application/turn/execution/run-turn";
import { TurnRejectedError } from "#application/turn/turn-errors";
import type { TurnModelPolicy } from "#application/turn/turn-model-policy";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";

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
    replay: TurnReplay;
    runAccess: TurnRunAccess;
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

  app.get(CHAT_HTTP_ROUTES.STREAM, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const startIndex = parseStartIndex(context.req.query("startIndex"));
    if (startIndex === undefined) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid replay start index.");
    }
    const runId = context.req.param("runId");
    try {
      // Ownership precedes Workflow lookup so a guessed run id is never an
      // existence oracle across workspaces or subjects.
      await dependencies.runAccess.assertAccessible(context.get("authContext"), runId);
      const replay = await dependencies.replay.open(runId, startIndex);
      if (replay.status === TURN_REPLAY_RESULTS.NOT_FOUND) {
        return errorResponse(requestId, HTTP_ERROR.NOT_FOUND, "Turn run not found.");
      }
      if (replay.status === TURN_REPLAY_RESULTS.START_INDEX_OUT_OF_RANGE) {
        const response = errorResponse(
          requestId,
          HTTP_ERROR.RANGE_NOT_SATISFIABLE,
          "Replay start index is beyond the durable stream.",
        );
        response.headers.set(HTTP_HEADERS.WORKFLOW_STREAM_TAIL_INDEX, String(replay.tailIndex));
        return response;
      }
      return createChatStreamResponse({
        stream: replay.stream,
        runId,
        tailIndex: replay.tailIndex,
        keepaliveIntervalMs: dependencies.keepaliveIntervalMs,
        outboundTransforms: dependencies.outboundTransforms ?? [],
      });
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  return app;
}

/** Missing means replay from the beginning; otherwise require one safe integer. */
function parseStartIndex(value: string | undefined): number | undefined {
  if (value === undefined) return 0;
  if (!/^-?(?:0|[1-9]\d*)$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function mapTurnError(requestId: string, error: unknown): Response {
  if (error instanceof TurnRejectedError) {
    return turnRejectionResponse(requestId, error);
  }
  return errorResponse(
    requestId,
    HTTP_ERROR.INTERNAL_SERVER_ERROR,
    "The turn request could not be completed.",
  );
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
