import { Hono } from "hono";

import type { RequestAuthorizer } from "#application/ports/request-authorizer";

import { requireAuthentication } from "../auth-middleware.js";
import { HTTP_ERROR } from "../error-response.js";

export type Readiness = { readonly check: () => boolean | Promise<boolean> };

export function createHttpApp(readiness: Readiness, authorizer?: RequestAuthorizer): Hono {
  const app = new Hono();
  if (authorizer !== undefined) app.use("/api/*", requireAuthentication(authorizer));
  app.get("/healthz", (context) => context.json({ status: "ok" }));
  app.get("/readyz", async (context) =>
    (await readiness.check())
      ? context.json({ status: "ready" })
      : context.json({ status: "not_ready" }, HTTP_ERROR.SERVICE_UNAVAILABLE.STATUS),
  );
  return app;
}
