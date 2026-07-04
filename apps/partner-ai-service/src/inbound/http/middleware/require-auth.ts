import { PROTOCOL_ERROR_CODES } from "@side-chat/chat-protocol";
import type { DiagnosticLogger } from "@side-chat/shared";
import { createMiddleware } from "hono/factory";

import type { AuthContextVariables } from "./auth-context.js";
import { jsonError } from "../response/protocol-errors.js";

export const requireAuth = (logger: DiagnosticLogger) =>
  createMiddleware<AuthContextVariables>(async (context, next) => {
    if (!context.get("authContext")) {
      // The client already receives the 401; the warn line is for the developer
      // console, where a misconfigured widget token would otherwise be invisible.
      logger.warn("request rejected: authentication required", {
        method: context.req.method,
        path: context.req.path,
      });
      return jsonError(PROTOCOL_ERROR_CODES.UNAUTHORIZED, "Authentication is required.", 401);
    }

    await next();
    return undefined;
  });
