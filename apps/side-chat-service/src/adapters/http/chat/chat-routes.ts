import { Hono } from "hono";
import type { JsonValue } from "@side-chat/shared";

import { cancelTurn } from "#application/turn/cancel-turn";
import type { ClientToolDispatchStore } from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ToolApprovalDecisionStore } from "#application/ports/turn/tools/tool-approval-store";
import { runTurn, type RunTurnDependencies } from "#application/turn/execution/run-turn";
import {
  submitClientToolOutput,
  type ResumeClientTool,
} from "#application/turn/tools/submit-client-tool-output";
import { TurnRejectedError } from "#application/turn/turn-errors";
import {
  submitToolApproval,
  type ResumeToolApproval,
} from "#application/turn/tools/approvals/submit-tool-approval";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { HostContextLimits } from "#domain/host-context";

import type { AuthVariables } from "../auth-middleware.js";
import { errorResponse, HTTP_ERROR, turnRejectionResponse } from "../error-response.js";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "../http-contract.js";
import { parseCancelRequest, parseChatRequest } from "./chat-request-schema.js";
import { createChatStreamResponse, type OutboundTransformFactory } from "./chat-stream-response.js";
import { readToolApprovalDecision } from "./approvals/read-tool-approval-decision.js";
import { readCappedBytes } from "./body/read-capped-bytes.js";

export {
  TOOL_APPROVAL_DECISION_MAX_BYTES,
  readToolApprovalDecision,
} from "./approvals/read-tool-approval-decision.js";
export { readCappedBytes } from "./body/read-capped-bytes.js";

export type ChatRouteDependencies = RunTurnDependencies &
  Readonly<{
    keepaliveIntervalMs: number;
    outboundTransforms?: readonly OutboundTransformFactory[];
    replay: TurnReplay;
    runAccess: TurnRunAccess;
    clientToolDispatches: ClientToolDispatchStore;
    resumeClientTool: ResumeClientTool;
    toolApprovals: ToolApprovalDecisionStore;
    resumeToolApproval: ResumeToolApproval;
    serverToolNames: ReadonlySet<string>;
    hostContextLimits: HostContextLimits;
  }>;

/** HTTP owns validation and stream encoding; application services own turn policy and state. */
export function createChatRoutes(dependencies: ChatRouteDependencies): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.post(CHAT_HTTP_ROUTES.START, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const request = await parseChatRequest(
      await safeJson(context.req.raw),
      dependencies.serverToolNames,
      dependencies.hostContextLimits,
    );
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
        ...(request.hostContext === undefined ? {} : { hostContext: request.hostContext }),
        clientTools: request.clientTools,
        enabledToolNames: request.enabledToolNames,
        ...(request.requestedModelId === undefined
          ? {}
          : { requestedModelId: request.requestedModelId }),
        ...(request.reasoningEffort === undefined
          ? {}
          : { requestedReasoningEffort: request.reasoningEffort }),
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

  app.post(CHAT_HTTP_ROUTES.CLIENT_TOOL_OUTPUT, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    try {
      const acknowledgement = await submitClientToolOutput(
        dependencies.clientToolDispatches,
        dependencies.resumeClientTool,
        {
          auth: context.get("authContext"),
          runId: context.req.param("runId"),
          toolCallId: context.req.param("toolCallId"),
          readOutput: () => readClientToolOutput(context.req.raw),
        },
      );
      return context.json(acknowledgement);
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  app.post(CHAT_HTTP_ROUTES.TOOL_APPROVAL, async (context) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    try {
      const acknowledgement = await submitToolApproval(
        dependencies.toolApprovals,
        dependencies.resumeToolApproval,
        {
          auth: context.get("authContext"),
          runId: context.req.param("runId"),
          approvalId: context.req.param("approvalId"),
          requestId,
          readDecision: () => readToolApprovalDecision(context.req.raw),
        },
      );
      return context.json(acknowledgement);
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

export const CLIENT_TOOL_OUTPUT_MAX_BYTES = 64 * 1024;
const CLIENT_TOOL_OUTPUT_MAX_DEPTH = 16;
const INVALID_CLIENT_TOOL_OUTPUT = {
  value: { status: "failed", errorCode: "invalid_client_tool_output" },
} as const;

export async function readClientToolOutput(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > CLIENT_TOOL_OUTPUT_MAX_BYTES) {
    return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
  }
  try {
    const bytes = await readCappedBytes(request.body, CLIENT_TOOL_OUTPUT_MAX_BYTES);
    if (bytes === undefined) {
      return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
    }
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!isRecord(body) || !("output" in body) || !isBoundedJson(body["output"])) {
      return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
    }
    return { valid: true as const, output: { value: body["output"] } };
  } catch {
    return { valid: false as const, output: INVALID_CLIENT_TOOL_OUTPUT };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedJson(value: unknown, depth = 0): value is JsonValue {
  if (depth > CLIENT_TOOL_OUTPUT_MAX_DEPTH || value === undefined) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((entry) => isBoundedJson(entry, depth + 1));
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => isBoundedJson(entry, depth + 1));
}
