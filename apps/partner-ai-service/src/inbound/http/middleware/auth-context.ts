import type { AuthContext } from "@side-chat/partner-ai-core";
import { createMiddleware } from "hono/factory";

import type { ServiceAuthVerifier } from "#adapters/auth/service-auth";

export type AuthContextVariables = {
  Variables: {
    authContext?: AuthContext;
  };
};

export const authContextMiddleware = (authority: ServiceAuthVerifier) =>
  createMiddleware<AuthContextVariables>(async (context, next) => {
    const bearerToken = context.req.header("authorization");
    const authContext = await authority.resolveAuthContext({
      requestId: context.req.header("x-request-id") ?? "route-request",
      bearerToken: bearerToken === "" ? undefined : bearerToken,
    });

    if (authContext) context.set("authContext", authContext);

    await next();
  });
