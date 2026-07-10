import { type HostCommandResultStatus, type SidechatRepositories } from "@side-chat/db";
import { PROTOCOL_ERROR_CODES, SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import { isRecord, type JsonObject, type JsonValue } from "@side-chat/shared";
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
 * Register the browser's host-command result route (ADR 0009).
 *
 * Any service instance may receive the result. It first checks the durable
 * `emitted` row for this turn, so a leaked command id cannot settle a tool call.
 * It then saves the result, which wakes the owning instance, and offers it to a
 * local resolver when the owner is on this instance. Reposting is idempotent.
 */
export const registerHostCommandResultRoute = (
  app: Hono<AuthContextVariables>,
  dependencies: HostCommandResultRouteDependencies,
): void => {
  app.post("/chat/turns/:assistantTurnId/host-commands/:commandId/result", async (context) => {
    const authContext = requireContextAuth(context.get("authContext"));
    const turn = await dependencies.repositories.findAssistantTurn({
      workspaceId: authContext.workspaceId,
      subjectId: authContext.subject.subjectId,
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
  return isJsonObject(body) ? body : undefined;
};

const isJsonObject = (value: unknown): value is JsonObject =>
  isRecord(value) && Object.values(value).every(isJsonValue);

const isJsonValue = (value: unknown): value is JsonValue => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
};

/** The browser result's status, constrained to the durable vocabulary (never `emitted`). */
const resultStatus = (result: JsonObject): HostCommandResultStatus => {
  const status = result["status"];
  if (
    status === "applied" ||
    status === "rejected" ||
    status === "unsupported" ||
    status === "failed" ||
    status === "timed_out"
  ) {
    return status;
  }
  return "failed";
};

const resultCode = (result: JsonObject): string =>
  typeof result["resultCode"] === "string" ? result["resultCode"] : "unknown";
