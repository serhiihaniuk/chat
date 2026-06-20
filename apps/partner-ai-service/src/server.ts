import { serve } from "@hono/node-server";
import {
  createPartnerAiServiceOptionsFromConfig,
  loadSelectedSideChatConfig,
  readSideChatConfigPort,
  readSideChatDemoSeedConversations,
} from "./config/sidechat-config.js";
import {
  createPartnerAiServiceOptionsFromEnv,
  readDemoSeedConversations,
  readServicePort,
} from "./config/service-config.js";
import { withDemoSeededConversations } from "./demo/demo-conversation-seed.js";
import { createPartnerAiServiceApp, type PartnerAiServiceOptions } from "./inbound/http/app.js";

type ServiceBootConfig = {
  readonly options: PartnerAiServiceOptions;
  readonly port: number;
  readonly seedDemoConversations: boolean;
};

const main = async (): Promise<void> => {
  const bootConfig = await createBootConfig();
  const seededOptions = bootConfig.seedDemoConversations
    ? await withDemoSeededConversations(bootConfig.options)
    : bootConfig.options;
  const app = createPartnerAiServiceApp(seededOptions);

  serve({
    fetch: app.fetch,
    port: bootConfig.port,
  });
};

const createBootConfig = async (): Promise<ServiceBootConfig> => {
  const configResult = await loadSelectedSideChatConfig();
  if (configResult.loaded) {
    const config = configResult.selection.config;
    return {
      options: createPartnerAiServiceOptionsFromConfig(config),
      port: readSideChatConfigPort(config),
      seedDemoConversations: readSideChatDemoSeedConversations(config),
    };
  }

  const options = createPartnerAiServiceOptionsFromEnv();
  return {
    options,
    port: readServicePort(),
    seedDemoConversations: readDemoSeedConversations(),
  };
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
