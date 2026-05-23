import { createMiddleware } from "hono/factory";

import type { AuthContextVariables } from "./auth-context.js";
import { jsonError } from "../response/protocol-errors.js";

export const requireAuth = () =>
  createMiddleware<AuthContextVariables>(async (context, next) => {
    if (!context.get("authContext")) {
      return jsonError("unauthorized", "Authentication is required.", 401);
    }

    await next();
    return undefined;
  });
