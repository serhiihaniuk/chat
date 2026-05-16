import { Hono } from "hono";

import type { StreamChatDeps } from "#application/stream-chat.js";
import { createDefaultDeps } from "../composition/default-deps.js";
import { registerChatStreamRoute } from "./chat-stream.js";
import { registerHealthModelsRoutes } from "./health-models.js";
import { registerHistoryUsageRoutes } from "./history-usage.js";
import { registerReportRoutes } from "./reports.js";

export const createInboundApp = (
  deps: StreamChatDeps = createDefaultDeps(),
) => {
  const app = new Hono();

  registerHealthModelsRoutes(app, deps);
  registerReportRoutes(app);
  registerHistoryUsageRoutes(app, deps);
  registerChatStreamRoute(app, deps);

  return app;
};

export const inboundApp = createInboundApp();
