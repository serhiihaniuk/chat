import { Hono } from "hono";

export type Readiness = { readonly isReady: () => boolean };

export function createHttpApp(readiness: Readiness): Hono {
  const app = new Hono();
  app.get("/healthz", (context) => context.json({ status: "ok" }));
  app.get("/readyz", (context) =>
    readiness.isReady()
      ? context.json({ status: "ready" })
      : context.json({ status: "not_ready" }, 503),
  );
  return app;
}
