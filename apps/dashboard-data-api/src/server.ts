import { serve } from "@hono/node-server";

import { createApp } from "./app.js";
import { parseConfig } from "./config.js";
import { createFixtureAdvisoryDashboardReader } from "./fixture-dashboard.js";

const config = parseConfig();
const app = createApp(
  config.DASHBOARD_DATA_SOURCE === "fixture"
    ? { advisoryDashboard: createFixtureAdvisoryDashboardReader() }
    : undefined,
);

serve(
  {
    fetch: app.fetch,
    port: config.PORT,
  },
  (info) => {
    console.log(`dashboard-data-api listening on http://localhost:${info.port}`);
  },
);
