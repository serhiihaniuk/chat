import { Hono } from "hono";

import type { StreamChatDeps } from "#application/stream-chat.js";
import { createDefaultDeps } from "./composition/default-deps.js";
import { createInboundApp } from "./routes/index.js";

/**
 * Top-level Hono app factory. Tests can inject StreamChatDeps; runtime uses the
 * default composition root.
 */
export const createApp = (deps: StreamChatDeps = createDefaultDeps()) => {
  const app = new Hono();
  app.route("/", createInboundApp(deps));
  return app;
};

export default createApp;
