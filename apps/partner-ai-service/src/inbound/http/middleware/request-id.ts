import { createMiddleware } from "hono/factory";

import type { AuthContextVariables } from "./auth-context.js";

export const requestIdMiddleware = () =>
  createMiddleware<AuthContextVariables>(async (context, next) => {
    const requestId =
      context.req.header("x-request-id") ?? `request_${crypto.randomUUID()}`;
    context.header("x-request-id", requestId);

    await next();
    return undefined;
  });
