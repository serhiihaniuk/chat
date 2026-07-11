import { createMiddleware } from "hono/factory";

import type { RequestAuthorizer } from "#application/ports/request-authorizer";
import type { AuthContext } from "#domain/auth-context";

import { errorResponse } from "./error-response.js";

export type AuthVariables = { Variables: { authContext: AuthContext } };

export function requireAuthentication(authorizer: RequestAuthorizer) {
  return createMiddleware<AuthVariables>(async (context, next) => {
    const requestId = context.req.header("x-request-id") || crypto.randomUUID();
    const authorization = context.req.header("authorization");
    const authContext = await authorizer.authorize({
      requestId,
      bearerToken: authorization === "" ? undefined : authorization,
    });
    if (!authContext) {
      return errorResponse(requestId, "unauthorized", "Authentication is required.", 401);
    }
    context.set("authContext", authContext);
    context.header("x-request-id", requestId);
    await next();
    return undefined;
  });
}
