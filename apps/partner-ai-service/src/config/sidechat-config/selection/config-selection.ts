import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { ServiceConfigError } from "../../service-config-error.js";
import type { ServiceEnv, SideChatConfig } from "../types.js";

export const SIDECHAT_CONFIG_ENV_KEY = "SIDECHAT_CONFIG";
export const SIDECHAT_CONFIG_PATH_ENV_KEY = "SIDECHAT_CONFIG_PATH";
export const DEFAULT_SIDECHAT_CONFIG_NAME = "default";

export type SideChatConfigRegistry = Readonly<Record<string, SideChatConfig>>;

export type SideChatConfigModule = {
  readonly default?: SideChatConfig | undefined;
  readonly SIDECHAT_CONFIGS?: SideChatConfigRegistry | undefined;
};

export type SelectedSideChatConfig = {
  readonly name: string;
  readonly config: SideChatConfig;
};

export const selectSideChatConfig = (
  configModule: SideChatConfigModule,
  env: ServiceEnv = process.env,
): SelectedSideChatConfig => {
  const requestedName = readRequestedConfigName(env);
  const registry = readConfigRegistry(configModule);
  const configName = requestedName ?? DEFAULT_SIDECHAT_CONFIG_NAME;
  const config = registry[configName];
  if (config) return { name: configName, config };

  throw new ServiceConfigError(
    `${SIDECHAT_CONFIG_ENV_KEY} must be one of ${Object.keys(registry).join(", ")}.`,
  );
};

/**
 * Load and select the one config the service boots from — or throw, loudly.
 *
 * The config is the single source of behavior (ADR 0010): there is no fallback
 * system, so a config that cannot load (missing file, syntax error, a throw at
 * module scope) is a fatal boot error naming the module and the reason. A
 * broken config must never silently boot different behavior.
 */
export const loadSelectedSideChatConfig = async (
  env: ServiceEnv = process.env,
): Promise<SelectedSideChatConfig> => {
  const configModuleUrl = readConfigModuleUrl(env);
  let configModule: SideChatConfigModule;
  try {
    configModule = (await import(configModuleUrl)) as SideChatConfigModule;
  } catch (error) {
    throw new ServiceConfigError(
      `Unable to load the SideChat config module at ${configModuleUrl}: ${errorMessage(error)}`,
    );
  }
  return selectSideChatConfig(configModule, env);
};

const readConfigRegistry = (configModule: SideChatConfigModule): SideChatConfigRegistry => {
  if (configModule.SIDECHAT_CONFIGS) return configModule.SIDECHAT_CONFIGS;
  if (configModule.default) return { [DEFAULT_SIDECHAT_CONFIG_NAME]: configModule.default };

  throw new ServiceConfigError(
    "sidechat.config.ts must export SIDECHAT_CONFIGS or a default SideChatConfig.",
  );
};

const readRequestedConfigName = (env: ServiceEnv): string | undefined => {
  const value = env[SIDECHAT_CONFIG_ENV_KEY]?.trim();
  return value ? value : undefined;
};

const readConfigModuleUrl = (env: ServiceEnv): string => {
  const explicitPath = env[SIDECHAT_CONFIG_PATH_ENV_KEY]?.trim();
  if (explicitPath) return pathToFileURL(resolve(explicitPath)).href;

  return new URL("../../../../sidechat.config.ts", import.meta.url).href;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "unknown error";
