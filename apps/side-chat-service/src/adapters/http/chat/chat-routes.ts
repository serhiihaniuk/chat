import { Hono } from "hono";

import { cancelTurn } from "#application/turn/cancel-turn";
import type { ClientToolDispatchStore } from "#application/ports/turn/tools/client-tool-dispatch-store";
import type { ToolApprovalDecisionStore } from "#application/ports/turn/tools/tool-approval-store";
import { runTurn, type RunTurnDependencies } from "#application/turn/execution/run-turn";
import type { PrepareTurnInput } from "#application/turn/execution/prepare-turn";
import {
  submitClientToolOutput,
  type ResumeClientTool,
} from "#application/turn/tools/submit-client-tool-output";
import {
  submitToolApproval,
  type ResumeToolApproval,
} from "#application/turn/tools/approvals/submit-tool-approval";
import { TURN_REPLAY_RESULTS, type TurnReplay } from "#application/ports/turn/replay/turn-replay";
import type { TurnRunAccess } from "#application/ports/turn/replay/turn-run-access";
import type { HostContextPolicy } from "#domain/host-context";
import type { TurnCancellationStore } from "#application/ports/turn/turn-store";
import type { TelemetrySink } from "#application/ports/telemetry-sink";
import type { ActiveStreamRegistry } from "../stream/active-stream-registry.js";

import type { AuthVariables } from "../auth-middleware.js";
import { errorResponse, HTTP_ERROR } from "../error-response.js";
import { CHAT_HTTP_ROUTES, HTTP_HEADERS } from "../http-contract.js";
import { parseCancelRequest, parseChatRequest, type ChatRequest } from "./chat-request-schema.js";
import { createChatStreamResponse, type OutboundTransformFactory } from "./chat-stream-response.js";
import { readToolApprovalDecision } from "./approvals/read-tool-approval-decision.js";
import { readCappedJson } from "./body/read-capped-json.js";
import { digestClientToolCapability } from "./client-tools/authority/client-tool-capability.js";
import { readClientToolOutput } from "./client-tools/read-client-tool-output.js";
import {
  mapTurnError,
  parseStartIndex,
  readRequestId,
  requireClientToolCapabilityDigest,
} from "./routing/chat-route-support.js";
import { createChatKeepaliveObserver, recordReconnect } from "./telemetry/stream-telemetry.js";

export const CHAT_REQUEST_MAX_BYTES = 512 * 1024;
const CANCEL_REQUEST_MAX_BYTES = 4 * 1024;

export {
  TOOL_APPROVAL_DECISION_MAX_BYTES,
  readToolApprovalDecision,
} from "./approvals/read-tool-approval-decision.js";
export { readCappedBytes } from "./body/read-capped-bytes.js";
export {
  CLIENT_TOOL_OUTPUT_MAX_BYTES,
  readClientToolOutput,
} from "./client-tools/read-client-tool-output.js";

export type ChatRouteDependencies = RunTurnDependencies &
  Readonly<{
    turns: RunTurnDependencies["turns"] & TurnCancellationStore;
    keepaliveIntervalMs: number;
    outboundTransforms?: readonly OutboundTransformFactory[];
    replay: TurnReplay;
    runAccess: TurnRunAccess;
    clientToolDispatches: ClientToolDispatchStore;
    resumeClientTool: ResumeClientTool;
    toolApprovals: ToolApprovalDecisionStore;
    resumeToolApproval: ResumeToolApproval;
    serverToolNames: ReadonlySet<string>;
    hostContextPolicy: HostContextPolicy;
    telemetry: Pick<TelemetrySink, "record">;
    activeStreams?: ActiveStreamRegistry | undefined;
  }>;

/** HTTP owns validation and stream encoding; application services own turn policy and state. */
export function createChatRoutes(dependencies: ChatRouteDependencies): Hono<AuthVariables> {
  const app = new Hono<AuthVariables>();

  app.post(CHAT_HTTP_ROUTES.START, async (context) => {
    const requestId = readRequestId(context);
    const request = await parseChatRequest(
      await readCappedJson(context.req.raw, CHAT_REQUEST_MAX_BYTES),
      dependencies.serverToolNames,
      dependencies.hostContextPolicy,
    );
    if (!request) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid chat request.");
    }
    const clientToolCapabilityDigest = digestClientToolCapability(
      context.req.header(HTTP_HEADERS.CLIENT_TOOL_CAPABILITY),
    );
    if (request.clientTools.length > 0 && clientToolCapabilityDigest === undefined) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid chat request.");
    }

    try {
      const running = await runTurn(
        dependencies,
        toPrepareTurnInput(
          request,
          context.get("authContext"),
          clientToolCapabilityDigest,
          context.req.raw.signal,
        ),
      );
      return createChatStreamResponse({
        stream: running.stream,
        runId: running.runId,
        keepaliveIntervalMs: dependencies.keepaliveIntervalMs,
        outboundTransforms: dependencies.outboundTransforms ?? [],
        onKeepalive: createChatKeepaliveObserver(dependencies.telemetry),
        activeStreams: dependencies.activeStreams,
      });
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  app.post(CHAT_HTTP_ROUTES.CANCEL, async (context) => {
    const requestId = readRequestId(context);
    const request = parseCancelRequest(
      await readCappedJson(context.req.raw, CANCEL_REQUEST_MAX_BYTES),
    );
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
    const requestId = readRequestId(context);
    try {
      const clientToolCapabilityDigest = requireClientToolCapabilityDigest(
        context.req.header(HTTP_HEADERS.CLIENT_TOOL_CAPABILITY),
      );
      const acknowledgement = await submitClientToolOutput(
        dependencies.clientToolDispatches,
        dependencies.resumeClientTool,
        {
          auth: context.get("authContext"),
          runId: context.req.param("runId"),
          toolCallId: context.req.param("toolCallId"),
          clientToolCapabilityDigest,
          readOutput: () => readClientToolOutput(context.req.raw),
          telemetry: dependencies.telemetry,
        },
      );
      return context.json(acknowledgement);
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  app.post(CHAT_HTTP_ROUTES.TOOL_APPROVAL, async (context) => {
    const requestId = readRequestId(context);
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
          telemetry: dependencies.telemetry,
        },
      );
      return context.json(acknowledgement);
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  app.get(CHAT_HTTP_ROUTES.STREAM, async (context) => {
    const requestId = readRequestId(context);
    const startIndex = parseStartIndex(context.req.query("startIndex"));
    if (startIndex === undefined) {
      return errorResponse(requestId, HTTP_ERROR.BAD_REQUEST, "Invalid replay start index.");
    }
    const runId = context.req.param("runId");
    try {
      // Ownership precedes Workflow lookup so a guessed run id is never an
      // existence oracle across workspaces or subjects.
      const accessibleRun = await dependencies.runAccess.assertAccessible(
        context.get("authContext"),
        runId,
      );
      const replay = await dependencies.replay.open(
        runId,
        startIndex,
        `${accessibleRun.turnId}-assistant`,
      );
      if (replay.status === TURN_REPLAY_RESULTS.NOT_FOUND) {
        recordReconnect(dependencies.telemetry, "not_found");
        return errorResponse(requestId, HTTP_ERROR.NOT_FOUND, "Turn run not found.");
      }
      if (replay.status === TURN_REPLAY_RESULTS.START_INDEX_OUT_OF_RANGE) {
        recordReconnect(dependencies.telemetry, "out_of_range");
        const response = errorResponse(
          requestId,
          HTTP_ERROR.RANGE_NOT_SATISFIABLE,
          "Replay start index is beyond the durable stream.",
        );
        response.headers.set(HTTP_HEADERS.WORKFLOW_STREAM_TAIL_INDEX, String(replay.tailIndex));
        return response;
      }
      recordReconnect(dependencies.telemetry, "opened");
      return createChatStreamResponse({
        stream: replay.stream,
        runId,
        tailIndex: replay.tailIndex,
        keepaliveIntervalMs: dependencies.keepaliveIntervalMs,
        outboundTransforms: dependencies.outboundTransforms ?? [],
        onKeepalive: createChatKeepaliveObserver(dependencies.telemetry),
        activeStreams: dependencies.activeStreams,
      });
    } catch (error) {
      return mapTurnError(requestId, error);
    }
  });

  return app;
}

function toPrepareTurnInput(
  request: ChatRequest,
  auth: PrepareTurnInput["auth"],
  clientToolCapabilityDigest: string | undefined,
  signal: AbortSignal,
): PrepareTurnInput {
  return {
    auth,
    requestId: request.requestId,
    conversationId: request.conversationId,
    messages: request.messages,
    acceptedUserMessage: request.acceptedUserMessage,
    hostContext: request.hostContext,
    clientTools: request.clientTools,
    clientToolCapabilityDigest,
    enabledToolNames: request.enabledToolNames,
    signal,
    requestedModelId: request.requestedModelId,
    requestedReasoningEffort: request.reasoningEffort,
  };
}
