import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { parseConfig } from "./config.js";

const config = parseConfig();
const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`dashboard-data-api listening on http://localhost:${info.port}`);
  },
);
