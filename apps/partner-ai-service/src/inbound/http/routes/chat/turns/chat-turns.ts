import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";
import type { AssistantTurnRecord, SidechatRepositories } from "@side-chat/db";
import type {
  AuthContext,
  ObservabilitySinkPort,
  StreamChatPorts,
} from "@side-chat/partner-ai-core";
import type { Hono } from "hono";

import type { ServiceHostCommandResolver } from "#adapters/host-commands/service-host-command-resolver";
import type { TurnEventDispatcher } from "#inbound/turn-stream/turn-event-dispatcher";
import type { TurnRunner } from "#inbound/turn-runner/turn-runner";
import type { AuthContextVariables } from "../../../middleware/auth-context.js";
import { jsonError, replayExpiredError } from "../../../response/protocol-errors.js";
import { requireContextAuth } from "../../types.js";
import { openTurnEventStream } from "../turn-stream-response.js";
import {
  isTerminalTurn,
  recordReplayOutcome,
  recordRunFinished,
  recordTurnCancelled,
} from "./chat-turns-resumability.js";

/** Default replay offset: `-1` replays the whole turn from `sidechat.started`. */
const DEFAULT_REPLAY_OFFSET = -1;

export type ChatTurnRouteDependencies = {
  readonly repositories: SidechatRepositories;
  readonly ports: StreamChatPorts;
  readonly dispatcher: TurnEventDispatcher;
  readonly runner: TurnRunner;
  /** Settles UI (host) tool calls with the browser's POSTed result. */
  readonly hostCommandResolver: ServiceHostCommandResolver;
  readonly safetyPollIntervalMs: number;
  /** Optional telemetry sink for replay served/expired, cancel, and run-finished. */
  readonly observability?: ObservabilitySinkPort | undefined;
};

/**
 * Register the turn-scoped read routes: resolve, status, and live stream.
 *
 * These are the subscribe half of the resumable transport. Generation is started
 * by `POST /chat/runs`; everything here only reads the durable log and live
 * fan-out, scoped to the caller's workspace so an id is never a bearer capability.
 */
export const registerChatTurnRoutes = (
  app: Hono<AuthContextVariables>,
  dependencies: ChatTurnRouteDependencies,
) => {
  // Resolve a lost POST reply: map the client request id back to its turn.
  app.get("/chat/runs/:requestId", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await dependencies.repositories.findAssistantTurnByRequest({
      workspaceId: authContext.workspaceId,
      requestId: context.req.param("requestId"),
    });
    if (!turn) return notFoundTurn();
    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      ...turnIdentity(turn),
    });
  });

  app.get("/chat/turns/:assistantTurnId", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await loadWorkspaceTurn(
      dependencies,
      authContext,
      context.req.param("assistantTurnId"),
    );
    if (!turn) return notFoundTurn();
    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      ...turnStatus(turn),
    });
  });

  // Replay + tail the durable event log as SSE.
  app.get("/chat/turns/:assistantTurnId/stream", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await loadWorkspaceTurn(
      dependencies,
      authContext,
      context.req.param("assistantTurnId"),
    );
    // A stream that cannot replay returns JSON before any SSE frame is written.
    if (!turn) return notFoundTurn();

    const after = readReplayOffset(context.req.query("after"));
    // Connection-bound streaming: a finished turn that is no longer buffered in the
    // in-memory registry cannot be streamed, so return replay_expired before opening
    // SSE and let the widget read the final answer from conversation history. A turn
    // still in the registry (running, or recently finished and buffered) is replayed
    // from its buffer and tailed.
    if (isTerminalTurn(turn) && !dependencies.dispatcher.hasTurn(turn.assistantTurnId)) {
      recordReplayOutcome(dependencies, turn, "replay_expired", after);
      return replayExpiredError("This turn has finished; read it from conversation history.");
    }

    recordReplayOutcome(dependencies, turn, "replay_served", after);
    if (isTerminalTurn(turn)) recordRunFinished(dependencies, turn);
    return openTurnEventStream(dependencies, {
      assistantTurnId: turn.assistantTurnId,
      requestId: turn.requestId,
      authContext,
      after,
    });
  });

  // Cancel one turn from any instance. The id is not a bearer capability: the
  // intent write is workspace-scoped, so a cross-workspace id simply matches no
  // running turn and is reported as not cancelled.
  app.post("/chat/turns/:assistantTurnId/cancel", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const assistantTurnId = context.req.param("assistantTurnId");

    // Durable intent + notify in one transaction. CAS to running, so cancelling a
    // finished or unknown turn is a no-op ack rather than an error.
    const { cancelRequested } = await dependencies.repositories.requestTurnCancellation({
      workspaceId: authContext.workspaceId,
      assistantTurnId,
      now: dependencies.ports.clock.now(),
    });

    // Interrupt the fiber if this instance owns it (no-op otherwise). The db
    // notify covers a remote owner; this makes the local owner — and the
    // notify-less memory adapter — react without waiting on the reaper.
    if (cancelRequested) await dependencies.runner.interruptTurn(assistantTurnId);

    // Record the cancel with its outcome so operators see cancel intent vs no-op
    // (a cancel of a finished/unknown turn reports `cancelRequested: false`).
    recordTurnCancelled(dependencies, assistantTurnId, cancelRequested);

    return context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      assistantTurnId,
      cancelRequested,
    });
  });

  // Connection-bound UI tools: the browser POSTs the result of a dispatched host
  // command here, which settles the runtime's awaiting tool call so the model
  // continues. The turn id is workspace-scoped, not a bearer capability.
  app.post("/chat/turns/:assistantTurnId/host-commands/:commandId/result", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await loadWorkspaceTurn(
      dependencies,
      authContext,
      context.req.param("assistantTurnId"),
    );
    if (!turn) return notFoundTurn();

    const result = await readHostCommandResult(context.req.raw);
    if (!result) {
      return jsonError(
        PROTOCOL_ERROR_CODES.BAD_REQUEST,
        "Request body must be a JSON object holding the host command result.",
        400,
      );
    }

    const settled = dependencies.hostCommandResolver.resolveResult({
      commandId: context.req.param("commandId"),
      result,
    });
    if (!settled) {
      return jsonError(
        PROTOCOL_ERROR_CODES.NOT_FOUND,
        "No host command is awaiting that id (unknown, already resolved, or timed out).",
        404,
      );
    }
    return context.json({ protocolVersion: SIDECHAT_PROTOCOL_VERSION, settled: true });
  });
};

/**
 * Read the host command result body as a JSON object.
 *
 * The browser POSTs the value the model should receive; a non-object body (invalid
 * JSON, an array, or a primitive) is rejected so the resolver only ever settles a
 * structured result.
 */
const readHostCommandResult = async (request: Request): Promise<JsonObject | undefined> => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return undefined;
  return body as JsonObject;
};

/**
 * Load one turn scoped to the caller's workspace.
 *
 * Returns `undefined` for an unknown or cross-workspace id so the route maps it
 * to a not-found response rather than leaking another tenant's turn.
 */
const loadWorkspaceTurn = (
  dependencies: ChatTurnRouteDependencies,
  authContext: AuthContext,
  assistantTurnId: string,
): Promise<AssistantTurnRecord | undefined> =>
  dependencies.repositories.findAssistantTurn({
    workspaceId: authContext.workspaceId,
    assistantTurnId,
  });

const notFoundTurn = (): Response =>
  jsonError(PROTOCOL_ERROR_CODES.NOT_FOUND, "Assistant turn was not found.", 404);

const turnIdentity = (turn: AssistantTurnRecord) => ({
  assistantTurnId: turn.assistantTurnId,
  status: turn.status,
});

const turnStatus = (turn: AssistantTurnRecord) => ({
  assistantTurnId: turn.assistantTurnId,
  conversationId: turn.conversationId,
  requestId: turn.requestId,
  status: turn.status,
});

/**
 * Parse the `after` replay offset with the single project convention.
 *
 * A missing or non-integer value falls back to `-1` (replay the whole turn) so a
 * fresh subscriber always gets `sidechat.started` first.
 */
const readReplayOffset = (rawAfter: string | undefined): number => {
  if (rawAfter === undefined) return DEFAULT_REPLAY_OFFSET;
  const parsed = Number(rawAfter);
  return Number.isInteger(parsed) ? parsed : DEFAULT_REPLAY_OFFSET;
};
