import {
  HOST_COMMAND_RESULT_STATUSES,
  type HostCommandResultStatus,
  type SidechatRepositories,
} from "@side-chat/db";
import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { JsonObject } from "@side-chat/shared";
import type { StreamChatPorts } from "@side-chat/partner-ai-core";
import type { Hono } from "hono";

import type { ServiceHostCommandResolver } from "#adapters/host-commands/service-host-command-resolver";
import type { AuthContextVariables } from "../../../../middleware/auth-context.js";
import { jsonError } from "../../../../response/protocol-errors.js";
import { requireContextAuth } from "../../../types.js";

export type HostCommandResultRouteDependencies = {
  readonly repositories: SidechatRepositories;
  readonly ports: StreamChatPorts;
  /** Settles the paused tool call when THIS instance owns it (the fast path). */
  readonly hostCommandResolver: ServiceHostCommandResolver;
};

/**
 * Register the host-command result route (the browser's half of a UI tool call).
 *
 * The route works on ANY instance (ADR 0009): it proves the command belongs to
 * the caller's turn against the durable `emitted` row the owner persisted at
 * dispatch — a leaked commandId without that row is a 404, never a settle — then
 * persists the browser's result (which NOTIFYs the owner in the same
 * transaction) and offers it to the local resolver for the same-instance fast
 * path. Reposting a result is an idempotent upsert.
 */
export const registerHostCommandResultRoute = (
  app: Hono<AuthContextVariables>,
  dependencies: HostCommandResultRouteDependencies,
): void => {
  app.post("/chat/turns/:assistantTurnId/host-commands/:commandId/result", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await dependencies.repositories.findAssistantTurn({
      workspaceId: authContext.workspaceId,
      assistantTurnId: context.req.param("assistantTurnId"),
    });
    if (!turn)
      return jsonError(PROTOCOL_ERROR_CODES.NOT_FOUND, "Assistant turn was not found.", 404);

    const result = await readHostCommandResult(context.req.raw);
    if (!result) {
      return jsonError(
        PROTOCOL_ERROR_CODES.BAD_REQUEST,
        "Request body must be a JSON object holding the host command result.",
        400,
      );
    }

    const commandId = context.req.param("commandId");
    const emitted = await dependencies.repositories.findHostCommandResult({
      workspaceId: authContext.workspaceId,
      assistantTurnId: turn.assistantTurnId,
      commandId,
    });
    if (!emitted) {
      return jsonError(
        PROTOCOL_ERROR_CODES.NOT_FOUND,
        "No host command with that id was emitted for this turn.",
        404,
      );
    }

    const now = dependencies.ports.clock.now();
    await dependencies.repositories.recordHostCommandResult({
      workspaceId: authContext.workspaceId,
      assistantTurnId: turn.assistantTurnId,
      commandId,
      commandType: emitted.commandType,
      status: resultStatus(result),
      resultCode: resultCode(result),
      commandRedactedJson: emitted.commandRedactedJson,
      resultRedactedJson: result,
      resolvedAt: now,
      now,
    });

    dependencies.hostCommandResolver.resolveResult({
      assistantTurnId: turn.assistantTurnId,
      commandId,
      result,
    });
    return context.json({ protocolVersion: SIDECHAT_PROTOCOL_VERSION, settled: true });
  });
};

/**
 * Read the host command result body as a JSON object.
 *
 * The browser POSTs the value the model should receive; a non-object body (invalid
 * JSON, an array, or a primitive) is rejected so the relay only ever settles a
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

/** The browser result's status, constrained to the durable vocabulary (never `emitted`). */
const resultStatus = (result: JsonObject): HostCommandResultStatus => {
  const status = result["status"];
  if (typeof status !== "string" || status === "emitted") return "failed";
  return (HOST_COMMAND_RESULT_STATUSES as readonly string[]).includes(status)
    ? (status as HostCommandResultStatus)
    : "failed";
};

const resultCode = (result: JsonObject): string =>
  typeof result["resultCode"] === "string" ? result["resultCode"] : "unknown";
