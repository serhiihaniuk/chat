import { SIDECHAT_PROTOCOL_VERSION } from "@side-chat/chat-protocol";
import type { Hono } from "hono";

import type { ServiceToolCatalogEntry } from "#composition/tools/service-tool-registry";
import type { AuthContextVariables } from "../../middleware/auth-context.js";

/**
 * Serve the backend tool catalog for the composer tools menu.
 *
 * Mirrors `GET /models`: a static, per-turn-independent list the widget reads
 * once to render toggles. Each entry carries the curated display label and the
 * profile default-enabled flag; the per-turn selection rides back on the chat
 * request as `enabledToolNames`, which core intersects with the turn profile's
 * allowlist (the profile stays the security upper bound).
 */
export const registerToolsRoute = (
  app: Hono<AuthContextVariables>,
  catalog: readonly ServiceToolCatalogEntry[],
) => {
  app.get("/tools", (context) =>
    context.json({
      protocolVersion: SIDECHAT_PROTOCOL_VERSION,
      tools: catalog,
    }),
  );
};
