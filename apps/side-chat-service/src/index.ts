import { Hono } from "hono";

import { serverConfig } from "./config/server-config.js";
import healthApp from "./http/app.js";
import compatibilityApp from "./runtime/compatibility-app.js";

// Nitro route entry (nitro.config.ts sends "/**" here). The workflow module's
// /.well-known/workflow/v1/* engine routes are matched before this catch-all.
const app = new Hono();

app.route("/", healthApp);
if (serverConfig.useTestComposition) app.route("/", compatibilityApp);

export default app;
