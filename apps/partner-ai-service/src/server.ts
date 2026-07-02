import { serve } from "@hono/node-server";
import {
  createPartnerAiServiceOptionsFromConfig,
  loadSelectedSideChatConfig,
  readSideChatConfigPort,
  readSideChatDemoSeedConversations,
} from "./config/sidechat-config.js";
import { withDemoSeededConversations } from "./demo/demo-conversation-seed.js";
import { createPartnerAiService, type PartnerAiServiceOptions } from "./inbound/http/app.js";

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
  const service = createPartnerAiService(seededOptions);

  const server = serve({
    fetch: service.app.fetch,
    port: bootConfig.port,
  });

  installGracefulShutdown(server, service.shutdown);
};

/**
 * Drain background owners (runner, reaper, listeners) before the process exits.
 *
 * On the first SIGTERM/SIGINT we stop accepting connections and then run the
 * composition shutdown, which interrupts in-flight generation (each turn
 * finalizes through its `onExit`) and tears down the reaper and `LISTEN`
 * dispatchers, so no timer or DB connection is left dangling.
 */
const installGracefulShutdown = (
  server: { readonly close: () => void },
  shutdown: () => Promise<void>,
): void => {
  let shuttingDown = false;
  const drain = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.close();
    shutdown()
      .catch((error) => console.error(error))
      .finally(() => process.kill(process.pid, signal));
  };
  process.once("SIGTERM", drain);
  process.once("SIGINT", drain);
};

// The config file is the ONE source of behavior (ADR 0010): a config that
// cannot load rejects here with the module path and reason, and `main`'s catch
// prints it and exits non-zero — the service never silently boots without it.
const createBootConfig = async (): Promise<ServiceBootConfig> => {
  const selection = await loadSelectedSideChatConfig();
  const config = selection.config;
  return {
    options: createPartnerAiServiceOptionsFromConfig(config),
    port: readSideChatConfigPort(config),
    seedDemoConversations: readSideChatDemoSeedConversations(config),
  };
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
