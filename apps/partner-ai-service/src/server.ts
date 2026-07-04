import { serve } from "@hono/node-server";
import { SILENT_DIAGNOSTIC_LOGGER, type DiagnosticLogger } from "@side-chat/shared";
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
  readonly configName: string;
  readonly profile: string;
  readonly port: number;
  readonly seedDemoConversations: boolean;
};

const main = async (): Promise<void> => {
  const bootConfig = await createBootConfig();
  const logger = bootConfig.options.diagnosticLogger ?? SILENT_DIAGNOSTIC_LOGGER;
  const seededOptions = bootConfig.seedDemoConversations
    ? await withDemoSeededConversations(bootConfig.options)
    : bootConfig.options;
  const service = createPartnerAiService(seededOptions);

  const server = serve({
    fetch: service.app.fetch,
    port: bootConfig.port,
  });

  // The boot summary: running the app IS running it with logs. Every field is
  // secret-free (config name, posture, selected provider/model, storage, port).
  logger.info("service ready", {
    config: bootConfig.configName,
    profile: bootConfig.profile,
    provider: service.diagnostics.providerId,
    model: service.diagnostics.modelId,
    persistence: service.diagnostics.persistenceLabel,
    port: bootConfig.port,
  });

  installGracefulShutdown(server, service.shutdown, logger);
};

/**
 * Drain background owners (runner, reaper, listeners) before the process exits.
 *
 * On the first SIGTERM/SIGINT we stop accepting connections and then run the
 * composition shutdown, which interrupts in-flight generation (each turn
 * finalizes through its `onExit`) and tears down the reaper and `LISTEN`
 * dispatchers, so no timer or DB connection is left dangling. Each step speaks
 * through the diagnostic logger so a stuck shutdown is visible, not silent.
 */
const installGracefulShutdown = (
  server: { readonly close: () => void },
  shutdown: () => Promise<void>,
  logger: DiagnosticLogger,
): void => {
  let shuttingDown = false;
  const drain = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down", { signal });
    server.close();
    shutdown()
      .then(() => logger.info("shutdown complete"))
      .catch((error) => logger.error("shutdown failed", { error: errorMessage(error) }))
      .finally(() => process.kill(process.pid, signal));
  };
  process.once("SIGTERM", drain);
  process.once("SIGINT", drain);
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// The config file is the ONE source of behavior (ADR 0010): a config that
// cannot load rejects here with the module path and reason, and `main`'s catch
// prints it and exits non-zero — the service never silently boots without it.
const createBootConfig = async (): Promise<ServiceBootConfig> => {
  const selection = await loadSelectedSideChatConfig();
  const config = selection.config;
  const options = createPartnerAiServiceOptionsFromConfig(config);
  return {
    options,
    configName: selection.name,
    profile: options.auth?.profile ?? "production",
    port: readSideChatConfigPort(config),
    seedDemoConversations: readSideChatDemoSeedConversations(config),
  };
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
