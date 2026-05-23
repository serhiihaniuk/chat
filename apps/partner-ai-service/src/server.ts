import { serve } from "@hono/node-server";
import {
  createPartnerAiServiceOptionsFromEnv,
  readServicePort,
} from "./config/service-config.js";
import { createPartnerAiServiceApp } from "./inbound/http/app.js";

const app = createPartnerAiServiceApp(createPartnerAiServiceOptionsFromEnv());

serve({
  fetch: app.fetch,
  port: readServicePort(),
});
