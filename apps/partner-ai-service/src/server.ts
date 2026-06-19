import { serve } from "@hono/node-server";
import {
  createPartnerAiServiceOptionsFromEnv,
  readDemoSeedConversations,
  readServicePort,
} from "./config/service-config.js";
import { withDemoSeededConversations } from "./demo/demo-conversation-seed.js";
import { createPartnerAiServiceApp } from "./inbound/http/app.js";

const main = async (): Promise<void> => {
  const options = createPartnerAiServiceOptionsFromEnv();
  const seededOptions = readDemoSeedConversations()
    ? await withDemoSeededConversations(options)
    : options;
  const app = createPartnerAiServiceApp(seededOptions);

  serve({
    fetch: app.fetch,
    port: readServicePort(),
  });
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
