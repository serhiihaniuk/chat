import { createMiddleware } from "hono/factory";

import type { AuthContext, RequestAuthorizer } from "@side-chat/side-chat-server";

import { errorResponse, HTTP_ERROR } from "./error-response.js";
import { HTTP_HEADERS } from "./http-contract.js";

export type AuthVariables = { Variables: { authContext: AuthContext } };

export function requireAuthentication(authorizer: RequestAuthorizer) {
  return createMiddleware<AuthVariables>(async (context, next) => {
    const requestId = context.req.header(HTTP_HEADERS.REQUEST_ID) || crypto.randomUUID();
    const authorization = context.req.header(HTTP_HEADERS.AUTHORIZATION);
    const authContext = await authorizer.authorize({
      requestId,
      bearerToken: authorization === "" ? undefined : authorization,
    });
    if (!authContext) {
      return errorResponse(requestId, HTTP_ERROR.UNAUTHORIZED, "Authentication is required.");
    }
    context.set("authContext", authContext);
    context.header(HTTP_HEADERS.REQUEST_ID, requestId);
    await next();
    return undefined;
  });
}
