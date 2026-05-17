import type { Hono } from "hono";
import { SidechatProtocol } from "@side-chat/shared-protocol";

import type { StreamChatDeps } from "#application/stream-chat.js";

/**
 * Operational routes for local smoke checks and model-picker data. They expose
 * configured models without leaking provider adapter internals.
 */
export const registerHealthModelsRoutes = (
  app: Hono,
  deps: StreamChatDeps,
) => {
  app.get(SidechatProtocol.healthRoute, (c) => c.json({ ok: true }));
  app.get(SidechatProtocol.modelsRoute, (c) =>
    c.json({ models: deps.config.models() }),
  );
};
