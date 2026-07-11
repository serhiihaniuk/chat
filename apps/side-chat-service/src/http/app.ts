import { Hono } from "hono";

const app = new Hono();

app.get("/healthz", (context) => context.json({ status: "ok" }));
app.get("/readyz", (context) => context.json({ status: "ready" }));

export default app;
